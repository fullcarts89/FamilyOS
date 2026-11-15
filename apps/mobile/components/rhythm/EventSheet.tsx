import {
  describeSchedule,
  type CalendarRule,
  type CareAction,
  type Weekday,
} from '@familyos/domain';
import {
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button, IconButton, type PressState } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { Field } from '../../design/Field';
import { Skeleton, SkeletonBlock } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { Toggle } from '../../design/Toggle';
import { useToast } from '../../design/Toast';
import { color, font, radius } from '../../design/tokens';
import { api, errorMessage, type EventDetail, type Occurrence } from '../../lib/api';
import { addDays, clock, dayOfWeek, longDate, relativeDay } from '../../lib/dates';
import { eventBody, loadEvent, useOccurrenceActions, type EventDraft } from '../../lib/events';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { CARE_VERB, localParts, rangeOf } from '../../lib/rhythm';

export type EventTarget =
  { mode: 'new'; date: string; care?: boolean } | { mode: 'occurrence'; occurrence: Occurrence };

type Repeat = 'none' | 'weekdays' | 'weekly' | 'custom';
type CustomFreq = 'daily' | 'weekly' | 'monthly';

const WEEKDAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];

/** "8:15", "8:15am", "5pm", "17:30" → "HH:MM", or null. */
export function parseTime(input: string): string | null {
  const m = input
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const suffix = m[3];
  if (min > 59 || h > 23) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    if (suffix.startsWith('p') && h < 12) h += 12;
    if (suffix.startsWith('a') && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const shift = (hhmm: string, minutes: number) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 45, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

function repeatOf(rule: CalendarRule | null): Repeat {
  if (!rule) return 'none';
  if (rule.freq === 'weekly' && rule.interval === 1) {
    const d = [...rule.weekdays].sort().join(',');
    if (d === '1,2,3,4,5') return 'weekdays';
    if (rule.weekdays.length === 1) return 'weekly';
  }
  return 'custom';
}

/**
 * Add or change an event in a small, friendly sheet: what, when, who, whether it repeats, and only
 * if it's a drop-off or pickup, who it's for and where. Opening an occurrence shows it first, with
 * the one-off moves (someone covers it, skip it); imported events are read-only, with their
 * calendar's name.
 */
export function EventSheet({
  target,
  today,
  onClose,
  onChanged,
}: {
  target: EventTarget | null;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const visible = target !== null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      label={target?.mode === 'new' ? 'New event' : 'Event'}
      title={
        target?.mode === 'new'
          ? 'New event'
          : target?.occurrence.readOnly
            ? 'From a connected calendar'
            : 'Event'
      }
      width={600}
    >
      {target ? (
        <EventSheetBody
          key={target.mode === 'new' ? `new:${target.date}` : target.occurrence.key}
          target={target}
          today={today}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </Sheet>
  );
}

function EventSheetBody({
  target,
  today,
  onClose,
  onChanged,
}: {
  target: EventTarget;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { household } = useHousehold();
  const [series, setSeries] = useState<EventDetail | null>(null);
  const [editing, setEditing] = useState(target.mode === 'new');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (target.mode !== 'occurrence' || !household) return;
    let alive = true;
    loadEvent(household.id, target.occurrence.eventId)
      .then((e) => alive && setSeries(e))
      .catch((caught) => alive && setLoadError(errorMessage(caught)));
    return () => {
      alive = false;
    };
  }, [target, household]);

  if (target.mode === 'occurrence' && !editing) {
    return (
      <OccurrenceView
        occurrence={target.occurrence}
        series={series}
        loadError={loadError}
        today={today}
        onEdit={() => setEditing(true)}
        onClose={onClose}
        onChanged={onChanged}
      />
    );
  }
  if (target.mode === 'occurrence' && !series) {
    return (
      <Skeleton>
        <SkeletonBlock height={48} />
      </Skeleton>
    );
  }
  return (
    <EventForm
      series={target.mode === 'occurrence' ? series : null}
      date={target.mode === 'new' ? target.date : target.occurrence.date}
      startCare={target.mode === 'new' && !!target.care}
      today={today}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

// -----------------------------------------------------------------------------------------------

function OccurrenceView({
  occurrence: o,
  series,
  loadError,
  today,
  onEdit,
  onClose,
  onChanged,
}: {
  occurrence: Occurrence;
  series: EventDetail | null;
  loadError: string | null;
  today: string;
  onEdit: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { timeZone } = useHousehold();
  const people = usePeople();
  const [busy, setBusy] = useState<string | null>(null);
  const actions = useOccurrenceActions(onChanged);
  const who = o.memberIds.map((id) => people.byId(id)).filter((p): p is Person => !!p);
  const child = people.byId(o.careMemberId);
  const adults = who.filter((p) => !p.caredFor);
  const replaced = (o.cover?.replacedMemberIds ?? [])
    .map((id) => people.byId(id))
    .filter((p): p is Person => !!p);
  const coverOptions = people.adults.filter((p) => !adults.some((a) => a.id === p.id));
  const exception = series?.exceptions.find((e) => e.date === o.date);

  const run = async (label: string, fn: () => Promise<boolean>) => {
    setBusy(label);
    const ok = await fn();
    setBusy(null);
    if (ok) onClose();
  };

  return (
    <View style={styles.view}>
      <View style={styles.viewHead}>
        <Text variant="chapter">{o.title}</Text>
        <Text variant="body" tone="muted">
          {relativeDay(o.date, today) === longDate(o.date) ? '' : `${relativeDay(o.date, today)}, `}
          {longDate(o.date)}
          {o.allDay ? ' · all day' : ` · ${rangeOf(o.startsAt, o.endsAt, timeZone)}`}
        </Text>
      </View>

      {o.readOnly && o.source ? (
        <View style={styles.imported}>
          <CalendarDays size={16} color={color.ink} strokeWidth={2.2} />
          <Text variant="meta" style={styles.importedText}>
            From the {o.source.label} calendar. FamilyOS shows it; change it in that calendar and it
            updates here.
          </Text>
        </View>
      ) : null}

      <View style={styles.facts}>
        {child && o.careAction ? (
          <Fact icon={<Car size={16} color={child.color} strokeWidth={2.2} />}>
            {child.name}’s {CARE_VERB[o.careAction]}
            {o.carePlace ? ` at ${o.carePlace}` : ''}
          </Fact>
        ) : null}
        <Fact
          icon={
            <View style={styles.avatars}>
              {who.slice(0, 4).map((p) => (
                <Avatar key={p.id} person={p} size={20} />
              ))}
            </View>
          }
        >
          {adults.length === 0 && child
            ? 'Nobody is down for it yet'
            : who.map((p) => (p.isMe ? 'You' : p.name)).join(', ')}
          {o.cover && replaced.length > 0
            ? ` (covering for ${replaced.map((p) => (p.isMe ? 'you' : p.name)).join(' and ')})`
            : ''}
        </Fact>
        {o.location && o.location !== o.carePlace ? (
          <Fact icon={<MapPin size={16} color={color.muted} strokeWidth={2.2} />}>
            {o.location}
          </Fact>
        ) : null}
        {series?.summary ? (
          <Fact icon={<Repeat2 size={16} color={color.muted} strokeWidth={2.2} />}>
            {series.summary}
          </Fact>
        ) : null}
        {o.notes ? (
          <Text variant="body" tone="muted" style={styles.notes}>
            {o.notes}
          </Text>
        ) : null}
      </View>

      {loadError ? <ErrorNotice message={loadError} /> : null}

      {!o.readOnly ? (
        <View style={styles.oneOff}>
          {o.recurring || o.careMemberId ? (
            <Text variant="kicker" tone="muted">
              Just this {o.recurring ? 'one' : 'time'}
            </Text>
          ) : null}
          <View style={styles.chips}>
            {exception ? (
              <Button
                title={exception.kind === 'skip' ? 'Put it back' : 'Back to the usual'}
                variant="secondary"
                size="sm"
                busy={busy === 'restore'}
                onPress={() =>
                  void run('restore', async () => {
                    await actions.restore(o.eventId, o.date);
                    return true;
                  })
                }
              />
            ) : (
              <>
                {coverOptions.map((p) => (
                  <Button
                    key={p.id}
                    title={p.isMe ? 'I’ll cover it' : `Ask ${p.name} to cover`}
                    variant={adults.length === 0 || p.isMe ? 'primary' : 'secondary'}
                    size="sm"
                    busy={busy === p.id}
                    onPress={() => void run(p.id, () => actions.cover(o, p.id, { today }))}
                  />
                ))}
                {o.recurring ? (
                  <Button
                    title="Skip this one"
                    variant="quiet"
                    size="sm"
                    busy={busy === 'skip'}
                    onPress={() => void run('skip', () => actions.skip(o))}
                  />
                ) : null}
              </>
            )}
          </View>
        </View>
      ) : null}

      {!o.readOnly ? (
        <View style={styles.viewFoot}>
          <Button
            title={o.recurring ? 'Edit the series' : 'Edit'}
            icon={Pencil}
            variant="secondary"
            onPress={onEdit}
            disabled={!series}
          />
        </View>
      ) : null}
    </View>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>{icon}</View>
      <Text variant="body" style={styles.factText}>
        {children}
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------------------------------------

function EventForm({
  series,
  date: initialDate,
  startCare,
  today,
  onClose,
  onChanged,
}: {
  series: EventDetail | null;
  date: string;
  startCare: boolean;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const recurringEdit = !!series?.recurrence;

  const initial = (): EventDraft => {
    if (series) {
      const s = localParts(series.startsAt, timeZone);
      const e = localParts(series.endsAt, timeZone);
      const hh = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return {
        title: series.title,
        date: recurringEdit ? series.startsOn : initialDate,
        allDay: series.allDay,
        start: hh(s.minutes),
        end: hh(e.minutes),
        memberIds: series.memberIds.filter((id) => id !== series.careMemberId),
        recurrence: series.recurrence,
        care:
          series.careMemberId && series.careAction
            ? {
                memberId: series.careMemberId,
                action: series.careAction,
                place: series.carePlace ?? '',
              }
            : null,
        location: series.location ?? '',
        notes: series.notes ?? '',
      };
    }
    const nowMin = localParts(new Date(), timeZone).minutes;
    const startH = initialDate === today ? Math.min(21, Math.floor(nowMin / 60) + 1) : 9;
    const start = `${String(startH).padStart(2, '0')}:00`;
    const child = people.caredFor.find((p) => p.role === 'child') ?? people.caredFor[0];
    return {
      title: '',
      date: initialDate,
      allDay: false,
      start,
      end: shift(start, 60),
      memberIds: people.me ? [people.me.id] : [],
      recurrence: null,
      care: startCare && child ? { memberId: child.id, action: 'pick_up', place: '' } : null,
      location: '',
      notes: '',
    };
  };

  const [draft, setDraft] = useState<EventDraft>(initial);
  const [repeat, setRepeat] = useState<Repeat>(repeatOf(draft.recurrence));
  const [freq, setFreq] = useState<CustomFreq>(
    draft.recurrence?.freq === 'daily'
      ? 'daily'
      : draft.recurrence?.freq === 'monthly'
        ? 'monthly'
        : 'weekly',
  );
  const [interval, setEvery] = useState(
    draft.recurrence && 'interval' in draft.recurrence ? draft.recurrence.interval : 1,
  );
  const [days, setDays] = useState<Weekday[]>(
    draft.recurrence?.freq === 'weekly'
      ? draft.recurrence.weekdays
      : [dayOfWeek(draft.date) as Weekday],
  );
  const [more, setMore] = useState(!!(draft.location || draft.notes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const dow = dayOfWeek(draft.date) as Weekday;
  const rule: CalendarRule | null =
    repeat === 'none'
      ? null
      : repeat === 'weekdays'
        ? { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }
        : repeat === 'weekly'
          ? { freq: 'weekly', interval: 1, weekdays: [dow] }
          : freq === 'daily'
            ? { freq: 'daily', interval }
            : freq === 'monthly'
              ? { freq: 'monthly', interval, dayOfMonth: Number(draft.date.slice(8, 10)) }
              : { freq: 'weekly', interval, weekdays: days.length ? days : [dow] };

  const toggleMember = (id: string) =>
    set({
      memberIds: draft.memberIds.includes(id)
        ? draft.memberIds.filter((m) => m !== id)
        : [...draft.memberIds, id],
    });
  const adults = people.adults;
  const cared = people.caredFor;
  const valid = draft.title.trim().length > 0 && (draft.allDay || draft.end >= draft.start);
  const careOk = !draft.care || !!draft.care.memberId;

  const save = async () => {
    if (!household || !valid || !careOk) return;
    setBusy(true);
    setError(null);
    const body = eventBody({ ...draft, recurrence: rule }, timeZone);
    try {
      if (series) {
        await api(`/households/${household.id}/events/${series.id}`, {
          method: 'PATCH',
          body: { expectedVersion: series.version, ...body },
        });
        toast.show(`Saved: ${body.title}`, { detail: rule ? describeSchedule(rule) : undefined });
      } else {
        await api(`/households/${household.id}/events`, { method: 'POST', body });
        toast.show(`Added: ${body.title}`, {
          detail: rule
            ? describeSchedule(rule)
            : `${relativeDay(draft.date, today)}${draft.allDay ? '' : ` at ${clock(draft.start)}`}`,
        });
      }
      onChanged();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!household || !series) return;
    setBusy(true);
    try {
      await api(
        `/households/${household.id}/events/${series.id}?expectedVersion=${series.version}`,
        {
          method: 'DELETE',
        },
      );
      toast.show(`Removed: ${series.title}`);
      onChanged();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Field
        label="What’s happening?"
        value={draft.title}
        onChangeText={(title) => set({ title })}
        placeholder={draft.care ? 'Daycare pickup' : 'Dentist'}
        autoFocus={!series}
        maxLength={200}
        returnKeyType="done"
      />

      <Group label="When">
        {recurringEdit ? (
          <Text variant="meta" tone="muted">
            Changes apply to the whole series, which started{' '}
            {longDate(series?.startsOn ?? draft.date)}.
          </Text>
        ) : (
          <View style={styles.dateRow}>
            <IconButton
              icon={ChevronLeft}
              label="Day before"
              variant="outline"
              size={36}
              onPress={() => set({ date: addDays(draft.date, -1) })}
            />
            <Text variant="label" style={styles.dateText}>
              {relativeDay(draft.date, today, { late: false })}
              {relativeDay(draft.date, today, { late: false }).includes(' ')
                ? ''
                : `, ${longDate(draft.date).split(', ')[1]}`}
            </Text>
            <IconButton
              icon={ChevronRight}
              label="Day after"
              variant="outline"
              size={36}
              onPress={() => set({ date: addDays(draft.date, 1) })}
            />
          </View>
        )}
        <View style={styles.chips}>
          <Chip label="At a time" selected={!draft.allDay} onPress={() => set({ allDay: false })} />
          <Chip label="All day" selected={draft.allDay} onPress={() => set({ allDay: true })} />
        </View>
        {!draft.allDay ? (
          <View style={styles.times}>
            <TimeField
              label="Starts"
              value={draft.start}
              onChange={(start) =>
                set({ start, end: draft.end <= start ? shift(start, 30) : draft.end })
              }
            />
            <TimeField label="Ends" value={draft.end} onChange={(end) => set({ end })} />
          </View>
        ) : null}
        {!draft.allDay && draft.end < draft.start ? (
          <Text variant="meta" tone="danger">
            It needs to end after it starts.
          </Text>
        ) : null}
      </Group>

      <Group label="Who">
        <View style={styles.chips}>
          {[...adults, ...cared.filter((c) => c.id !== draft.care?.memberId)].map((p) => (
            <Chip
              key={p.id}
              label={p.isMe ? 'You' : p.name}
              accent={p.color}
              selected={draft.memberIds.includes(p.id)}
              leading={<Avatar person={p} size={18} />}
              onPress={() => toggleMember(p.id)}
            />
          ))}
        </View>
      </Group>

      <Group label="Repeats">
        <View style={styles.chips}>
          {(
            [
              ['none', 'Doesn’t repeat'],
              ['weekdays', 'Weekdays'],
              [
                'weekly',
                `Every ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dow - 1]}`,
              ],
              ['custom', 'Custom'],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} label={label} selected={repeat === k} onPress={() => setRepeat(k)} />
          ))}
        </View>
        {repeat === 'custom' ? (
          <View style={styles.custom}>
            <View style={styles.chips}>
              {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                <Chip
                  key={f}
                  label={f === 'daily' ? 'Days' : f === 'weekly' ? 'Weeks' : 'Months'}
                  selected={freq === f}
                  onPress={() => setFreq(f)}
                />
              ))}
            </View>
            <View style={styles.stepper}>
              <IconButton
                icon={Minus}
                label="Less often"
                variant="outline"
                size={36}
                disabled={interval <= 1}
                onPress={() => setEvery(Math.max(1, interval - 1))}
              />
              <Text variant="label" style={styles.stepLabel}>
                Every {interval === 1 ? '' : `${interval} `}
                {freq === 'daily' ? 'day' : freq === 'weekly' ? 'week' : 'month'}
                {interval === 1 ? '' : 's'}
              </Text>
              <IconButton
                icon={Plus}
                label="More often"
                variant="outline"
                size={36}
                disabled={interval >= 12}
                onPress={() => setEvery(Math.min(12, interval + 1))}
              />
            </View>
            {freq === 'weekly' ? (
              <View style={styles.chips}>
                {WEEKDAYS.map((w) => (
                  <Chip
                    key={w.day}
                    label={w.label}
                    selected={days.includes(w.day)}
                    onPress={() =>
                      setDays(
                        days.includes(w.day) ? days.filter((d) => d !== w.day) : [...days, w.day],
                      )
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {rule ? (
          <Text variant="meta" tone="muted">
            {describeSchedule(rule)}
            {draft.allDay ? '' : `, ${clock(draft.start)}–${clock(draft.end)}`}
          </Text>
        ) : null}
      </Group>

      <View style={styles.careToggle}>
        <Car size={18} color={color.ink} strokeWidth={2.2} />
        <View style={styles.careText}>
          <Text variant="title">This is a drop-off or pickup</Text>
          <Text variant="meta" tone="muted">
            Shows who has {cared[0]?.name ?? 'them'} and where, and flags clashes.
          </Text>
        </View>
        <Toggle
          label="This is a drop-off or pickup"
          value={!!draft.care}
          disabled={cared.length === 0}
          onValueChange={(on) =>
            set({
              care:
                on && cared[0]
                  ? { memberId: cared[0].id, action: 'pick_up', place: draft.location }
                  : null,
            })
          }
        />
      </View>
      {draft.care ? (
        <View style={styles.careFields}>
          <View style={styles.chips}>
            {cared.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                accent={p.color}
                selected={draft.care?.memberId === p.id}
                leading={<Avatar person={p} size={18} />}
                onPress={() =>
                  draft.care &&
                  set({
                    care: { ...draft.care, memberId: p.id },
                    memberIds: draft.memberIds.filter((m) => m !== p.id),
                  })
                }
              />
            ))}
          </View>
          <View style={styles.chips}>
            {(['drop_off', 'pick_up'] as CareAction[]).map((a) => (
              <Chip
                key={a}
                label={a === 'drop_off' ? 'Drop-off' : 'Pickup'}
                selected={draft.care?.action === a}
                onPress={() => draft.care && set({ care: { ...draft.care, action: a } })}
              />
            ))}
          </View>
          <Field
            label="Where"
            value={draft.care.place}
            onChangeText={(place) => draft.care && set({ care: { ...draft.care, place } })}
            placeholder="Little Oaks"
            maxLength={120}
          />
          {draft.memberIds.filter((id) => !people.byId(id)?.caredFor).length === 0 ? (
            <Text variant="meta" tone="muted">
              Nobody is down for it yet: it’ll show as needing someone.
            </Text>
          ) : null}
        </View>
      ) : null}

      {more ? (
        <>
          {!draft.care ? (
            <Field
              label="Where"
              value={draft.location}
              onChangeText={(location) => set({ location })}
              placeholder="Hawthorne Dental"
              maxLength={200}
            />
          ) : null}
          <Field
            label="Notes"
            value={draft.notes}
            onChangeText={(notes) => set({ notes })}
            multiline
            maxLength={2000}
            placeholder="Bring the insurance card"
          />
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setMore(true)}
          style={(s: PressState) => [styles.more, s.hovered && { opacity: 0.7 }]}
        >
          <Plus size={15} color={color.ink} strokeWidth={2.4} />
          <Text variant="label">Add a place or a note</Text>
        </Pressable>
      )}

      {error ? <ErrorNotice message={error} /> : null}

      <View style={styles.actions}>
        <Button
          title={series ? 'Save changes' : 'Add to the week'}
          onPress={save}
          busy={busy}
          disabled={!valid || !careOk}
        />
        <Button title="Cancel" variant="quiet" onPress={onClose} />
        <View style={styles.spacer} />
        {series ? (
          confirmDelete ? (
            <Button
              title={series.recurrence ? 'Remove every one' : 'Yes, remove it'}
              variant="secondary"
              size="sm"
              onPress={remove}
            />
          ) : (
            <IconButton
              icon={Trash2}
              label="Remove this event"
              onPress={() => setConfirmDelete(true)}
            />
          )
        ) : null}
      </View>
    </View>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(clock(value));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(clock(value)), [value]);
  const commit = () => {
    const parsed = parseTime(text);
    if (parsed) {
      setBad(false);
      onChange(parsed);
      setText(clock(parsed));
    } else setBad(true);
  };
  return (
    <View style={styles.timeField}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <View style={styles.timeRow}>
        <IconButton
          icon={Minus}
          label={`${label} 15 minutes earlier`}
          variant="outline"
          size={34}
          onPress={() => onChange(shift(value, -15))}
        />
        <TextInput
          accessibilityLabel={`${label} time`}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          style={[styles.timeInput, bad && styles.timeBad]}
          inputMode="text"
          autoCapitalize="none"
        />
        <IconButton
          icon={Plus}
          label={`${label} 15 minutes later`}
          variant="outline"
          size={34}
          onPress={() => onChange(shift(value, 15))}
        />
      </View>
    </View>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="kicker" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: 16, paddingBottom: 8 },
  viewHead: { gap: 4 },
  imported: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line2,
  },
  importedText: { flex: 1 },
  facts: { gap: 10 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  factIcon: { width: 44, alignItems: 'flex-start' },
  factText: { flex: 1 },
  avatars: { flexDirection: 'row', gap: 2 },
  notes: { marginTop: 2 },
  oneOff: { gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: color.hairline },
  viewFoot: { flexDirection: 'row', gap: 8 },
  form: { gap: 18, paddingBottom: 8 },
  group: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { minWidth: 170, textAlign: 'center' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  timeField: { gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: {
    width: 92,
    height: 40,
    borderWidth: 1.5,
    borderColor: color.line2,
    borderRadius: radius.md,
    textAlign: 'center',
    fontFamily: font.uiSemi,
    fontSize: 15.5,
    color: color.ink,
    backgroundColor: color.surface,
  },
  timeBad: { borderColor: color.danger },
  custom: { gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLabel: { minWidth: 130, textAlign: 'center' },
  careToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.hairline,
  },
  careText: { flex: 1 },
  careFields: { gap: 12, marginTop: -6 },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    alignSelf: 'flex-start',
    cursor: 'pointer',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  spacer: { flex: 1 },
});
