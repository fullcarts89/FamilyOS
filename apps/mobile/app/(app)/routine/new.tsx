import {
  RULE_LIMITS,
  describeSchedule,
  dueOptions,
  monthStartOptions,
  upcomingOccurrences,
  type NthWeek,
  type RecurrenceRule,
  type Weekday,
} from '@familyos/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Avatar, Either } from '../../../design/Avatar';
import { Button, IconButton } from '../../../design/Button';
import { Chip } from '../../../design/Chip';
import { Field } from '../../../design/Field';
import { useLayout } from '../../../design/layout';
import { FadeIn } from '../../../design/motion';
import { ErrorNotice } from '../../../design/Notice';
import { Page, PageHeader } from '../../../design/Page';
import { RotationRing } from '../../../design/RotationRing';
import { Text } from '../../../design/Text';
import { useToast } from '../../../design/Toast';
import { color, font, radius } from '../../../design/tokens';
import { api, errorMessage, type Routine, type TodayResponse } from '../../../lib/api';
import { useCapture } from '../../../lib/capture';
import { clock, friendlyTimes, relativeDay, shortDate } from '../../../lib/dates';
import { parseTime } from '../../../components/rhythm/EventSheet';
import { useHousehold } from '../../../lib/household';
import { goBack } from '../../../lib/navigation';
import { usePeople, type Person } from '../../../lib/people';

type Kind = 'daily' | 'weekly' | 'monthly' | 'after_completion';
type MonthlyMode = 'date' | 'weekday';

const WEEKDAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];
const NTHS: { nth: NthWeek; label: string }[] = [
  { nth: 1, label: 'First' },
  { nth: 2, label: 'Second' },
  { nth: 3, label: 'Third' },
  { nth: 4, label: 'Fourth' },
  { nth: -1, label: 'Last' },
];
const TIMES = ['08:00', '12:00', '19:00'];
const UNITS: Record<Kind, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  after_completion: 'day',
};
type Preset = 'weekly' | 'fortnightly' | 'first' | 'quarterly' | 'daily' | 'after';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'weekly', label: 'Every week' },
  { id: 'fortnightly', label: 'Every other week' },
  { id: 'first', label: 'Monthly on the 1st' },
  { id: 'quarterly', label: 'Every 3 months' },
  { id: 'daily', label: 'Every day' },
  { id: 'after', label: 'A while after it’s done' },
];

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <View style={styles.stepper}>
      <IconButton
        icon={Minus}
        label={`Fewer: ${label}`}
        variant="outline"
        size={40}
        disabled={value <= min}
        onPress={() => step(-1)}
      />
      <Text variant="label" style={styles.stepLabel}>
        {label}
      </Text>
      <IconButton
        icon={Plus}
        label={`More: ${label}`}
        variant="outline"
        size={40}
        disabled={value >= max}
        onPress={() => step(1)}
      />
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

