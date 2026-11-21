import { router } from 'expo-router';
import { ArrowRightLeft, Repeat2 } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { hitSlopFor, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { nativeDriver, useLayout } from '../../design/layout';
import { RoundCheckbox } from '../../design/RoundCheckbox';
import { Meta, Row } from '../../design/Row';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import type { WorkItem } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { addDays } from '../../lib/dates';
import { STATUS_NOTE, canTick, dueText, isDone, whenOf } from '../../lib/tasks';
import { SETTLE_FADE_MS, type SettlePhase } from '../../lib/use-settle';

/**
 * One task: round check in the owner's color, the title, quiet meta (when, where it stands), and
 * the hand-off move. Shared tasks offer "I'll take it"; owned ones hand to the other adult.
 */
export function TaskRow({
  item,
  today,
  onComplete,
  onReopen,
  onAssign,
  onReschedule,
  context,
  last,
  settling,
}: {
  item: WorkItem;
  today: string;
  onComplete: (item: WorkItem) => void;
  onReopen?: (item: WorkItem) => void;
  onAssign?: (item: WorkItem, owner: string | null) => void;
  /** Offered on late rows: "Do it today", "Move to tomorrow". */
  onReschedule?: (item: WorkItem, dueOn: string, label: string) => void;
  /** Extra meta, e.g. the project's name. */
  context?: string;
  last?: boolean;
  /**
   * A just-finished row's moment (lib/use-settle.ts): it keeps its shape (nothing below moves
   * while you're still tapping), fades when `leaving`, then the list drops it.
   */
  settling?: SettlePhase | null;
}) {
  const { timeZone } = useHousehold();
  const people = usePeople();
  const owner = people.byId(item.ownerMemberId);
  const done = isDone(item);
  const when = whenOf(item, today, timeZone);
  const due = dueText(item, today, timeZone);
  const note = STATUS_NOTE[item.status];
  const doneBy = done ? people.label(item.completedByMemberId, 'Someone') : null;

  // The check fills at once (the request follows); the row stays, done, for a moment (see
  // lib/use-settle.ts), then fades and leaves the list. Ticking it again in that moment reopens it.
  const tick = () => (done ? onReopen?.(item) : onComplete(item));
  const lateSteps = !done && when === 'late' && onReschedule;
  // The room the open row's actions took, held empty while it settles: without them the title
  // would rewrap and the row shrink, and the next row would slide under the next tap.
  const [room, setRoom] = useState({ trailing: 0, footer: 0 });
  const hold = done && !!settling;

  return (
    <FadeOut leaving={settling === 'leaving'}>
      <Row
        last={last}
        done={done}
        title={item.title}
        accessibilityLabel={`${item.title}${due ? `, ${due}` : ''}${note ? `, ${note}` : ''}`}
        onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
        titleAccessory={
          item.priority === 1 ? (
            <Text style={styles.important} accessibilityLabel="Important">
              {'\u00A0\u25CF'}
            </Text>
          ) : null
        }
        leading={
          <RoundCheckbox
            checked={done}
            waiting={!done && !canTick(item)}
            color={owner?.color ?? color.ink}
            label={
              done
                ? `Reopen ${item.title}`
                : canTick(item)
                  ? `Complete ${item.title}`
                  : `${item.title}: ${note ?? 'can’t be ticked off yet'}`
            }
            onPress={tick}
          />
        }
        meta={
          <>
            {done ? <Meta>{doneBy === 'You' ? 'Done by you' : `Done by ${doneBy}`}</Meta> : null}
            {!done && due ? (
              when === 'late' ? (
                <Meta strong icon={<Hatch width={13} height={9} radius={3} />}>
                  {due}
                </Meta>
              ) : (
                <Meta strong={when === 'today'}>{due}</Meta>
              )
            ) : null}
            {!done && note ? <Meta>{note}</Meta> : null}
            {context ? <Meta>{context}</Meta> : null}
            {item.recurrenceRuleId ? (
              <Repeat2 size={13} strokeWidth={2.2} color={color.muted} aria-label="Repeats" />
            ) : null}
            {item.visibility === 'private' ? <Meta>Private</Meta> : null}
          </>
        }
        footer={
          lateSteps ? (
            <View
              style={styles.next}
              onLayout={(e) => {
                const footer = e.nativeEvent.layout.height;
                setRoom((r) => (r.footer === footer ? r : { ...r, footer }));
              }}
            >
              <NextStep
                label="Do it today"
                onPress={() => onReschedule(item, today, 'Moved to today')}
              />
              <NextStep
                label="Move to tomorrow"
                onPress={() => onReschedule(item, addDays(today, 1), 'Moved to tomorrow')}
              />
            </View>
          ) : hold && room.footer ? (
            <View style={{ height: room.footer }} />
          ) : null
        }
        trailing={
          !done && onAssign ? (
            <View
              onLayout={(e) => {
                const trailing = e.nativeEvent.layout.width;
                setRoom((r) => (r.trailing === trailing ? r : { ...r, trailing }));
              }}
            >
              <HandOff item={item} owner={owner} onAssign={onAssign} />
            </View>
          ) : hold && room.trailing ? (
            <View style={{ width: room.trailing }} />
          ) : null
        }
      />
    </FadeOut>
  );
}

/** Opacity only, so nothing around it moves until the row is gone. */
function FadeOut({ leaving, children }: { leaving: boolean; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!leaving) {
      opacity.setValue(1);
      return;
    }
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: SETTLE_FADE_MS,
      useNativeDriver: nativeDriver,
    });
    fade.start();
    return () => fade.stop();
  }, [leaving, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

/** A small text action for what to do next with something late. */
function NextStep({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={hitSlopFor(26)}
      style={(s: PressState) => [styles.nextStep, s.hovered && styles.nextHover]}
    >
      <Text variant="small" style={styles.nextText}>
        {label}
      </Text>
    </Pressable>
  );
}

function HandOff({
  item,
  owner,
  onAssign,
}: {
  item: WorkItem;
  owner: Person | null;
  onAssign: (item: WorkItem, owner: string | null) => void;
}) {
  const people = usePeople();
  const { phone } = useLayout();
  const me = people.me;
  if (!owner) {
    return (
      <View style={styles.handGroup}>
        {me ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`I’ll take it: ${item.title}`}
            onPress={() => onAssign(item, me.id)}
            hitSlop={hitSlopFor(32)}
            style={(s: PressState) => [
              styles.take,
              s.hovered && { backgroundColor: me.color, borderColor: me.color },
            ]}
          >
            {(s: PressState) => (
              <Text
                variant="small"
                color={s.hovered ? color.onInk : color.ink}
                style={styles.takeText}
              >
                I’ll take it
              </Text>
            )}
          </Pressable>
        ) : null}
        {people.partner && !phone ? (
          <HandButton person={people.partner} item={item} onAssign={onAssign} verb="Ask" />
        ) : null}
      </View>
    );
  }
  const to = owner.isMe ? people.partner : me;
  if (!to) return null;
  return (
    <HandButton
      person={to}
      item={item}
      onAssign={onAssign}
      verb={to.isMe ? 'Take it' : 'Hand to'}
    />
  );
}

