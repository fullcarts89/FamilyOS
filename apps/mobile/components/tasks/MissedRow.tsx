import { Repeat2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HitArea, hitSlopFor, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { Meta, Row } from '../../design/Row';
import { Text } from '../../design/Text';
import { color, radius, space, tint } from '../../design/tokens';
import { daysBetween, shortDate, weekdayName } from '../../lib/dates';
import { usePeople } from '../../lib/people';
import type { MissedTurns } from './lists';

/**
 * A routine whose turns went by undone, as one row: "Walk Biscuit · 4 missed". "Done" marks the
 * most recent turn done and skips the older ones; "Skip missed" skips them all. Either is one tap,
 * not one per missed turn.
 */
export function MissedRow({
  missed,
  today,
  onCatchUp,
  last,
}: {
  missed: MissedTurns;
  today: string;
  /** Resolves when the server has answered (the list reloads after). */
  onCatchUp: (missed: MissedTurns, how: 'done' | 'skip') => Promise<unknown>;
  last?: boolean;
}) {
  const people = usePeople();
  const owner = people.byId(missed.ownerMemberId);
  const [busy, setBusy] = useState<'done' | 'skip' | null>(null);
  const n = missed.turns.length;
  const first = missed.turns[0]?.occurrenceOn ?? missed.turns[0]?.dueOn;
  // "since yesterday", "since Monday", "since Nov 12".
  const since = first
    ? daysBetween(first, today) === 1
      ? 'yesterday'
      : daysBetween(first, today) < 7
        ? weekdayName(first)
        : shortDate(first, today)
    : null;
  const run = (how: 'done' | 'skip') => {
    if (busy) return;
    setBusy(how);
    void onCatchUp(missed, how).finally(() => setBusy(null));
  };
  const name = `${missed.title} · ${n} missed`;
  return (
    <Row
      last={last}
      title={missed.title}
      accessibilityLabel={`${name}${since ? `, since ${since}` : ''}`}
      leading={
        <View
          style={[styles.mark, { borderColor: owner?.color ?? color.ink }]}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          <Repeat2 size={13} strokeWidth={2.4} color={color.ink} />
        </View>
      }
      meta={
        <>
          <Meta strong icon={<Hatch width={13} height={9} radius={3} />}>
            {`${n} missed`}
          </Meta>
          {since ? <Meta>{`since ${since}`}</Meta> : null}
          {owner ? <Meta>{owner.isMe ? 'Your turn' : `${owner.name}’s turn`}</Meta> : null}
        </>
      }
      footer={
        <View style={styles.actions}>
          <Step
            label="Done"
            name={`Done: ${missed.title}, and skip the ${n - 1} older`}
            busy={busy === 'done'}
            disabled={!!busy}
            strong
            onPress={() => run('done')}
          />
          <Step
            label="Skip missed"
            name={`Skip missed: ${missed.title}`}
            busy={busy === 'skip'}
            disabled={!!busy}
            onPress={() => run('skip')}
          />
        </View>
      }
    />
  );
}

function Step({
  label,
  name,
  busy,
  disabled,
  strong,
  onPress,
}: {
  label: string;
  name: string;
  busy: boolean;
  disabled: boolean;
  strong?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlopFor(28)}
      style={(s: PressState) => [
        styles.step,
        strong && styles.stepStrong,
        s.hovered && !strong && styles.stepHover,
        disabled && !busy && styles.stepIdle,
      ]}
    >
      <HitArea slop={hitSlopFor(28)} border={1} />
      <Text variant="small" color={strong ? color.onInk : color.ink} style={styles.stepText}>
        {busy ? `${label}…` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(color.ink, 0.04),
  },
  actions: { flexDirection: 'row', gap: space[2] - 2 },
  step: {
    minHeight: 28,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line2,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  stepStrong: { backgroundColor: color.ink, borderColor: color.ink },
  stepHover: { borderColor: color.ink, backgroundColor: color.surface },
  stepIdle: { opacity: 0.5 },
  stepText: { fontFamily: 'Figtree-700' },
});
