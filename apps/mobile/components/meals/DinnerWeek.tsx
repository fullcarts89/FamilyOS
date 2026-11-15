import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { useLayout } from '../../design/layout';
import { Text } from '../../design/Text';
import { color, font, radius, tint } from '../../design/tokens';
import type { Meal } from '../../lib/api';
import { weekdayName } from '../../lib/dates';
import { usePeople, type Person } from '../../lib/people';

/**
 * A week of dinners, one row a night: what it is (type it, or tap one of the family's recent
 * dinners) and who's cooking, if anyone. Saves as you go; nothing to submit.
 */
export function DinnerWeek({
  days,
  meals,
  today,
  ideas,
  onSave,
  readOnly,
  compact,
}: {
  days: string[];
  meals: Meal[];
  today: string;
  ideas: string[];
  onSave: (
    date: string,
    existing: Meal | null,
    next: { title: string; cookMemberId: string | null },
  ) => Promise<boolean>;
  readOnly?: boolean;
  /** In a narrow column: cooks as faces, the chosen one named. */
  compact?: boolean;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  return (
    <View style={styles.week}>
      {days.map((d, i) => {
        const meal = meals.find((m) => m.onDate === d && m.slot === 'dinner') ?? null;
        return (
          <DinnerRow
            key={d}
            date={d}
            meal={meal}
            today={today}
            ideas={ideas}
            open={focused === d}
            onOpen={() => setFocused(d)}
            onClose={() => setFocused((f) => (f === d ? null : f))}
            onSave={onSave}
            last={i === days.length - 1}
            readOnly={readOnly}
            compact={compact}
          />
        );
      })}
    </View>
  );
}

function DinnerRow({
  date,
  meal,
  today,
  ideas,
  open,
  onOpen,
  onClose,
  onSave,
  last,
  readOnly,
  compact,
}: {
  date: string;
  meal: Meal | null;
  today: string;
  ideas: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (
    date: string,
    existing: Meal | null,
    next: { title: string; cookMemberId: string | null },
  ) => Promise<boolean>;
  last: boolean;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const people = usePeople();
  const { phone: isPhone } = useLayout();
  const phone = isPhone || !!compact;
  const [text, setText] = useState(meal?.title ?? '');
  useEffect(() => {
    if (!open) setText(meal?.title ?? '');
  }, [meal?.title, open]);
  const cook = people.byId(meal?.cookMemberId);
  const isToday = date === today;
  const past = date < today;

  const commit = (title: string) => {
    void onSave(date, meal, { title, cookMemberId: title ? (meal?.cookMemberId ?? null) : null });
  };
  const setCook = (p: Person | null) => {
    if (!meal) return;
    void onSave(date, meal, { title: meal.title, cookMemberId: p?.id ?? null });
  };

  const cooks = (
    <View style={styles.cooks} accessibilityRole="radiogroup" aria-label="Who cooks">
      {people.adults.map((p) => {
        const on = meal?.cookMemberId === p.id;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !meal }}
            accessibilityLabel={`${p.isMe ? 'You cook' : `${p.name} cooks`} on ${weekdayName(date)}`}
            disabled={!meal || readOnly}
            onPress={() => setCook(on ? null : p)}
            style={(s: PressState) => [
              styles.cook,
              on && { backgroundColor: tint(p.color, 0.22), borderColor: p.color },
              !on && s.hovered && { borderColor: color.ink },
              !meal && styles.cookOff,
            ]}
          >
            <Avatar person={p} size={20} />
            {!phone || on ? (
              <Text variant="small" style={styles.cookText}>
                {p.isMe ? 'You' : p.name}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.row, last && styles.rowLast, past && styles.past]}>
      <View style={styles.main}>
        <View style={styles.day}>
          <Text style={[styles.dayName, isToday && styles.dayToday]}>
            {isToday ? 'Tonight' : weekdayName(date).slice(0, 3)}
          </Text>
          <Text variant="small" tone="muted">
            {Number(date.slice(8))}
          </Text>
        </View>
        <View style={styles.what}>
          {readOnly ? (
            <Text variant="title" tone={meal ? 'ink' : 'faint'}>
              {meal?.title ?? 'Nothing planned'}
            </Text>
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={onOpen}
              onBlur={() => {
                // Leave a moment for a tapped idea to land first.
                setTimeout(() => {
                  onClose();
                }, 180);
                if (text.trim() !== (meal?.title ?? '')) commit(text);
              }}
              onSubmitEditing={() => commit(text)}
              placeholder="Add dinner"
              placeholderTextColor={color.faint}
              accessibilityLabel={`Dinner on ${weekdayName(date)}`}
              maxLength={120}
              returnKeyType="done"
              style={[styles.input, open && styles.inputOpen]}
            />
          )}
          {meal && !open ? (
            <Text variant="small" tone="muted">
              {cook ? (cook.isMe ? 'You cook' : `${cook.name} cooks`) : 'Nobody set to cook'}
            </Text>
          ) : null}
        </View>
        {!phone ? cooks : null}
      </View>
      {phone && meal ? <View style={styles.phoneCooks}>{cooks}</View> : null}
      {open && ideas.length ? (
        <View style={styles.ideas} accessibilityLabel="Recent dinners">
          {ideas
            .filter((t) => t !== text.trim())
            .slice(0, 6)
            .map((t) => (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityLabel={`${t} on ${weekdayName(date)}`}
                onPress={() => {
                  setText(t);
                  commit(t);
                }}
                style={(s: PressState) => [styles.idea, s.hovered && { borderColor: color.ink }]}
              >
                <Text variant="small">{t}</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  week: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
    paddingHorizontal: 14,
  },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.hairline, gap: 8 },
  rowLast: { borderBottomWidth: 0 },
  past: { opacity: 0.55 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  day: { width: 58 },
  dayName: { fontFamily: font.display, fontSize: 17, lineHeight: 21, color: color.ink },
  dayToday: { fontSize: 15 },
  what: { flex: 1, minWidth: 0, gap: 1 },
  input: {
    fontFamily: font.uiSemi,
    fontSize: 15.5,
    color: color.ink,
    minHeight: 34,
    paddingHorizontal: 8,
    marginLeft: -8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputOpen: { borderColor: color.ink, backgroundColor: color.surface },
  cooks: { flexDirection: 'row', gap: 6 },
  phoneCooks: { paddingLeft: 70 },
  cook: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    cursor: 'pointer',
  },
  cookOff: { opacity: 0.35 },
  cookText: { color: color.ink },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 70 },
  idea: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
});
