import {
  RULE_LIMITS,
  describeSchedule,
  dueOptions,
  formatDue,
  isAssignableRole,
  monthStartOptions,
  upcomingOccurrences,
  type NthWeek,
  type RecurrenceRule,
  type Weekday,
} from '@familyos/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Chip, ListScreen } from '../../components/items';
import { Body, Button, ErrorText, Field, Title } from '../../components/ui';
import { api, errorMessage, type Routine, type TodayResponse } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { goBack } from '../../lib/navigation';
import { useTheme } from '../../lib/theme';

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
  const t = useTheme();
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  const button = (text: string, d: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => step(d)}
      style={[styles.stepButton, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <Text style={{ color: t.text, fontSize: 20 }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {button('−', -1, `Decrease: ${label}`)}
      <Text style={{ color: t.text, fontSize: 17, minWidth: 110, textAlign: 'center' }}>
        {label}
      </Text>
      {button('+', 1, `Increase: ${label}`)}
    </View>
  );
}

// New routine (PRD WF-02, J3, J3b): schedule, who does it, and a preview before saving. No AI.
export default function NewRoutine() {
  const { household, members, memberName } = useHousehold();
  const [today, setToday] = useState<string | null>(null);
  const [title, setTitle] = useState('');
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
      })
      .catch(() => setToday(null));
    setOwnerId(household.memberId);
  }, [household]);

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

  const timeValue = otherTime.trim() ? otherTime.trim() : time;
  const timeValid = !timeValue || /^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue);

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
  const adults = members.filter((m) => isAssignableRole(m.role));
  const limit = rule ? RULE_LIMITS[rule.freq] : 1;
  const unit = UNITS[kind];
  const ready =
    title.trim().length > 0 &&
    rule !== null &&
    startOn !== null &&
    timeValid &&
    (!turns || rotation.length >= 2);

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
        },
      });
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

  return (
    <ListScreen
      footer={
        <>
          {error && <ErrorText>{error}</ErrorText>}
          <Button title="Save routine" onPress={save} busy={busy} disabled={!ready} />
          <Button title="Cancel" onPress={() => goBack('/routines')} />
        </>
      }
    >
      <Title>New routine</Title>
      <Field
        label="What needs doing?"
        value={title}
        onChangeText={setTitle}
        autoFocus
        maxLength={500}
        placeholder="For example, bins out"
      />

      <Body muted>How often</Body>
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
              setKind(k);
              setEvery(k === 'after_completion' ? 7 : 1);
              // Monthly series count from the start month; other kinds start on a day.
              if (today)
                setStartOn(k === 'monthly' ? (monthStartOptions(today)[0]?.date ?? today) : today);
            }}
          />
        ))}
      </View>
      <Stepper
        value={interval}
        min={1}
        max={limit}
        onChange={setEvery}
        label={
          kind === 'after_completion'
            ? `${interval} ${unit}${interval === 1 ? '' : 's'} later`
            : interval === 1
              ? `Every ${unit}`
              : `Every ${interval} ${unit}s`
        }
      />

      {kind === 'weekly' && (
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
      )}

      {kind === 'monthly' && (
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
              onChange={setDayOfMonth}
              label={`On day ${dayOfMonth}`}
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
      )}

      {today && (
        <>
          <Body muted>{kind === 'after_completion' ? 'First one due' : 'Starting'}</Body>
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
        </>
      )}

      <Body muted>Time</Body>
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
            label={value}
            selected={time === value && !otherTime.trim()}
            onPress={() => {
              setTime(value);
              setOtherTime('');
            }}
          />
        ))}
      </View>
      <Field
        label="Or another time (24-hour, like 06:30)"
        value={otherTime}
        onChangeText={setOtherTime}
        maxLength={5}
        keyboardType="numbers-and-punctuation"
      />
      {!timeValid && <ErrorText>Use a 24-hour time like 06:30.</ErrorText>}

      <Body muted>Who</Body>
      <View style={styles.chips}>
        <Chip label="One person" selected={!turns} onPress={() => setTurns(false)} />
        <Chip label="Take turns" selected={turns} onPress={() => setTurns(true)} />
      </View>
      <View style={styles.chips}>
        {adults.map((m) =>
          turns ? (
            <Chip
              key={m.id}
              label={
                rotation.includes(m.id)
                  ? `${rotation.indexOf(m.id) + 1}. ${m.displayName}`
                  : m.displayName
              }
              selected={rotation.includes(m.id)}
              onPress={() => toggleTurn(m.id)}
            />
          ) : (
            <Chip
              key={m.id}
              label={m.displayName}
              selected={ownerId === m.id}
              onPress={() => setOwnerId(ownerId === m.id ? null : m.id)}
            />
          ),
        )}
      </View>
      {turns && rotation.length < 2 && (
        <Body muted>Tap people in the order they take turns (two or more).</Body>
      )}

      {rule && today && startOn && (
        <View style={styles.preview}>
          <Body>{describeSchedule(rule, timeValid ? timeValue : null)}</Body>
          {rule.freq === 'after_completion' ? (
            <Body muted>
              First one {formatDue(startOn, today)}, then {rule.intervalDays} days after each time
              it’s done or skipped.
            </Body>
          ) : (
            preview.map((p) => (
              <Body key={p.index} muted>
                {formatDue(p.date, today)}
                {p.ownerMemberId ? ` · ${memberName(p.ownerMemberId) ?? ''}` : ''}
              </Body>
            ))
          )}
        </View>
      )}
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepButton: {
    borderWidth: 1,
    borderRadius: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { gap: 4 },
});
