/**
 * What each household role may do (PRD WF-05). Deterministic: the API checks these before
 * any write, and row-level security limits what each request can see at all.
 * Caregiver scope is minimal until M5 defines assigned-item access.
 */
export const MEMBER_ROLES = ['owner', 'adult', 'caregiver', 'child', 'pet'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Members without accounts, whom the household looks after. They own nothing and never sign in. */
export const CARED_FOR_ROLES = ['child', 'pet'] as const satisfies readonly MemberRole[];
export const isCaredFor = (role: MemberRole): boolean =>
  (CARED_FOR_ROLES as readonly MemberRole[]).includes(role);

/**
 * The roles that hold an account, so can own tasks and take routine turns. An allow-list on
 * purpose: a role this code doesn't know (one a later release adds, say) is never treated as
 * an adult, here or after a rollback.
 */
export const ASSIGNABLE_ROLES = [
  'owner',
  'adult',
  'caregiver',
] as const satisfies readonly MemberRole[];

/** True only for a role in ASSIGNABLE_ROLES. Takes any string, since the database may know more. */
export const isAssignableRole = (role: string): boolean =>
  (ASSIGNABLE_ROLES as readonly string[]).includes(role);

export const ACTIONS = [
  'household.read',
  /** Rename the household (first-time setup and later). */
  'household.update',
  'member.invite',
  'member.remove',
  'member.add_child',
  'member.add_pet',
  /** Edit a member's name, color, note and (pets) species: children, pets, and yourself. */
  'member.update',
  'work_item.read',
  'work_item.create',
  'work_item.update',
  'work_item.comment',
  'routine.manage',
  'household.export',
  'event.read',
  'event.manage',
  /** Add, change, remove and sync read-only calendar subscriptions. */
  'calendar.manage',
  /** Household decisions are between the adults: reading, voting and deciding. */
  'decision.read',
  'decision.manage',
  /** Meals and the grocery list. */
  'meal.read',
  'meal.manage',
  /** Key contacts (pediatrician, vet, plumber). */
  'contact.read',
  'contact.manage',
  /** Monarch budget snapshots: category-level numbers only. */
  'budget.read',
  'budget.import',
  /** The Weekly Reset session and committing its plan. */
  'reset.run',
  /** Who's in town: members' away periods and visitors. */
  'presence.read',
  /** Add, change and remove away periods and visitors, and hand an away member's work over. */
  'presence.manage',
] as const;
export type Action = (typeof ACTIONS)[number];

const GRANTS: Readonly<Record<MemberRole, readonly Action[]>> = {
  owner: ACTIONS,
  adult: [
    'household.read',
    'household.update',
    'member.add_child',
    'member.add_pet',
    'member.update',
    'work_item.read',
    'work_item.create',
    'work_item.update',
    'work_item.comment',
    'routine.manage',
    'household.export',
    'event.read',
    'event.manage',
    'calendar.manage',
    'decision.read',
    'decision.manage',
    'meal.read',
    'meal.manage',
    'contact.read',
    'contact.manage',
    'budget.read',
    'budget.import',
    'reset.run',
    'presence.read',
    'presence.manage',
  ],
  // A sitter sees the household's schedule so they know who is where, what's for dinner, whom
  // to call and who's away or visiting. Never the adults' own calendars, decisions, budgets or
  // weekly plan.
  caregiver: [
    'household.read',
    'work_item.read',
    'event.read',
    'meal.read',
    'contact.read',
    'presence.read',
  ],
  // Children and pets have no account, so they never make requests.
  child: [],
  pet: [],
};

export const can = (role: MemberRole, action: Action): boolean => GRANTS[role].includes(action);
