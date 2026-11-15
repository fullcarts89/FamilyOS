import { Check, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Either } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import type { WorkItem } from '../../lib/api';
import { relativeDay, weekdayName } from '../../lib/dates';
import { usePeople } from '../../lib/people';
import { dueDate, dueText } from '../../lib/tasks';

export type SortAction =
  | { kind: 'keep' }
  | { kind: 'move'; dueOn: string }
  | { kind: 'later' }
  | { kind: 'drop' }
  | { kind: 'hand'; to: string };

export interface LooseChoice {
  action: SortAction;
  /** "Kept for Monday", "Handed to Theo". */
  label: string;
}

/**
 * Chapter 2, loose ends: what's still open from before the week. Each one gets a place: keep it
 * (on the board for the first day), move it to a day, hand it over, or let it go. Every choice
 * applies at once and can be undone.
 */
export function LooseEnds({
  items,
  choices,
  keepOn,
  days,
  nextWeek,
  today,
  timeZone,
  onSort,
  onUndo,
  onKeepRest,
}: {
  items: WorkItem[];
  choices: Record<string, LooseChoice>;
  keepOn: string;
  days: string[];
  nextWeek: string;
  today: string;
  timeZone: string;
  onSort: (item: WorkItem, action: SortAction) => void;
  onUndo: (item: WorkItem) => void;
  onKeepRest: () => void;
}) {
  const unsorted = items.filter((i) => !choices[i.id]);
  if (items.length === 0) {
    return (
      <View style={styles.done}>
        <Check size={18} color={color.ink} strokeWidth={2.6} />
        <Text variant="title">Nothing carried over. Every loose end from before has a place.</Text>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <LooseRow
          key={item.id}
          item={item}
          choice={choices[item.id]}
          keepOn={keepOn}
          days={days}
          nextWeek={nextWeek}
          today={today}
          timeZone={timeZone}
          onSort={onSort}
          onUndo={onUndo}
        />
      ))}
      {unsorted.length > 1 ? (
        <Button
          title={`Keep the other ${unsorted.length} for ${relativeDay(keepOn, today, { late: false }).toLowerCase() === 'today' ? 'today' : weekdayName(keepOn)}`}
          variant="secondary"
          size="sm"
          onPress={onKeepRest}
          style={styles.rest}
        />
      ) : unsorted.length === 0 ? (
        <FadeIn>
          <View style={styles.done}>
            <Check size={18} color={color.ink} strokeWidth={2.6} />
            <Text variant="title">Every loose end has a place.</Text>
          </View>
        </FadeIn>
      ) : null}
    </View>
  );
}

function LooseRow({
  item,
  choice,
  keepOn,
  days,
  nextWeek,
  today,
  timeZone,
  onSort,
  onUndo,
}: {
  item: WorkItem;
  choice: LooseChoice | undefined;
  keepOn: string;
  days: string[];
  nextWeek: string;
  today: string;
  timeZone: string;
  onSort: (item: WorkItem, action: SortAction) => void;
  onUndo: (item: WorkItem) => void;
}) {
  const people = usePeople();
  const [moving, setMoving] = useState(false);
  const owner = people.byId(item.ownerMemberId);
  const due = dueDate(item, timeZone);
  const late = !!due && due < today;
  const handTo = owner?.isMe || !owner ? (owner?.isMe ? people.partner : people.me) : people.me;
  const keepWord = keepOn === today ? 'today' : weekdayName(keepOn);

  if (choice) {
    return (
      <FadeIn>
        <View style={[styles.row, styles.rowDone]}>
          <View style={styles.tick}>
            <Check size={13} strokeWidth={3} color={color.onInk} />
          </View>
          <View style={styles.text}>
            <Text
              variant="title"
              tone="muted"
              style={choice.action.kind === 'drop' && styles.struck}
            >
              {item.title}
            </Text>
            <Text variant="small" tone="muted">
              {choice.label}
            </Text>
          </View>
          <Button
            title="Undo"
            icon={Undo2}
            variant="quiet"
            size="sm"
            onPress={() => onUndo(item)}
            accessibilityLabel={`Undo: ${choice.label} for ${item.title}`}
          />
        </View>
      </FadeIn>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.who}>
        {owner ? <Avatar person={owner} size={24} /> : <Either size={24} />}
      </View>
      <View style={styles.text}>
        <Text variant="title">{item.title}</Text>
        <View style={styles.meta}>
          {late ? <Hatch width={14} height={9} radius={2} /> : null}
          <Text variant="small" tone={late ? 'ink' : 'muted'}>
            {[
              owner ? (owner.isMe ? 'Yours' : `${owner.name}’s`) : 'Either of you',
              dueText(item, today, timeZone),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            size="sm"
            title={`Keep for ${keepWord}`}
            onPress={() => onSort(item, { kind: 'keep' })}
          />
          <Button
            size="sm"
            variant="secondary"
            title="Move"
            onPress={() => setMoving((v) => !v)}
            accessibilityLabel={`Move ${item.title} to another day`}
          />
          {handTo ? (
            <Button
              size="sm"
              variant="secondary"
              title={handTo.isMe ? 'I’ll take it' : `Hand to ${handTo.name}`}
              onPress={() => onSort(item, { kind: 'hand', to: handTo.id })}
            />
          ) : null}
          <Button
            size="sm"
            variant="quiet"
            title="Let it go"
            onPress={() => onSort(item, { kind: 'drop' })}
            accessibilityLabel={`Let go of ${item.title}`}
          />
        </View>
        {moving ? (
          <FadeIn>
            <View style={styles.days} accessibilityRole="radiogroup" aria-label="Move it to">
              {days
                .filter((d) => d > keepOn)
                .map((d) => (
                  <DayChip
                    key={d}
                    label={weekdayName(d).slice(0, 3)}
                    onPress={() => onSort(item, { kind: 'move', dueOn: d })}
                  />
                ))}
              <DayChip
                label="Next week"
                onPress={() => onSort(item, { kind: 'move', dueOn: nextWeek })}
              />
              <DayChip label="No date" onPress={() => onSort(item, { kind: 'later' })} />
            </View>
          </FadeIn>
        ) : null}
      </View>
    </View>
  );
}

function DayChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(s: PressState) => [styles.day, s.hovered && { borderColor: color.ink }]}
    >
      <Text variant="small">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  rowDone: { alignItems: 'center', backgroundColor: 'transparent', borderStyle: 'dashed' },
  who: { paddingTop: 1 },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  day: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  struck: { textDecorationLine: 'line-through' },
  rest: { marginTop: 6 },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
});
