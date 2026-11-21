import { Check, Hourglass } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, radius, tint } from '../../design/tokens';
import type { Occurrence, ResetResponse } from '../../lib/api';
import { weekdayName } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { currentAdult } from '../../lib/reset';
import { CARE_VERB, timeOf } from '../../lib/rhythm';
import { pendingRequest, requestView, type CoverRequest, type WithRequest } from './coordination';

export type Answer = 'accept' | 'decline' | 'cancel';

/** Every care event in the week (drop-offs, pickups, a swim lesson), in time order. */
export function careOccurrences(data: ResetResponse): Occurrence[] {
  const seen = new Map<string, Occurrence>();
  for (const d of data.events.days) {
    for (const o of d.occurrences) {
      if (o.careMemberId && !o.skipped && o.date === d.date) seen.set(o.key, o);
    }
  }
  return [...seen.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** "June’s pickup" or "Swim lesson with June" ("swim lesson with June" mid-sentence). */
export function careWhat(o: Occurrence, child: Person | null, midSentence = false): string {
  if (o.careAction) return `${child?.name ?? 'the child'}’s ${CARE_VERB[o.careAction]}`;
  const title = midSentence ? o.title.charAt(0).toLowerCase() + o.title.slice(1) : o.title;
  return child ? `${title} with ${child.name}` : title;
}

/**
 * Chapter 4, cover the week's care: what clashes or has nobody first (hatched), each with the
 * adults to choose from; then every other drop-off and pickup. Choosing yourself takes it at
 * once; choosing the other adult asks them, and it stays as it is ("Waiting for Theo", still
 * counted as needing someone) until they accept on their own phone. What you were asked to
 * cover has Accept and Decline here too.
 */
export function Cover({
  data,
  onSet,
  onAnswer,
  together,
}: {
  data: ResetResponse;
  onSet: (o: Occurrence, memberId: string) => Promise<boolean>;
  onAnswer: (o: Occurrence, request: CoverRequest, answer: Answer) => Promise<boolean>;
  /** One screen for both: the asked adult still says yes on their own phone. */
  together: boolean;
}) {
  const people = usePeople();
  const { timeZone } = useHousehold();
  const adults = people.adults.filter((p) => p.role === 'owner' || p.role === 'adult');
  const caredFor = (id: string) => !!people.byId(id)?.caredFor;
  const all = careOccurrences(data);
  const conflictBy = new Map(data.events.conflicts.map((c) => [c.occurrenceKey, c]));
  const unassigned = new Set(data.events.needsOwner.map((h) => h.occurrenceKey));
  const problems = all.filter((o) => conflictBy.has(o.key) || unassigned.has(o.key));
  const rest = all.filter((o) => !conflictBy.has(o.key) && !unassigned.has(o.key));
  const allOccurrences = data.events.days.flatMap((d) => d.occurrences);

  return (
    <View style={styles.wrap}>
      {problems.length ? (
        <View style={styles.list}>
          {problems.map((o) => {
            const child = people.byId(o.careMemberId);
            const clash = conflictBy.get(o.key);
            const clashWith = clash
              ? allOccurrences.find((x) => x.key === clash.conflictingOccurrenceKey)
              : undefined;
            const who = people.byId(clash?.memberId);
            return (
              <FadeIn key={o.key}>
                <View style={styles.problem}>
                  <View style={styles.problemHead}>
                    <Hatch width={18} height={12} radius={3} />
                    <Text variant="kicker" tone="ink">
                      {weekdayName(o.date)} · {timeOf(o.startsAt, timeZone)}
                    </Text>
                  </View>
                  <Text variant="title">
                    {clash
                      ? `${who?.isMe ? 'You have' : `${who?.name ?? 'Someone'} has`} “${clashWith?.title ?? 'something else'}” during ${careWhat(o, child, true)}.`
                      : `Nobody is down for ${careWhat(o, child, true)} yet.`}
                  </Text>
                  <Text variant="meta" tone="muted">
                    {clash ? 'Who takes it instead?' : 'Who takes it?'}
                  </Text>
                  <WhoPicker
                    o={o}
                    adults={adults}
                    caredFor={caredFor}
                    onSet={onSet}
                    avoid={clash?.memberId}
                  />
                  <RequestLine o={o} onAnswer={onAnswer} together={together} />
                </View>
              </FadeIn>
            );
          })}
        </View>
      ) : (
        <FadeIn>
          <View style={styles.settled}>
            <View style={styles.tick}>
              <Check size={14} strokeWidth={3} color={color.onInk} />
            </View>
            <Text variant="title" style={styles.flex}>
              {all.length
                ? 'Every drop-off and pickup has someone, and nothing clashes.'
                : 'No drop-offs or pickups on the calendar this week.'}
            </Text>
          </View>
        </FadeIn>
      )}

      {rest.length ? (
        <View style={styles.rest}>
          <Text variant="kicker" tone="muted">
            {problems.length ? 'The rest of the week' : 'Who has what'}
          </Text>
          {rest.map((o, i) => {
            const child = people.byId(o.careMemberId);
            const newDay = i === 0 || rest[i - 1]?.date !== o.date;
            return (
              <View key={o.key} style={[styles.line, newDay && i > 0 && styles.lineGap]}>
                <Text variant="label" style={styles.day}>
                  {newDay ? weekdayName(o.date).slice(0, 3) : ''}
                </Text>
                <View style={styles.flex}>
                  <Text variant="title" numberOfLines={1}>
                    {o.careAction
                      ? CARE_VERB[o.careAction].replace(/^./, (c) => c.toUpperCase())
                      : o.title}
                  </Text>
                  <Text variant="small" tone="muted">
                    {timeOf(o.startsAt, timeZone)}
                    {!o.careAction && child ? ` · ${child.name}` : ''}
                    {o.cover ? ' · covered this once' : ''}
                  </Text>
                  <RequestLine o={o} onAnswer={onAnswer} together={together} compact />
                </View>
                <WhoPicker o={o} adults={adults} caredFor={caredFor} onSet={onSet} compact />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A request on this occurrence: "Waiting for Theo" (with Cancel request, if you asked), or
 * "Maya asked you to cover this" with Accept and Decline.
 */
function RequestLine({
  o,
  onAnswer,
  together,
  compact,
}: {
  o: Occurrence;
  onAnswer: (o: Occurrence, request: CoverRequest, answer: Answer) => Promise<boolean>;
  together: boolean;
  compact?: boolean;
}) {
  const people = usePeople();
  const [busy, setBusy] = useState<Answer | null>(null);
  const view = requestView(o as WithRequest, people.me?.id);
  if (view.kind === 'none') return null;
  const asked = people.byId(view.request.askedMemberId);
  const asker = people.byId(view.request.askedByMemberId);
  const answer = async (a: Answer) => {
    setBusy(a);
    await onAnswer(o, view.request, a);
    setBusy(null);
  };
  return (
    <View style={[styles.request, compact && styles.requestCompact]}>
      <View style={styles.requestText}>
        <Hourglass size={14} color={(view.kind === 'forMe' ? asker : asked)?.color ?? color.ink} />
        <Text variant={compact ? 'small' : 'meta'} style={styles.flex}>
          {view.kind === 'forMe'
            ? `${asker?.name ?? 'Someone'} asked you to cover this`
            : `Waiting for ${asked?.name ?? 'them'}`}
          {view.kind === 'mine' && together && !compact ? (
            <Text variant="meta" tone="muted">
              {' '}
              · {asked?.name ?? 'They'} says yes on their own phone
            </Text>
          ) : null}
        </Text>
      </View>
      {view.kind === 'forMe' ? (
        <View style={styles.requestActions}>
          <Button
            title="Accept"
            size="sm"
            busy={busy === 'accept'}
            disabled={busy !== null}
            onPress={() => void answer('accept')}
          />
          <Button
            title="Decline"
            size="sm"
            variant="secondary"
            busy={busy === 'decline'}
            disabled={busy !== null}
            onPress={() => void answer('decline')}
          />
        </View>
      ) : view.kind === 'mine' ? (
        <View style={styles.requestActions}>
          <Button
            title="Cancel request"
            size="sm"
            variant="quiet"
            busy={busy === 'cancel'}
            onPress={() => void answer('cancel')}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The adults as small toggles: the one who has it is filled with their color. */
export function WhoPicker({
  o,
  adults,
  caredFor,
  onSet,
  avoid,
  compact,
}: {
  o: Occurrence;
  adults: Person[];
  caredFor: (id: string) => boolean;
  onSet: (o: Occurrence, memberId: string) => Promise<boolean>;
  avoid?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const current = currentAdult(o, caredFor);
  const waitingOn = pendingRequest(o as WithRequest)?.askedMemberId ?? null;
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" aria-label="Who has it">
      {adults.map((p) => {
        const on = current === p.id && p.id !== avoid;
        const waiting = waitingOn === p.id && current !== p.id;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: current === p.id, busy: busy === p.id }}
            aria-checked={current === p.id}
            aria-busy={busy === p.id}
            accessibilityLabel={`${p.isMe ? 'You' : p.name}${waiting ? ', asked, waiting' : ''}`}
            onPress={async () => {
              if (current === p.id) return;
              setBusy(p.id);
              await onSet(o, p.id);
              setBusy(null);
            }}
            style={(s: PressState) => [
              styles.who,
              compact && styles.whoCompact,
              on && { backgroundColor: tint(p.color, 0.22), borderColor: p.color },
              waiting && { borderColor: p.color, borderStyle: 'dashed' },
              current === p.id && p.id === avoid && styles.whoClash,
              !on && s.hovered && { borderColor: color.ink },
              s.pressed && styles.pressed,
            ]}
          >
            {busy === p.id ? (
              <ActivityIndicator size="small" color={p.color} />
            ) : (
              <Avatar person={p} size={compact ? 20 : 22} />
            )}
            {!compact || on || waiting ? (
              <Text variant="small" style={styles.whoText}>
                {p.isMe ? 'You' : p.name}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 22 },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 10 },
  problem: {
    gap: 6,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderStyle: 'dashed',
  },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: { gap: 2 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  lineGap: { marginTop: 6 },
  day: { width: 34 },
  picker: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  whoCompact: { minHeight: 34, paddingLeft: 5, paddingRight: 5 },
  whoClash: { borderColor: color.ink, borderStyle: 'dashed' },
  whoText: { color: color.ink },
  pressed: { transform: [{ scale: 0.96 }] },
  request: { gap: 8, marginTop: 6 },
  requestCompact: { gap: 4, marginTop: 2 },
  requestText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requestActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