// New routine: a quick preset ("Monthly on the 1st"), then fine-tune; who does it or takes turns;
// and a preview of the next turns before saving. Everything here is plain rules, no AI.
export default function NewRoutine() {
  // Optional: who it's for, a suggested title and a preset (from "Set up Biscuit's care routine").
  const params = useLocalSearchParams<{ for?: string; title?: string; preset?: string }>();
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { changed } = useCapture();
  const { desktop } = useLayout();
  const [today, setToday] = useState<string | null>(null);
  const [title, setTitle] = useState(params.title ?? '');
  const [subjectId, setSubjectId] = useState<string | null>(params.for ?? null);
  const [preset, setPreset] = useState<Preset | null>('weekly');
  const [kind, setKind] = useState<Kind>('weekly');
  const [interval, setEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>('date');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [nth, setNth] = useState<NthWeek>(1);
  const [weekday, setWeekday] = useState<Weekday>(7);
  const [startOn, setStartOn] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [otherTime, setOtherTime] = useState('');
  const [turns, setTurns] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    api<TodayResponse>(`/households/${household.id}/today`)
      .then((td) => {
        setToday(td.date);
        setStartOn(td.date);
        const dow = new Date(`${td.date}T12:00:00Z`).getUTCDay();
        setWeekdays([(dow === 0 ? 7 : dow) as Weekday]);
        setDayOfMonth(Number(td.date.slice(8, 10)));
        if (params.preset === 'first') {
          // "Monthly on the 1st", starting with the next 1st.
          setPreset('first');
          setKind('monthly');
          setMonthlyMode('date');
          setDayOfMonth(1);
          setEvery(1);
          setStartOn(
            monthStartOptions(td.date)[Number(td.date.slice(8, 10)) === 1 ? 0 : 1]?.date ?? td.date,
          );
        }
      })
      .catch(() => setToday(null));
    setOwnerId(household.memberId);
  }, [household, params.preset]);

  const rule: RecurrenceRule | null = useMemo(() => {
    switch (kind) {
      case 'daily':
        return { freq: 'daily', interval };
      case 'weekly':
        return weekdays.length ? { freq: 'weekly', interval, weekdays } : null;
      case 'monthly':
        return monthlyMode === 'date'
          ? { freq: 'monthly', interval, dayOfMonth }
          : { freq: 'monthly_weekday', interval, nth, weekday };
      case 'after_completion':
        return { freq: 'after_completion', intervalDays: interval };
    }
  }, [kind, interval, weekdays, monthlyMode, dayOfMonth, nth, weekday]);

  // Typed like the rest of the app ("6:30am", "8pm"); 24-hour ("20:00") works too.
  const typedTime = otherTime.trim() ? parseTime(otherTime) : null;
  const timeValue = otherTime.trim() ? typedTime : time;
  const timeValid = !otherTime.trim() || !!typedTime;

  // The same expander the server uses, so the preview is what will happen.
  const preview = useMemo(() => {
    if (!rule || !startOn || !today || rule.freq === 'after_completion') return [];
    return upcomingOccurrences(
      { rule, startOn },
      { rotation: turns ? rotation : [], ownerMemberId: turns ? null : ownerId },
      [],
      startOn > today ? startOn : today,
      4,
    );
  }, [rule, startOn, today, turns, rotation, ownerId]);

  if (!household) return null;
  const limit = rule ? RULE_LIMITS[rule.freq] : 1;
  const unit = UNITS[kind];
  const ready =
    title.trim().length > 0 &&
    rule !== null &&
    startOn !== null &&
    timeValid &&
    (!turns || rotation.length >= 2);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (!today) return;
    const firstOfNext =
      monthStartOptions(today)[Number(today.slice(8, 10)) === 1 ? 0 : 1]?.date ?? today;
    switch (p) {
      case 'weekly':
      case 'fortnightly':
        setKind('weekly');
        setEvery(p === 'weekly' ? 1 : 2);
        setStartOn(today);
        break;
      case 'first':
      case 'quarterly':
        setKind('monthly');
        setMonthlyMode('date');
        setDayOfMonth(1);
        setEvery(p === 'first' ? 1 : 3);
        setStartOn(firstOfNext);
        break;
      case 'daily':
        setKind('daily');
        setEvery(1);
        setStartOn(today);
        break;
      case 'after':
        setKind('after_completion');
        setEvery(30);
        setStartOn(today);
        break;
    }
  };

  const save = async () => {
    if (!rule || !startOn) return;
    setBusy(true);
    setError(null);
    try {
      const { routine } = await api<{ routine: Routine }>(`/households/${household.id}/routines`, {
        method: 'POST',
        body: {
          title,
          rule,
          startOn,
          time: timeValue || null,
          ...(turns ? { rotation } : { ownerMemberId: ownerId }),
          ...(subjectId && { subjectMemberId: subjectId }),
        },
      });
      toast.show(`Routine set up: ${routine.title}`, { detail: friendlyTimes(routine.summary) });
      changed();
      router.replace({ pathname: '/routine/[id]', params: { id: routine.id } });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggleWeekday = (day: Weekday) =>
    setWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day]);
  const toggleTurn = (id: string) =>
    setRotation(rotation.includes(id) ? rotation.filter((r) => r !== id) : [...rotation, id]);

  const rotationPeople = rotation.map((id) => people.byId(id)).filter((p): p is Person => !!p);
  const turn = turns ? (rotationPeople[0] ?? null) : people.byId(ownerId);

  const form = (
    <View style={styles.form}>
      <Field
        label="What needs doing?"
        value={title}
        onChangeText={setTitle}
        autoFocus
        maxLength={500}
        placeholder="Biscuit’s flea treatment"
      />

      {people.caredFor.length > 0 ? (
        <Group label="Who it’s for">
          <View style={styles.chips}>
            <Chip
              label="The household"
              selected={subjectId === null}
              onPress={() => setSubjectId(null)}
            />
            {people.caredFor.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                accent={p.color}
                leading={<Avatar person={p} size={18} />}
                selected={subjectId === p.id}
                onPress={() => setSubjectId(p.id)}
              />
            ))}
          </View>
        </Group>
      ) : null}

      <Group label="How often">
        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              selected={preset === p.id}
              onPress={() => choosePreset(p.id)}
            />
          ))}
        </View>
      </Group>

      <View style={styles.fine}>
        <View style={styles.chips}>
          {(
            [
              ['daily', 'Daily'],
              ['weekly', 'Weekly'],
              ['monthly', 'Monthly'],
              ['after_completion', 'After it’s done'],
            ] as const
          ).map(([k, label]) => (
            <Chip
              key={k}
              label={label}
              selected={kind === k}
              onPress={() => {
                setPreset(null);
                setKind(k);
                setEvery(k === 'after_completion' ? 7 : 1);
                // Monthly series count from the start month; other kinds start on a day.
                if (today)
                  setStartOn(
                    k === 'monthly' ? (monthStartOptions(today)[0]?.date ?? today) : today,
                  );
              }}
            />
          ))}
        </View>
        <Stepper
          value={interval}
          min={1}
          max={limit}
          onChange={(n) => {
            setPreset(null);
            setEvery(n);
          }}
          label={
            kind === 'after_completion'
              ? `${interval} ${unit}${interval === 1 ? '' : 's'} after it’s done`
              : interval === 1
                ? `Every ${unit}`
                : `Every ${interval} ${unit}s`
          }
        />
        {kind === 'weekly' ? (
          <View style={styles.chips}>
            {WEEKDAYS.map((w) => (
              <Chip
                key={w.day}
                label={w.label}
                selected={weekdays.includes(w.day)}
                onPress={() => toggleWeekday(w.day)}
              />
            ))}
          </View>
        ) : null}
        {kind === 'monthly' ? (
          <>
            <View style={styles.chips}>
              <Chip
                label="On a date"
                selected={monthlyMode === 'date'}
                onPress={() => setMonthlyMode('date')}
              />
              <Chip
                label="On a weekday"
                selected={monthlyMode === 'weekday'}
                onPress={() => setMonthlyMode('weekday')}
              />
            </View>
            {monthlyMode === 'date' ? (
              <Stepper
                value={dayOfMonth}
                min={1}
                max={31}
                onChange={(n) => {
                  setPreset(null);
                  setDayOfMonth(n);
                }}
                label={dayOfMonth === 1 ? 'On the 1st' : `On day ${dayOfMonth}`}
              />
            ) : (
              <>
                <View style={styles.chips}>
                  {NTHS.map((n) => (
                    <Chip
                      key={n.nth}
                      label={n.label}
                      selected={nth === n.nth}
                      onPress={() => setNth(n.nth)}
                    />
                  ))}
                </View>
                <View style={styles.chips}>
                  {WEEKDAYS.map((w) => (
                    <Chip
                      key={w.day}
                      label={w.label}
                      selected={weekday === w.day}
                      onPress={() => setWeekday(w.day)}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        ) : null}
      </View>

      {today ? (
        <Group label={kind === 'after_completion' ? 'First one due' : 'Starting'}>
          <View style={styles.chips}>
            {(kind === 'monthly' ? monthStartOptions(today) : dueOptions(today)).map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                selected={startOn === o.date}
                onPress={() => setStartOn(o.date)}
              />
            ))}
          </View>
        </Group>
      ) : null}

      <Group label="Time">
        <View style={styles.chips}>
          <Chip
            label="Any time that day"
            selected={!time && !otherTime.trim()}
            onPress={() => {
              setTime(null);
              setOtherTime('');
            }}
          />
          {TIMES.map((value) => (
            <Chip
              key={value}
              label={clock(value)}
              selected={time === value && !otherTime.trim()}
              onPress={() => {
                setTime(value);
                setOtherTime('');
              }}
            />
          ))}
          <TextInput
            value={otherTime}
            onChangeText={setOtherTime}
            maxLength={8}
            placeholder="Other, e.g. 6:30am"
            placeholderTextColor={color.faint}
            accessibilityLabel="Another time, like 6:30am"
            keyboardType="numbers-and-punctuation"
            style={[styles.timeInput, !timeValid && { borderColor: color.danger }]}
          />
        </View>
        {!timeValid ? (
          <Text variant="meta" tone="danger">
            Write the time like 6:30am or 8pm.
          </Text>
        ) : null}
      </Group>

      <Group label="Who">
        <View style={styles.chips}>
          <Chip label="One person" selected={!turns} onPress={() => setTurns(false)} />
          <Chip label="Take turns" selected={turns} onPress={() => setTurns(true)} />
        </View>
        <View style={styles.chips}>
          {people.assignable.map((m) =>
            turns ? (
              <Chip
                key={m.id}
                label={
                  rotation.includes(m.id)
                    ? `${rotation.indexOf(m.id) + 1}. ${m.isMe ? 'Me' : m.name}`
                    : m.isMe
                      ? 'Me'
                      : m.name
                }
                leading={<Avatar person={m} size={18} />}
                accent={m.color}
                selected={rotation.includes(m.id)}
                onPress={() => toggleTurn(m.id)}
              />
            ) : (
              <Chip
                key={m.id}
                label={m.isMe ? 'Me' : m.name}
                leading={<Avatar person={m} size={18} />}
                accent={m.color}
                selected={ownerId === m.id}
                onPress={() => setOwnerId(ownerId === m.id ? null : m.id)}
              />
            ),
          )}
          {!turns ? (
            <Chip
              label="Anyone"
              leading={<Either size={18} />}
              selected={ownerId === null}
              onPress={() => setOwnerId(null)}
            />
          ) : null}
        </View>
        {turns && rotation.length < 2 ? (
          <Text variant="meta" tone="muted">
            Tap people in the order they take turns (two or more).
          </Text>
        ) : null}
      </Group>
    </View>
  );

  const previewCard =
    rule && today && startOn ? (
      <View style={styles.preview}>
        <View style={styles.previewHead}>
          <RotationRing rotation={turns ? rotationPeople : []} turn={turn} size={64} />
          <View style={styles.previewText}>
            <Text variant="h3">{title.trim() || 'Your routine'}</Text>
            <Text variant="meta" tone="muted">
              {friendlyTimes(describeSchedule(rule, timeValid ? timeValue : null))}
            </Text>
          </View>
        </View>
        {rule.freq === 'after_completion' ? (
          <Text variant="body" tone="muted">
            First one {relativeDay(startOn, today).toLowerCase()}, then {rule.intervalDays} days
            after each time it’s done or skipped.
          </Text>
        ) : (
          preview.map((p) => {
            const who = people.byId(p.ownerMemberId);
            return (
              <View key={p.index} style={styles.previewRow}>
                <Text variant="label" style={styles.previewDay}>
                  {relativeDay(p.date, today)}
                </Text>
                <Text variant="meta" tone="muted" style={styles.previewDate}>
                  {relativeDay(p.date, today) === shortDate(p.date, today)
                    ? ''
                    : shortDate(p.date, today)}
                </Text>
                <Avatar person={who} size={20} />
                <Text variant="meta">{who ? (who.isMe ? 'You' : who.name) : 'Anyone'}</Text>
              </View>
            );
          })
        )}
      </View>
    ) : null;

  return (
    <Page maxWidth={1100}>
      <PageHeader
        kicker="Routines"
        title="New routine"
        lead="Set it up once. FamilyOS adds each turn on its day, for whoever’s turn it is."
      />
      <FadeIn style={[styles.body, desktop && styles.bodyWide]}>
        <View style={styles.main}>{form}</View>
        <View style={[styles.side, desktop && styles.sideWide]}>
          {previewCard}
          {error ? <ErrorNotice message={error} /> : null}
          <View style={styles.actions}>
            <Button title="Save routine" onPress={save} busy={busy} disabled={!ready} />
            <Button title="Cancel" variant="quiet" onPress={() => goBack('/tasks')} />
          </View>
        </View>
      </FadeIn>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 24, gap: 28 },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 56 },
  main: { flex: 1.4, minWidth: 0 },
  side: { gap: 16 },
  sideWide: { flex: 1 },
  form: { gap: 26 },
  group: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  fine: {
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: color.lane,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepLabel: { minWidth: 150, textAlign: 'center' },
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
  preview: {
    gap: 10,
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  previewText: { flex: 1, gap: 2 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  previewDay: { width: 92 },
  previewDate: { width: 64 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
