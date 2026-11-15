-- Family Rhythm: member identity (color, species, note), versioned member edits, and the child
-- or pet a task or routine is about (plan "Data additions": Members).

-- Children and pets are named members without accounts; everyone else signs in.
alter table app.member drop constraint member_account_matches_role;
alter table app.member add constraint member_account_matches_role
  check ((role in ('child', 'pet')) = (user_id is null));

-- Each member's own color is the color system for lanes, avatars and ownership.
alter table app.member
  add column color text check (color ~ '^#[0-9A-F]{6}$'),
  -- Pets only, e.g. 'Dog'.
  add column species text check (char_length(species) between 1 and 40),
  -- A short line shown with the member, e.g. 'Sunflower room at Little Oaks'.
  add column note text check (char_length(note) between 1 and 200),
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add constraint member_species_pets_only check (species is null or role = 'pet');

-- The palette new members get colors from, in order. A member can change theirs later.
create or replace function app.member_palette() returns text[]
  language sql immutable
  as $$ select array['#D2553F', '#2F6FB3', '#D99A1C', '#6B8E5A', '#8A5FA8', '#C2577E',
                     '#3E8E8A', '#8A6A4F'] $$;

-- Without a color, a new member gets the first palette color no active member of the household
-- has yet (or, once all are taken, the next one round the palette).
create or replace function app.assign_member_color() returns trigger
  language plpgsql
  as $$
declare
  v_palette text[] := app.member_palette();
  v_color text;
  v_count integer;
begin
  if new.color is not null then
    return new;
  end if;
  select c into v_color
    from unnest(v_palette) with ordinality as p (c, n)
    where not exists (
      select 1 from app.member m
      where m.household_id = new.household_id and m.status = 'active' and m.color = p.c
    )
    order by p.n
    limit 1;
  if v_color is null then
    select count(*) into v_count from app.member m where m.household_id = new.household_id;
    v_color := v_palette[1 + v_count % array_length(v_palette, 1)];
  end if;
  new.color := v_color;
  return new;
end
$$;

grant execute on function app.member_palette() to familyos_api;

create trigger member_default_color
  before insert on app.member
  for each row execute function app.assign_member_color();

-- Existing members get palette colors in the order they joined.
update app.member m
  set color = (app.member_palette())[1 + (r.n - 1) % 8]
  from (
    select id, row_number() over (partition by household_id order by created_at, id) as n
    from app.member
  ) r
  where r.id = m.id and m.color is null;

alter table app.member alter column color set not null;

-- Tasks and routines are owned by adults; the subject is the child or pet one is about
-- ("Biscuit's flea meds"). Same household, enforced by the composite key.
alter table app.work_item
  add column subject_member_id uuid,
  add constraint work_item_subject_same_household
    foreign key (household_id, subject_member_id) references app.member (household_id, id);

create index work_item_subject on app.work_item (household_id, subject_member_id)
  where subject_member_id is not null;

create or replace function app.check_work_item_subject() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  if new.subject_member_id is null then
    return new;
  end if;
  select role into v_role from app.member
    where id = new.subject_member_id and household_id = new.household_id;
  if v_role is null or v_role not in ('child', 'pet') then
    raise exception 'subject must be a child or pet' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger work_item_subject_rules
  before insert or update of subject_member_id on app.work_item
  for each row execute function app.check_work_item_subject();
