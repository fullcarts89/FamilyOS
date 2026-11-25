import type { HeadsUp } from '@familyos/domain';
import { router, useFocusEffect } from 'expo-router';
import { Car, Hourglass, Luggage, Repeat2, Vote } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, radius, space, touch } from '../../design/tokens';
import { api, type Occurrence, type WorkItem } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { relativeDay } from '../../lib/dates';
import { trackRequests, useDeclined, useOccurrenceActions } from '../../lib/events';
import { useHousehold } from '../../lib/household';
import type { People } from '../../lib/people';
import { CARE_VERB, timeOf } from '../../lib/rhythm';
import {
  requestsKey,
  requestView,
  waitingWords,
  type CoverRequest,
  type CoverRequestLists,
  type WithRequest,
} from '../reset/coordination';

export interface DatedHeadsUp {
  date: string;
  headsUp: HeadsUp;
}

/**
 * Heads-ups as rows you can act on: a pickup that clashes with a meeting ("Ask Theo to cover"),
 * a drop-off nobody has, a routine still open after its day, and a request from the other adult
 * to cover something ("Maya asked you to cover June's pickup", Accept or Decline), and a handoff
 * still on while the child or pet it's for is away ("Skip it"). Each is a rule
 * over real data; the buttons do the thing, and the row changes once the server agrees. Asking
 * someone changes nothing until they accept: the row says "Asked Theo · waiting" meanwhile.
 */
