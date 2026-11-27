import { DURATION_CHOICES, dueOptions, durationLabel, localInstant } from '@familyos/domain';
import {
  CalendarDays,
  Clock,
  CornerDownLeft,
  Flag,
  FolderKanban,
  Inbox,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { api, errorMessage, type TodayResponse, type WorkItem } from '../lib/api';
import { parseCapture, withoutWords } from '../lib/capture-parse';
import { TIME_CHOICES, clock, clockRange, parseTime } from '../lib/dates';
import { useHousehold } from '../lib/household';
import { usePeople, type Person } from '../lib/people';
import { localParts } from '../lib/rhythm';
import { Avatar, Either } from './Avatar';
import { Button, type PressState } from './Button';
import { Chip, TagChip } from './Chip';
import { DateCalendar, DateChip, pickedDateLabel, useDateDropdown } from './DatePicker';
import { useLayout } from './layout';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useToast } from './Toast';
import { color, em, font, radius } from './tokens';

/**
 * Quick capture with a live preview: type "Call the plumber tomorrow @sam #bathroom" and see the
 * day, project and whose list it lands on before adding it; "Walk Biscuit at 5:30pm for 30 min"
 * blocks out today 5:30–6pm. "Add a time" does the same by tapping: a time (or another one typed)
 * and how long it takes. Nothing is guessed by AI.
 */
