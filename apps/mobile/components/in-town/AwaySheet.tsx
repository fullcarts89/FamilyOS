import { Check, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { ErrorNotice } from '../../design/Notice';
import { RoundCheckbox } from '../../design/RoundCheckbox';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, radius } from '../../design/tokens';
import {
  api,
  errorMessage,
  type AwayPeriodView,
  type HandoverResponse,
  type HandoverSuggestion,
} from '../../lib/api';
import { addDays, relativeDay } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { awayRange, givenBack, handoverDone, paybackLine } from '../../lib/in-town';
import { usePeople } from '../../lib/people';
import { DayStepper } from './DayStepper';

export type AwayTarget =
  | { mode: 'add'; memberId?: string }
  | { mode: 'edit'; period: AwayPeriodView }
  /** Straight to the review of what it suggests handing over. */
  | { mode: 'review'; period: AwayPeriodView };

/**
 * Mark someone away, change their dates or who covers, or remove it; then review what it
 * suggests handing over (owner decision 2026-11-24: nothing moves until an adult confirms).
 * Routine turns created later and care handoffs go to the cover on their own; the sheet says so.
 */
export function AwaySheet({
  target,
  today,
  onClose,
  onChanged,
}: {
  target: AwayTarget | null;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const title =
    target?.mode === 'add' ? 'Mark someone away' : target?.mode === 'review' ? 'Hand over' : 'Away';
  return (
    <Sheet visible={target !== null} onClose={onClose} label={title} title={title} width={560}>
      {target ? (
        <AwayForm
          key={target.mode === 'add' ? 'add' : `${target.mode}:${target.period.id}`}
          target={target}
          today={today}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </Sheet>
  );
}

function AwayForm({
  target,
  today,
  onClose,
  onChanged,
}: {
  target: AwayTarget;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const editing = target.mode === 'add' ? null : target.period;
  const [memberId, setMemberId] = useState<string | null>(
    editing?.memberId ?? (target.mode === 'add' ? (target.memberId ?? null) : null),
  );
  const [startsOn, setStartsOn] = useState<string>(editing?.startsOn ?? addDays(today, 1));
  const [endsOn, setEndsOn] = useState<string | null>(editing ? editing.endsOn : addDays(today, 3));
  const member = people.byId(memberId);
  const covers = people.all.filter(
    (p) => (p.role === 'owner' || p.role === 'adult') && p.id !== memberId,
  );
  const [coverId, setCoverId] = useState<string | null>(
    editing ? editing.coverMemberId : covers.length === 1 ? (covers[0]?.id ?? null) : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // After saving (or opening a review): what it suggests handing over.
  const [review, setReview] = useState<{
    period: AwayPeriodView;
    suggestions: HandoverSuggestion[];
  } | null>(null);

  // Review mode loads the list.
  useEffect(() => {
    if (target.mode !== 'review' || !household) return;
    let alive = true;
    api<HandoverResponse>(`/households/${household.id}/away-periods/${target.period.id}/handover`)
      .then((r) => alive && setReview({ period: r.awayPeriod, suggestions: r.suggestions }))
      .catch((caught: unknown) => alive && setError(errorMessage(caught)));
    return () => {
      alive = false;
    };
  }, [target, household]);

  const base = household ? `/households/${household.id}` : '';
  // Choosing who's away also picks the default cover: the other adult, if there's just one.
  const choose = (id: string) => {
    setMemberId(id);
    const chosen = people.byId(id);
    const others = people.all.filter(
      (p) => (p.role === 'owner' || p.role === 'adult') && p.id !== id,
    );
    setCoverId(chosen && !chosen.caredFor && others.length === 1 ? (others[0]?.id ?? null) : null);
  };
  const caredFor = member?.caredFor ?? false;

  const save = async () => {
    if (!household || !memberId) return;
    setBusy('save');
    setError(null);
    try {
      const body = { startsOn, endsOn, coverMemberId: caredFor ? null : coverId };
      if (
        editing &&
        editing.startsOn === body.startsOn &&
        editing.endsOn === body.endsOn &&
        editing.coverMemberId === body.coverMemberId
      ) {
        onClose();
        return;
      }
      type Saved = {
        awayPeriod: AwayPeriodView;
        suggestions: HandoverSuggestion[];
        /** Edits only: what went back to them. */
        returned?: number;
      };
      const res = editing
        ? await api<Saved>(`${base}/away-periods/${editing.id}`, {
            method: 'PATCH',
            body: { expectedVersion: editing.version, ...body },
          })
        : await api<Saved>(`${base}/away-periods`, {
            method: 'POST',
            body: { memberId, ...body },
          });
      onChanged();
      const back = givenBack(res.returned ?? 0, memberId, people);
      if (res.suggestions.length > 0) {
        if (back) toast.show(back);
        setReview({ period: res.awayPeriod, suggestions: res.suggestions });
      } else {
        toast.show(editing ? 'Saved' : `${member?.isMe ? 'You’re' : `${member?.name}’s`} away`, {
          ...(back ? { detail: back } : {}),
        });
        onClose();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!household || !editing) return;
    setBusy('remove');
    setError(null);
    try {
      const { returned } = await api<{ returned: number }>(
        `${base}/away-periods/${editing.id}?expectedVersion=${editing.version}`,
        { method: 'DELETE' },
      );
      onChanged();
      const back = givenBack(returned, editing.memberId, people);
      toast.show('Removed', back ? { detail: back } : {});
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (review) {
    return (
      <Review
        period={review.period}
        suggestions={review.suggestions}
        today={today}
        onDone={() => {
          onChanged();
          onClose();
        }}
      />
    );
  }
  if (target.mode === 'review') {
    return error ? <ErrorNotice message={error} /> : <Text tone="muted">Loading…</Text>;
  }

  const who = people.all;
  return (
    <View style={styles.form}>
      {!editing ? (
        <View style={styles.group}>
          <Text variant="label">Who’s away?</Text>
          <View style={styles.chips}>
            {who.map((p) => (
              <Chip
                key={p.id}
                label={p.isMe ? 'Me' : p.name}
                leading={<Avatar person={p} size={18} />}
                accent={p.color}
                selected={memberId === p.id}
                onPress={() => choose(p.id)}
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.who}>
          {member ? <Avatar person={member} size={36} /> : null}
          <Text variant="chapter">{member?.isMe ? 'You' : (member?.name ?? 'Someone')}</Text>
        </View>
      )}
      <DayStepper
        label="First day away"
        value={startsOn}
        today={today}
        onChange={(d) => {
          if (!d) return;
          setStartsOn(d);
          if (endsOn !== null && endsOn < d) setEndsOn(d);
        }}
      />
      <DayStepper
        label="Last day away"
        value={endsOn}
        today={today}
        min={startsOn}
        none="No end yet"
        onChange={setEndsOn}
      />
      <Text variant="meta" tone="muted">
        {endsOn
          ? `Back ${relativeDay(addDays(endsOn, 1), today, { late: false })}. What’s due that day stays theirs.`
          : 'Set the last day once you know it.'}
      </Text>
      {member && !caredFor ? (
        <View style={styles.group}>
          <Text variant="label">Who covers?</Text>
          <View style={styles.chips}>
            {covers.map((p) => (
              <Chip
                key={p.id}
                label={p.isMe ? 'Me' : p.name}
                leading={<Avatar person={p} size={18} />}
                accent={p.color}
                selected={coverId === p.id}
                onPress={() => setCoverId(p.id)}
              />
            ))}
            <Chip label="Nobody" selected={coverId === null} onPress={() => setCoverId(null)} />
          </View>
          <Text variant="meta" tone="muted">
            {coverId
              ? 'Their drop-offs and pickups, and routine turns as they come up, go to whoever covers. Other things are suggested first.'
              : 'Nothing moves. Today shows anything nobody is down for.'}
          </Text>
        </View>
      ) : member ? (
        <Text variant="meta" tone="muted">
          Today will ask about {member.name}’s drop-offs and pickups while they’re away.
        </Text>
      ) : null}

      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        {confirmRemove && editing ? (
          <View style={styles.confirm}>
            <Text variant="body">
              Remove {awayRange(editing, today)}? Anything it moved that’s still ahead goes back.
            </Text>
            <View style={styles.actions}>
              <Button title="Remove" busy={busy === 'remove'} onPress={remove} />
              <Button title="Keep it" variant="quiet" onPress={() => setConfirmRemove(false)} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <Button
              title={editing ? 'Save' : 'Mark away'}
              icon={Check}
              busy={busy === 'save'}
              disabled={!memberId}
              onPress={save}
            />
            {editing ? (
              <Button
                title="Remove"
                icon={Trash2}
                variant="quiet"
                onPress={() => setConfirmRemove(true)}
              />
            ) : null}
            <Button title="Cancel" variant="quiet" onPress={onClose} />
          </View>
        )}
      </SheetActions>
    </View>
  );
}

/** What an away period suggests handing over: all ticked, untick what stays; one tap moves them. */
function Review({
  period,
  suggestions,
  today,
  onDone,
}: {
  period: AwayPeriodView;
  suggestions: HandoverSuggestion[];
  today: string;
  onDone: () => void;
}) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const [chosen, setChosen] = useState(() => new Set(suggestions.map((s) => s.item.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = people.byId(period.memberId);
  const cover = people.byId(period.coverMemberId);
  const canAct = household?.role !== 'caregiver';

  const confirm = async () => {
    if (!household) return;
    setBusy(true);
    setError(null);
    try {
      const move = suggestions
        .filter((s) => chosen.has(s.item.id))
        .map((s) => ({ id: s.item.id, expectedVersion: s.item.version }));
      const keep = suggestions.filter((s) => !chosen.has(s.item.id)).map((s) => s.item.id);
      const res = await api<{ moved: number; paybacks: number }>(
        `/households/${household.id}/away-periods/${period.id}/handover`,
        { method: 'POST', body: { move, keep } },
      );
      toast.show(handoverDone(res.moved, period, people), {
        ...(res.paybacks > 0 && { detail: paybackLine(period, people, res.paybacks) }),
      });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (suggestions.length === 0) {
    return (
      <View style={styles.form}>
        <Text variant="body">Nothing else to hand over.</Text>
        <Button title="Done" onPress={onDone} />
      </View>
    );
  }
  const whose = who?.isMe ? 'your' : `${who?.name ?? 'their'}’s`;
  return (
    <View style={styles.form}>
      <View style={styles.group}>
        <Text variant="chapter">
          Hand these to {cover?.isMe ? 'you' : (cover?.name ?? 'the adult at home')}?
        </Text>
        <Text variant="body" tone="muted">
          These are {whose}, due while {who?.isMe ? 'you’re' : 'they’re'} away (
          {awayRange(period, today)}). Untick anything that stays. Private things never move.
        </Text>
      </View>
      <View style={styles.list}>
        {suggestions.map((s) => {
          const on = chosen.has(s.item.id);
          return (
            <View key={s.item.id} style={styles.item}>
              <RoundCheckbox
                checked={on}
                label={`Hand over “${s.item.title}”`}
                onPress={() =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.item.id)) next.delete(s.item.id);
                    else next.add(s.item.id);
                    return next;
                  })
                }
              />
              <View style={styles.itemText}>
                <Text variant="title">{s.item.title}</Text>
                <Text variant="meta" tone="muted">
                  {relativeDay(s.date, today, { late: false })}
                  {s.item.recurrenceRuleId ? ' · a routine turn' : ''}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      {suggestions.some((s) => s.item.recurrenceRuleId) ? (
        <Text variant="meta" tone="muted">
          A routine turn that moves is paid back. {paybackLine(period, people)}
        </Text>
      ) : null}
      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        <View style={styles.actions}>
          {canAct ? (
            <Button
              title={
                chosen.size === 0
                  ? 'Keep them all'
                  : chosen.size === suggestions.length
                    ? 'Hand them over'
                    : `Hand over ${chosen.size}`
              }
              icon={Check}
              busy={busy}
              onPress={confirm}
            />
          ) : null}
          <Button title="Not now" variant="quiet" onPress={onDone} />
        </View>
      </SheetActions>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18, paddingBottom: 8 },
  group: { gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  confirm: { gap: 10 },
  list: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  itemText: { flex: 1, gap: 2 },
});