export function HeadsUps({
  items,
  today,
  timeZone,
  people,
  occurrence,
  workItem,
  onCover,
  onOpen,
  onComplete,
  onAssign,
  requests: given,
  onChanged,
}: {
  items: DatedHeadsUp[];
  today: string;
  timeZone: string;
  people: People;
  occurrence: (key: string) => Occurrence | undefined;
  workItem: (id: string) => WorkItem | undefined;
  onCover: (o: Occurrence, memberId: string) => Promise<boolean>;
  onOpen: (o: Occurrence) => void;
  onComplete: (item: WorkItem) => void;
  onAssign: (item: WorkItem, ownerId: string | null) => void;
  /** What you've been asked and are waiting on (GET /events' `coverRequests`); loaded if absent. */
  requests?: CoverRequestLists;
  /** After an answer: reload the screen (default: every visible screen reloads). */
  onChanged?: () => void;
}) {
  const { household } = useHousehold();
  const { changed } = useCapture();
  const actions = useOccurrenceActions(onChanged ?? changed);
  const [loaded, setLoaded] = useState<CoverRequestLists | null>(null);
  const requests = given ?? loaded;
  const meId = people.me?.id;

  // Without the lists from the screen, ask for them whenever the heads-ups reload.
  const known = useRef<string | null>(null);
  useEffect(() => {
    if (given || !household) return;
    let alive = true;
    api<CoverRequestLists>(`/households/${household.id}/cover-requests`)
      .then((r) => {
        if (!alive) return;
        known.current = requestsKey(r);
        setLoaded(r);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [given, household, items]);

  // While this screen is open, notice the other adult's answer (or a new ask) within seconds:
  // when what's waiting changes, every visible screen reloads, so the row says what happened.
  useFocusEffect(
    useCallback(() => {
      if (given || !household) return;
      const timer = setInterval(() => {
        api<CoverRequestLists>(`/households/${household.id}/cover-requests`)
          .then((r) => {
            const key = requestsKey(r);
            if (known.current !== null && key !== known.current) changed();
            known.current = key;
            setLoaded(r);
          })
          .catch(() => undefined);
      }, REQUESTS_REFRESH_MS);
      return () => clearInterval(timer);
    }, [given, household, changed]),
  );

  // Requests you made that are no longer waiting: was it a no?
  useEffect(() => {
    const seen = items
      .map(({ headsUp: h }) => ('occurrenceKey' in h ? occurrence(h.occurrenceKey) : undefined))
      .filter((o): o is Occurrence => !!o);
    trackRequests(household?.id, meId, seen);
  }, [items, occurrence, household, meId]);

  // Asked of you, about something with no heads-up of its own: a row to answer it.
  const shown = new Set(
    items.map(({ headsUp: h }) => ('occurrenceKey' in h ? h.occurrenceKey : h.id)),
  );
  const asks = (requests?.askedOfMe ?? []).filter(
    (r) => !shown.has(`${r.eventId}:${r.date}`) && occurrence(`${r.eventId}:${r.date}`),
  );

  if (items.length === 0 && asks.length === 0) return null;
  return (
    <View style={styles.list} role="list" aria-label="Heads-ups">
      {asks.map((r) => {
        const o = occurrence(`${r.eventId}:${r.date}`);
        return o ? (
          <View key={r.id} role="listitem">
            <FadeIn>
              <AskedRow
                request={r}
                o={o}
                today={today}
                timeZone={timeZone}
                people={people}
                actions={actions}
                onOpen={onOpen}
              />
            </FadeIn>
          </View>
        ) : null;
      })}
      {items.map(({ date, headsUp }) => (
        <View key={headsUp.id} role="listitem">
          <FadeIn>
            <HeadsUpRow
              date={date}
              h={headsUp}
              today={today}
              timeZone={timeZone}
              people={people}
              occurrence={occurrence}
              workItem={workItem}
              onCover={onCover}
              onOpen={onOpen}
              onComplete={onComplete}
              onAssign={onAssign}
              actions={actions}
            />
          </FadeIn>
        </View>
      ))}
    </View>
  );
}

const dayWord = (date: string, today: string) => relativeDay(date, today, { late: false });

/** How often an open Today checks whether a request was answered (or a new one came in). */
const REQUESTS_REFRESH_MS = 8000;

/** "Thu 5:30pm", "Today 5:30pm". */
const shortWhen = (o: Occurrence, today: string, timeZone: string) => {
  const day = dayWord(o.date, today);
  return `${/^(Today|Tomorrow)$/.test(day) ? day : day.slice(0, 3)} ${timeOf(o.startsAt, timeZone)}`;
};

/** "June’s pickup", or “Swim lesson”. */
const whatOf = (o: Occurrence, people: People) => {
  const child = people.byId(o.careMemberId);
  return child && o.careAction ? `${child.name}’s ${CARE_VERB[o.careAction]}` : `“${o.title}”`;
};

type Actions = ReturnType<typeof useOccurrenceActions>;

/** The other adult asked you to cover something: say yes or no. */
function AskedRow({
  request,
  o,
  today,
  timeZone,
  people,
  actions,
  onOpen,
}: {
  request: CoverRequest;
  o: Occurrence;
  today: string;
  timeZone: string;
  people: People;
  actions: Actions;
  onOpen: (o: Occurrence) => void;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const asker = people.byId(request.askedByMemberId);
  const run = async (which: 'accept' | 'decline') => {
    setBusy(which);
    await actions[which](request, o, { today });
    setBusy(null);
  };
  return (
    <View style={[styles.row, styles.asked]}>
      <View style={styles.icon}>
        <Car size={17} color={people.byId(o.careMemberId)?.color ?? color.ink} strokeWidth={2.4} />
      </View>
      <View style={styles.body}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the details"
          onPress={() => onOpen(o)}
          style={(s: PressState) => [
            styles.text,
            { cursor: 'pointer' },
            s.hovered && { opacity: 0.8 },
          ]}
        >
          <Text variant="title">
            {asker?.name ?? 'Someone'} asked you to cover {whatOf(o, people)} ·{' '}
            {shortWhen(o, today, timeZone)}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          <Button
            size="md"
            title="Accept"
            busy={busy === 'accept'}
            disabled={busy !== null}
            onPress={() => void run('accept')}
          />
          <Button
            size="md"
            variant="secondary"
            title="Decline"
            busy={busy === 'decline'}
            disabled={busy !== null}
            onPress={() => void run('decline')}
          />
        </View>
      </View>
    </View>
  );
}

function HeadsUpRow({
  date,
  h,
  today,
  timeZone,
  people,
  occurrence,
  workItem,
  onCover,
  onOpen,
  onComplete,
  onAssign,
  actions: occurrenceActions,
}: {
  date: string;
  h: HeadsUp;
  today: string;
  timeZone: string;
  people: People;
  occurrence: (key: string) => Occurrence | undefined;
  workItem: (id: string) => WorkItem | undefined;
  onCover: (o: Occurrence, memberId: string) => Promise<boolean>;
  onOpen: (o: Occurrence) => void;
  onComplete: (item: WorkItem) => void;
  onAssign: (item: WorkItem, ownerId: string | null) => void;
  actions: Actions;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const declinedBy = useDeclined();
  const when = dayWord(date, today);
  const cover = async (o: Occurrence, id: string) => {
    setBusy(id);
    await onCover(o, id);
    setBusy(null);
  };

  let icon = <Hatch width={18} height={12} radius={3} />;
  let text: string;
  let status: string | null = null;
  let actions: React.ReactNode = null;
  let open: (() => void) | null = null;

  if (h.type === 'handoff_conflict' || h.type === 'care_unassigned') {
    const o = occurrence(h.occurrenceKey) as WithRequest | undefined;
    const view = o ? requestView(o, people.me?.id) : ({ kind: 'none' } as const);
    if (o && view.kind === 'forMe') {
      return (
        <AskedRow
          request={view.request}
          o={o}
          today={today}
          timeZone={timeZone}
          people={people}
          actions={occurrenceActions}
          onOpen={onOpen}
        />
      );
    }
    const child = people.byId(
      o?.careMemberId ?? (h.type === 'care_unassigned' ? h.careMemberId : null),
    );
    const what =
      child && o?.careAction
        ? `${child.name}’s ${CARE_VERB[o.careAction]}`
        : `“${o?.title ?? 'the event'}”`;
    const at = timeOf(h.time, timeZone);
    if (h.type === 'handoff_conflict') {
      const clash = occurrence(h.conflictingOccurrenceKey);
      const who = people.byId(h.memberId);
      const whose = who?.isMe ? 'Your' : `${who?.name ?? 'Someone'}’s`;
      text = `${when}: ${whose} ${clash ? `“${clash.title}”` : 'other plan'} runs into ${what} at ${at}.`;
      const others = people.adults.filter((p) => p.id !== h.memberId);
      actions = o
        ? others
            .slice(0, 2)
            .filter((p) => view.kind === 'none' || p.isMe)
            .map((p) => (
              <Button
                key={p.id}
                size="md"
                variant="primary"
                title={p.isMe ? 'I’ll cover it' : `Ask ${p.name} to cover`}
                busy={busy === p.id}
                onPress={() => void cover(o, p.id)}
              />
            ))
        : null;
    } else {
      text = `${when}: nobody has ${what} at ${at} yet.`;
      icon = <Car size={17} color={child?.color ?? color.ink} strokeWidth={2.4} />;
      const me = people.me;
      const partner = people.partner;
      actions = o ? (
        <>
          {me && !me.caredFor ? (
            <Button
              size="md"
              title="I’ll take it"
              busy={busy === me.id}
              onPress={() => void cover(o, me.id)}
            />
          ) : null}
          {partner && view.kind === 'none' ? (
            <Button
              size="md"
              variant="secondary"
              title={`Ask ${partner.name}`}
              busy={busy === partner.id}
              onPress={() => void cover(o, partner.id)}
            />
          ) : null}
        </>
      ) : null;
    }
    if (o && (view.kind === 'mine' || view.kind === 'others')) {
      // Asked, not answered: it stays where it was until they say yes.
      const asked = people.byId(view.request.askedMemberId);
      status = waitingWords(asked?.name ?? 'them');
      icon = <Hourglass size={17} color={asked?.color ?? color.ink} strokeWidth={2.4} />;
      if (view.kind === 'mine') {
        const request = view.request;
        actions = (
          <>
            {actions}
            <Button
              size="md"
              variant="secondary"
              title="Cancel request"
              busy={busy === 'cancel'}
              onPress={async () => {
                setBusy('cancel');
                await occurrenceActions.cancelRequest(request, o);
                setBusy(null);
              }}
            />
          </>
        );
      }
    } else if (o) {
      const no = people.byId(declinedBy(o));
      if (no) status = `${no.name} can’t make it`;
    }
    if (o) open = () => onOpen(o);
  } else if (h.type === 'care_while_away') {
    // A child or pet is away (Who's in town): their handoff is probably not needed.
    const o = occurrence(h.occurrenceKey);
    const child = people.byId(h.careMemberId);
    icon = <Luggage size={17} color={child?.color ?? color.ink} strokeWidth={2.2} />;
    const what = o?.careAction ? CARE_VERB[o.careAction] : 'handoff';
    text = `${when}: ${child?.name ?? 'They'}’s away, but the ${what} at ${timeOf(h.time, timeZone)} is still on.`;
    const me = people.me;
    actions =
      o && me && !me.caredFor && me.role !== 'caregiver' ? (
        <Button
          size="md"
          variant="secondary"
          title="Skip it"
          busy={busy === 'skip'}
          onPress={async () => {
            setBusy('skip');
            await occurrenceActions.skip(o);
            setBusy(null);
          }}
        />
      ) : null;
    if (o) open = () => onOpen(o);
  } else if (h.type === 'overdue_routine') {
    const item = workItem(h.workItemId);
    const owner = people.byId(h.ownerMemberId);
    icon = <Repeat2 size={17} color={owner?.color ?? color.ink} strokeWidth={2.4} />;
    const title = item?.title ?? 'A routine';
    const late = relativeDay(h.dueOn, today);
    text = owner
      ? `${title} · ${late} · ${owner.isMe ? 'yours' : `${owner.name}’s turn`}`
      : `${title} · ${late} · nobody has it yet`;
    actions = item ? (
      <>
        <Button
          size="md"
          title={owner?.isMe || !owner ? 'Do it now' : 'Mark done'}
          onPress={() => onComplete(item)}
        />
        {owner?.isMe && people.partner ? (
          <Button
            size="md"
            variant="secondary"
            title={`Hand to ${people.partner.name}`}
            onPress={() => onAssign(item, people.partner?.id ?? null)}
          />
        ) : !owner?.isMe && people.me ? (
          <Button
            size="md"
            variant="secondary"
            title="I’ll take it"
            onPress={() => onAssign(item, people.me?.id ?? null)}
          />
        ) : null}
      </>
    ) : null;
    open = () => router.push({ pathname: '/item/[id]', params: { id: h.workItemId } });
  } else {
    icon = <Vote size={17} color={color.ink} strokeWidth={2.2} />;
    text = h.text;
    open = () => router.push('/decisions');
  }

  return (
    <View style={styles.row}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.body}>
        <Pressable
          accessibilityRole={open ? 'button' : undefined}
          accessibilityHint={open ? 'Opens the details' : undefined}
          disabled={!open}
          onPress={open ?? undefined}
          style={(s: PressState) => [
            styles.text,
            open && { cursor: 'pointer' },
            s.hovered && open && { opacity: 0.8 },
          ]}
        >
          <Text variant="title">{text}</Text>
          {status ? (
            <Text variant="meta" tone="muted" style={styles.status}>
              {status}
            </Text>
          ) : null}
        </Pressable>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  row: {
    flexDirection: 'row',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  icon: {
    width: space[5] + 2,
    height: touch,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { flex: 1, gap: space[2] },
  asked: { borderColor: color.ink },
  text: { minHeight: touch, justifyContent: 'center' },
  status: { marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