function HandButton({
  person,
  item,
  onAssign,
  verb,
}: {
  person: Person;
  item: WorkItem;
  onAssign: (item: WorkItem, owner: string | null) => void;
  verb: 'Ask' | 'Hand to' | 'Take it';
}) {
  const label = verb === 'Take it' ? 'Take it' : `${verb} ${person.name}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${item.title}`}
      onPress={() => onAssign(item, person.id)}
      hitSlop={hitSlopFor(32)}
      style={(s: PressState) => [styles.hand, (s.hovered || s.focused) && styles.handHover]}
    >
      {(s: PressState) => (
        <>
          <ArrowRightLeft size={14} strokeWidth={2.2} color={color.muted} />
          <Avatar person={person} size={22} />
          {s.hovered || s.focused ? (
            <Text variant="small" style={styles.handText}>
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: 'row', gap: 6 },
  nextStep: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line2,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  nextHover: { borderColor: color.ink, backgroundColor: color.surface },
  nextText: { fontFamily: 'Figtree-700', color: color.ink },
  important: { fontSize: 9, lineHeight: 21, color: color.ink },
  handGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  take: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.ink,
    backgroundColor: color.surface,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  takeText: { fontFamily: 'Figtree-700', fontSize: 12.5 },
  hand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    cursor: 'pointer',
  },
  handHover: { borderColor: color.line2, backgroundColor: color.surface },
  handText: { fontFamily: 'Figtree-700' },
});