export function CaptureSheet({
  initialOwner,
  onClose,
  onCreated,
  visible = true,
  onExited,
  onSaved,
}: {
  /** undefined: me; null: either of you; else a member id. */
  initialOwner: string | null | undefined;
  onClose: () => void;
  onCreated: () => void;
  visible?: boolean;
  /** After the sheet's exit fade. */
  onExited?: () => void;
  /** After a successful save (before the sheet closes). */
  onSaved?: () => void;
}) {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { phone } = useLayout();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [raw, setRaw] = useState('');
  const [picked, setPicked] = useState<string | null>(
    initialOwner === undefined ? (people.me?.id ?? null) : initialOwner,
  );
  const [pickedDue, setPickedDue] = useState<string | null>(null);
  // "Pick a date": a specific day from the calendar, when the quick days aren't it.
  const dates = useDateDropdown();
  // "Add a time": the row is open; the time tapped, or another one typed; and how long.
  const [timeOpen, setTimeOpen] = useState(false);
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [otherTime, setOtherTime] = useState('');
  const [pickedLength, setPickedLength] = useState<number | null>(null);
  const [project, setProject] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [projects, setProjects] = useState<WorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One save at a time: Enter pressed again (or the button) while saving does nothing.
  const saving = useRef(false);
  // One id per capture, reused if it's retried, so the API makes it once (POST /work-items).
  const clientId = useRef(newClientId()).current;

  useEffect(() => {
    if (!household) return;
    const base = `/households/${household.id}`;
    api<TodayResponse>(`${base}/today`)
      .then((t) => setToday(t.date))
      .catch(() => setToday(null));
    api<{ items: WorkItem[] }>(`${base}/work-items`)
      .then((r) =>
        setProjects(
          r.items.filter(
            (i) => i.type === 'project' && !['verified_complete', 'done_unverified'].includes(i.status),
          ),
        ),
      )
      .catch(() => setProjects([]));
    const focus = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(focus);
  }, [household]);

  const parsed = useMemo(
    () =>
      parseCapture(
        raw,
        today,
        people.assignable.map((p) => ({ id: p.id, name: p.name, isMe: p.isMe })),
        projects.map((p) => ({ id: p.id, title: p.title })),
      ),
    [raw, today, people.assignable, projects],
  );

  // A name typed in the text ("@sam", "for us") wins over the tapped target.
  const owner = parsed.ownerId !== undefined ? parsed.ownerId : picked;
  const dueOn = parsed.dueOn ?? pickedDue;
  const quickDays = today ? dueOptions(today) : [];
  const dayLabel =
    parsed.dueLabel ??
    (pickedDue && today
      ? (quickDays.find((o) => o.date === pickedDue)?.label ?? pickedDateLabel(pickedDue, today))
      : null);
  // A day picked from the calendar that isn't one of the quick days: the date chip shows it.
  const otherDay =
    !parsed.dueOn && pickedDue && !quickDays.some((o) => o.date === pickedDue) ? pickedDue : null;
  // A day tapped (or picked) replaces one typed in the text, like a tapped time or list does.
  const pickDay = (date: string | null) => {
    if (parsed.dayWords) setRaw((r) => withoutWords(r, parsed.dayWords));
    setPickedDue(date);
  };
  // A time typed in the text wins over the picked one (tapping or typing a time below replaces
  // it). Projects have no time of day, so a picked one is set aside while "Project" is on.
  const otherTyped = otherTime.trim();
  const otherParsed = otherTyped ? parseTime(otherTyped) : null;
  const timeBad = !parsed.time && !!otherTyped && !otherParsed;
  const picked24 = project ? null : otherTyped ? otherParsed : pickedTime;
  const time = parsed.time ?? picked24;
  const length = time ? (parsed.durationMinutes ?? (project ? null : pickedLength)) : null;
  // A time lands on the day (or today) at that time, with its length if it has one.
  const timed = time
    ? {
        date: dueOn ?? today ?? localParts(new Date(), timeZone).date,
        time,
        range: clockRange(time, length),
      }
    : null;
  // Typed time words give way to a time picked below; their length carries over.
  const dropTypedTime = () => {
    if (!parsed.time) return;
    if (parsed.durationMinutes) setPickedLength(parsed.durationMinutes);
    setRaw((r) => withoutWords(r, parsed.timeWords, parsed.lengthWords));
  };
  const pickTime = (value: string) => {
    dropTypedTime();
    setOtherTime('');
    setPickedTime(value);
  };
  // Typing here (even clearing a typed time it shows) makes this field the time.
  const typeOtherTime = (text: string) => {
    dropTypedTime();
    setOtherTime(text);
  };
  const pickLength = (minutes: number | null) => {
    if (parsed.durationMinutes) setRaw((r) => withoutWords(r, parsed.lengthWords));
    setPickedLength(minutes);
  };
  // A typed time that isn't one of the chips shows in the "Other" field, ready to change.
  const otherValue =
    parsed.time && !TIME_CHOICES.includes(parsed.time) ? clock(parsed.time) : otherTime;
  const clearTime = () => {
    if (parsed.time) setRaw((r) => withoutWords(r, parsed.timeWords, parsed.lengthWords));
    setPickedTime(null);
    setOtherTime('');
    setPickedLength(null);
    setTimeOpen(false);
  };
  const dueLabel = timed ? `${dayLabel ?? 'Today'} ${timed.range}` : dayLabel;
  const inProject = projects.find((p) => p.id === parsed.projectId) ?? null;
  const ownerPerson = people.byId(owner);
  const targets: (Person | null)[] = [...people.assignable.slice(0, phone ? 2 : 3), null];

  const save = async (inbox: boolean) => {
    if (!household || !parsed.title || timeBad || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const { item } = await api<{ item: WorkItem }>(`/households/${household.id}/work-items`, {
        method: 'POST',
        body: {
          clientId,
          title: parsed.title,
          type: project ? 'project' : 'task',
          inbox,
          ownerMemberId: owner,
          ...(timed
            ? {
                dueAt: localInstant(timed.date, timed.time, timeZone).toString(),
                durationMinutes: length,
              }
            : { dueOn }),
          ...(inProject && !project && { parentId: inProject.id }),
          ...(parsed.important && { priority: 1 }),
        },
      });
      saved = true;
      onCreated();
      onSaved?.();
      onClose();
      const where = inbox
        ? 'the inbox'
        : owner === null
          ? 'Shared'
          : ownerPerson?.isMe
            ? 'your list'
            : `${ownerPerson?.name ?? 'their'}’s list`;
      toast.show(`Added to ${where}: ${item.title}`, {
        undo: async () => {
          try {
            await api(`/households/${household.id}/work-items/${item.id}`, {
              method: 'PATCH',
              body: { expectedVersion: item.version, status: 'cancelled' },
            });
          } catch (caught) {
            // Never a silent failure: it's still there, so say so.
            toast.show(`Couldn’t undo adding “${item.title}”. It’s still on the list.`, {
              error: true,
              detail: errorMessage(caught),
            });
          }
          onCreated();
        },
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      // Still open after a failure: the same capture can be tried again (same id).
      if (!saved) saving.current = false;
      setBusy(false);
    }
  };

  const submitLabel =
    owner === null
      ? 'Add to Shared'
      : ownerPerson?.isMe
        ? 'Add to your list'
        : `Add to ${ownerPerson?.name ?? 'their'}’s list`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      label="Capture something for the household"
      title="What needs doing?"
      width={600}
      anchor="top-right"
      footer={
        <>
          {error ? (
            <Text variant="meta" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.foot}>
            <Button
              title="Put in the inbox"
              variant="quiet"
              size="sm"
              icon={Inbox}
              disabled={!parsed.title || timeBad || busy}
              onPress={() => void save(true)}
              accessibilityLabel="Put in the inbox, to sort later"
            />
            <Button
              title={submitLabel}
              icon={CornerDownLeft}
              iconRight
              busy={busy}
              disabled={!parsed.title || timeBad}
              onPress={() => void save(false)}
            />
          </View>
        </>
      }
    >
      <TextInput
        ref={input}
        value={raw}
        onChangeText={setRaw}
        placeholder="Call the plumber tomorrow"
        placeholderTextColor={color.faint}
        accessibilityLabel="What needs doing?"
        accessibilityHint="Type @ and a name, a day like tomorrow, a time like at 5:30pm, or # and a project"
        maxLength={500}
        returnKeyType="done"
        onSubmitEditing={() => void save(false)}
        style={[styles.input, phone && styles.inputPhone]}
      />

      <View style={styles.chips} aria-live="polite">
        <TagChip icon={CalendarDays} on={!!dueOn || !!timed} label={dueLabel ?? 'No day yet'} />
        <TagChip
          icon={FolderKanban}
          on={!!inProject}
          label={inProject ? inProject.title : project ? 'New project' : 'No project'}
        />
        {parsed.important ? <TagChip icon={Flag} on label="Important" /> : null}
      </View>

      <View style={styles.targets} accessibilityRole="radiogroup" accessibilityLabel="Whose list">
        {targets.map((p) => {
          const id = p?.id ?? null;
          const on = owner === id;
          const c = p?.color ?? color.ink;
          return (
            <Pressable
              key={id ?? 'shared'}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={p ? (p.isMe ? 'You' : p.name) : 'Shared'}
              onPress={() => {
                setPicked(id);
                // Tapping a target overrides a typed @name.
                if (parsed.ownerId !== undefined) setRaw((r) => r.replace(/(^|\s)(@|for\s+)\S+/i, ' ').trim());
              }}
              style={(s: PressState) => [
                styles.target,
                on && { borderColor: c, backgroundColor: color.surface },
                !on && s.hovered && { borderColor: color.line2 },
              ]}
            >
              <View style={styles.targetTop}>
                {p ? <Avatar person={p} size={22} /> : <Either size={22} />}
                <Text variant="h3" style={styles.targetName} numberOfLines={1}>
                  {p ? (p.isMe ? 'You' : p.name) : 'Shared'}
                </Text>
              </View>
              {!phone ? (
                <Text variant="small" tone="muted">
                  {p ? (p.isMe ? 'On you' : `${p.name}’s handling`) : 'Either of you'}
                </Text>
              ) : null}
              <View style={styles.ghost}>
                {on && parsed.title ? (
                  <>
                    <View style={[styles.ghostBead, { borderColor: c }]} />
                    <Text variant="small" numberOfLines={2} style={styles.ghostText}>
                      {parsed.title}
                    </Text>
                  </>
                ) : on ? (
                  <Text variant="small" tone="faint">
                    Lands here
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {today ? (
        <View style={styles.chips}>
          {quickDays.map((o) => {
            const on = dueOn === o.date && !parsed.dueOn;
            return (
              <Chip
                key={o.label}
                label={o.label}
                selected={on}
                onPress={() => pickDay(on ? null : o.date)}
              />
            );
          })}
          <DateChip
            value={otherDay}
            today={today}
            open={dates.open}
            onPress={dates.toggle}
            chip={dates.chip}
          />
          {!project ? (
            <Chip
              label={time ? clockRange(time, length) : 'Add a time'}
              icon={Clock}
              selected={!!time}
              accessibilityLabel={time ? `Time: ${clockRange(time, length)}` : 'Add a time'}
              onPress={() => setTimeOpen((v) => !v)}
            />
          ) : null}
          <Chip
            label="Project with steps"
            icon={FolderKanban}
            selected={project}
            onPress={() => setProject((v) => !v)}
          />
        </View>
      ) : null}

      {dates.open && today ? (
        <DateCalendar
          value={dueOn}
          today={today}
          onPick={(date) => {
            pickDay(date);
            dates.close();
          }}
        />
      ) : null}

      {timeOpen && !project ? (
        <View style={styles.time} role="group" aria-label="Time">
          <View style={styles.chips}>
            {TIME_CHOICES.map((value) => (
              <Chip
                key={value}
                label={clock(value)}
                selected={time === value && !otherTyped}
                onPress={() => pickTime(value)}
              />
            ))}
            <TextInput
              value={otherValue}
              onChangeText={typeOtherTime}
              onSubmitEditing={() => void save(false)}
              maxLength={8}
              placeholder="Other, e.g. 6:30am"
              placeholderTextColor={color.faint}
              accessibilityLabel="Another time, like 6:30am"
              aria-invalid={timeBad}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              returnKeyType="done"
              style={[styles.timeInput, timeBad && styles.timeBad]}
            />
            {time || otherTyped ? (
              <Chip label="No time" onPress={clearTime} accessibilityLabel="No time, clear it" />
            ) : null}
          </View>
          {timeBad ? (
            <Text variant="meta" tone="danger" accessibilityRole="alert">
              Write the time like 6:30am or 8pm.
            </Text>
          ) : null}
          {time ? (
            <View style={styles.chips} role="group" aria-label="How long it takes">
              <Chip label="No length" selected={!length} onPress={() => pickLength(null)} />
              {DURATION_CHOICES.map((m) => (
                <Chip
                  key={m}
                  label={durationLabel(m)}
                  selected={length === m}
                  onPress={() => pickLength(m)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.hint}>
        <Text variant="small" tone="muted">
          Try
        </Text>
        {[
          `@${(people.partner ?? people.me)?.name.split(' ')[0]?.toLowerCase() ?? 'name'}`,
          'tomorrow',
          'at 5:30pm',
          projects[0] ? `#${projects[0].title.split(/\s+/)[0]?.toLowerCase()}` : '#project',
          '!',
        ].map((code) => (
          <View key={code} style={styles.code}>
            <Text variant="small">{code}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/** A v4 UUID for the capture's `clientId` (the platform's own where there is one). */
function newClientId(): string {
  const native = globalThis.crypto?.randomUUID?.();
  if (native) return native;
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const styles = StyleSheet.create({
  input: {
    fontFamily: font.displaySemi,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: em(28, -0.02),
    color: color.ink,
    borderBottomWidth: 2,
    borderBottomColor: color.ink,
    paddingTop: 4,
    paddingBottom: 10,
  },
  inputPhone: { fontSize: 23, lineHeight: 30 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  targets: { flexDirection: 'row', gap: 8 },
  target: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    gap: 6,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.ground,
    cursor: 'pointer',
  },
  targetTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  targetName: { fontSize: 15.5, lineHeight: 19, flexShrink: 1 },
  ghost: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, minHeight: 18 },
  ghostBead: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 1 },
  ghostText: { flex: 1 },
  hint: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  time: { gap: 8 },
  // Like New routine's "Other" time: a chip-sized field.
  timeInput: {
    height: 36,
    width: 150,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    fontFamily: font.uiSemi,
    fontSize: 13.5,
    color: color.ink,
  },
  timeBad: { borderColor: color.danger },
  code: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: color.lane,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
});
