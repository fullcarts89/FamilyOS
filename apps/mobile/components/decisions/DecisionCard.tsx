import { Check, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { Text } from '../../design/Text';
import { color, font, radius } from '../../design/tokens';
import type { Decision } from '../../lib/api';
import { relativeDay, shortDate } from '../../lib/dates';
import { decidedLabel } from '../../lib/decisions';
import { usePeople, type Person } from '../../lib/people';

/**
 * One decision: the question, its options with who picked what (faces, never tallies), and where
 * it stands in plain words. `together` is for one screen: when you agree out loud, settle it.
 */
export function DecisionCard({
  decision: d,
  today,
  together,
  onVote,
  onDecideTogether,
  onReopen,
}: {
  decision: Decision;
  today: string;
  together?: boolean;
  onVote: (d: Decision, optionId: string) => Promise<unknown>;
  onDecideTogether?: (d: Decision, optionId: string) => Promise<unknown>;
  onReopen?: (d: Decision) => void;
}) {
  const people = usePeople();
  const [busy, setBusy] = useState<string | null>(null);
  const decided = d.status === 'decided';
  const label = decidedLabel(d);
  const pickedBy = (optionId: string): Person[] =>
    d.votes
      .filter((v) => v.optionId === optionId)
      .map((v) => people.byId(v.memberId))
      .filter((p): p is Person => !!p);
  const others = people.adults.filter((p) => !p.isMe);
  const waiting = d.waitingOn.map((id) => people.byId(id)).filter((p): p is Person => !!p);
  const theirVotes = d.votes.filter((v) => v.memberId !== people.me?.id);
  const disagree = !!d.myVoteOptionId && theirVotes.some((v) => v.optionId !== d.myVoteOptionId);
  const due = d.dueOn ? relativeDay(d.dueOn, today) : null;
  const late = !!d.dueOn && d.dueOn < today && !decided;

  const status = decided
    ? d.decidedVia === 'agreement'
      ? 'You both picked it.'
      : 'Settled together.'
    : !d.myVoteOptionId
      ? waiting.length > 1 || others.length === 0
        ? 'Nobody has voted yet.'
        : theirVotes.length
          ? `${theirVotes.map((v) => people.byId(v.memberId)?.name ?? 'They').join(' and ')} voted. Your turn.`
          : 'Your turn to vote.'
      : waiting.length
        ? together
          ? `${waiting.map((p) => p.name).join(' and ')} hasn’t voted. On one screen? Agree out loud.`
          : `Waiting on ${waiting.map((p) => p.name).join(' and ')}. They can vote on their phone.`
        : disagree
          ? 'You picked differently. Talk it through, then one of you can change their vote.'
          : 'Waiting for everyone to agree.';

  const press = async (optionId: string) => {
    setBusy(optionId);
    await onVote(d, optionId);
    setBusy(null);
  };

  return (
    <View
      style={[styles.card, decided && styles.cardDecided]}
      accessibilityLabel={`Decision: ${d.question}`}
    >
      <View style={styles.head}>
        <Text variant="h3" style={styles.question}>
          {d.question}
        </Text>
        {decided ? (
          <View style={styles.badge}>
            <Check size={13} strokeWidth={3} color={color.onInk} />
            <Text variant="small" color={color.onInk}>
              Decided together
            </Text>
          </View>
        ) : due ? (
          <View style={styles.due}>
            {late ? <Hatch width={14} height={9} radius={2} /> : null}
            <Text variant="small" tone={late ? 'ink' : 'muted'}>
              {late
                ? `Was due ${shortDate(d.dueOn ?? '')}`
                : `Due ${/^(Today|Tomorrow)$/.test(due) ? due.toLowerCase() : due}`}
            </Text>
          </View>
        ) : null}
      </View>
      {d.context ? (
        <Text variant="meta" tone="muted">
          {d.context}
        </Text>
      ) : null}

      {decided ? (
        <View style={styles.outcome}>
          <Text style={styles.outcomeText}>{label ?? 'Decided'}</Text>
          <View style={styles.faces}>
            {pickedBy(d.decidedOptionId ?? '').map((p) => (
              <Avatar key={p.id} person={p} size={22} ring />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.options} accessibilityRole="radiogroup" aria-label={d.question}>
          {d.options.map((o) => {
            const mine = d.myVoteOptionId === o.id;
            const faces = pickedBy(o.id);
            return (
              <Pressable
                key={o.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: mine, busy: busy === o.id }}
                aria-checked={mine}
                aria-busy={busy === o.id}
                accessibilityLabel={`${o.label}${faces.length ? `, picked by ${faces.map((p) => (p.isMe ? 'you' : p.name)).join(' and ')}` : ''}`}
                onPress={() => void press(o.id)}
                style={(s: PressState) => [
                  styles.option,
                  mine && styles.optionMine,
                  !mine && s.hovered && styles.optionHover,
                  s.pressed && styles.pressed,
                ]}
              >
                <View style={[styles.radio, mine && styles.radioOn]}>
                  {mine ? <Check size={13} strokeWidth={3.2} color={color.onInk} /> : null}
                </View>
                <View style={styles.optionText}>
                  <Text variant="title">{o.label}</Text>
                  {o.detail ? (
                    <Text variant="small" tone="muted">
                      {o.detail}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.faces}>
                  {faces.map((p) => (
                    <Avatar key={p.id} person={p} size={22} ring />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.foot}>
        <Text variant="meta" tone="muted" style={styles.status} aria-live="polite">
          {status}
        </Text>
        {!decided &&
        together &&
        d.myVoteOptionId &&
        onDecideTogether &&
        (waiting.length > 0 || disagree) ? (
          <Button
            size="sm"
            title={`We agree: ${d.options.find((o) => o.id === d.myVoteOptionId)?.label ?? ''}`}
            icon={Check}
            busy={busy === 'together'}
            onPress={async () => {
              setBusy('together');
              await onDecideTogether(d, d.myVoteOptionId ?? '');
              setBusy(null);
            }}
          />
        ) : null}
        {decided && onReopen ? (
          <Button
            size="sm"
            variant="quiet"
            title="Reopen"
            icon={Undo2}
            onPress={() => onReopen(d)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  cardDecided: { borderColor: color.ink },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  question: { flex: 1, minWidth: 200, fontSize: 18, lineHeight: 23 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  due: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line2,
    cursor: 'pointer',
  },
  optionMine: { borderColor: color.ink },
  optionHover: { borderColor: color.ink },
  pressed: { transform: [{ scale: 0.99 }] },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: color.ink, borderColor: color.ink },
  optionText: { flex: 1, gap: 1 },
  faces: { flexDirection: 'row', gap: 2 },
  outcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  outcomeText: { fontFamily: font.serif, fontSize: 22, lineHeight: 28, color: color.ink, flex: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  status: { flex: 1, minWidth: 180 },
});
