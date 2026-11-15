import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, Check, Plus, Utensils } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View, type ScrollView } from 'react-native';
import { DecisionCard } from '../../components/decisions/DecisionCard';
import { NewDecision } from '../../components/decisions/NewDecision';
import { DinnerWeek } from '../../components/meals/DinnerWeek';
import { GroceryAdd, GroceryList } from '../../components/meals/GroceryList';
import { ChapterHead } from '../../components/reset/ChapterHead';
import {
  ChapterSteps,
  ChapterTransition,
  PhoneChapterBar,
  PhoneProgress,
  chaptersFor,
  type ChapterKey,
  type StepState,
} from '../../components/reset/chapters';
import { Complete } from '../../components/reset/Complete';
import { Cover, WhoPicker, careOccurrences, careWhat } from '../../components/reset/Cover';
import { LookBack } from '../../components/reset/LookBack';
import { LooseEnds, type LooseChoice, type SortAction } from '../../components/reset/LooseEnds';
import { WeekBoard } from '../../components/reset/WeekBoard';
import { EventSheet, type EventTarget } from '../../components/rhythm/EventSheet';
import { AvatarStack } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { EmptyState, LanesArt } from '../../design/EmptyState';
import { Field } from '../../design/Field';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import {
  acknowledgeOnce,
  playChime,
  Skeleton,
  SkeletonBlock,
  useCelebrate,
  useHaptics,
} from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page } from '../../design/Page';
import { Segmented } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, font, radius } from '../../design/tokens';
import { api, errorMessage, type Decision, type Occurrence, type WorkItem } from '../../lib/api';
import { addDays, greetingFor, weekdayName } from '../../lib/dates';
import { useDecisionActions, useSettledWatcher } from '../../lib/decisions';
import { useGroceries } from '../../lib/groceries';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { useMealActions } from '../../lib/meals';
import { usePeople } from '../../lib/people';
import { currentAdult, defaultAdult, useReset } from '../../lib/reset';
import { listWords, stillOpen, weekRange } from '../../lib/reset-words';
import { localParts, timeOf } from '../../lib/rhythm';

type Mode = 'together' | 'apart';
/** -1 is the opening; the chapters are 0–5; 6 is the finished plan. */
const OPENING = -1;
const DONE = 6;
/** Chapters whose work happens mostly on the board: their panel is slimmer. */
const BOARD_HEAVY: ChapterKey[] = ['cover'];

/** A copy of `record` without `keys`. */
const without = <T,>(record: Record<string, T>, keys: string[]): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => !keys.includes(k)));

// Weekly Reset, the signature ritual: a warm opening, a look back at what you did together, then
// the week planned around one shared board (loose ends, decisions, who covers the care, dinners)
// and a distinct finish: "Your week has a plan." Adults only. Together on one screen, or each on
// your own phone with the same live data.
export default function Reset() {
  const params = useLocalSearchParams<{ chapter?: string; mode?: string; week?: string }>();
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const { phone, desktop } = useLayout();
  const toast = useToast();
  const haptics = useHaptics();
  const { celebrate } = useCelebrate();
  const [mode, setMode] = useState<Mode>(params.mode === 'apart' ? 'apart' : 'together');
  const reset = useReset({ live: mode === 'apart', week: params.week });
  const { data, writing, patch, load } = reset;
  const initial = Number(params.chapter);
  const [step, setStep] = useState(
    Number.isInteger(initial) && initial >= OPENING && initial <= DONE ? initial : OPENING,
  );
  const [dir, setDir] = useState<1 | -1>(1);
  const [play, setPlay] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [chooser, setChooser] = useState<Occurrence | null>(null);
  const [eventSheet, setEventSheet] = useState<EventTarget | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [dinnerFocus, setDinnerFocus] = useState(false);
  const groceries = useGroceries();
  const adults = people.adults.filter((p) => p.role === 'owner' || p.role === 'adult');
  const caredFor = useCallback((id: string) => !!people.byId(id)?.caredFor, [people]);
  const careNames = [
    ...new Set(
      (data ? careOccurrences(data) : [])
        .map((o) => people.byId(o.careMemberId))
        .filter((p) => p?.role === 'child')
        .map((p) => p?.name ?? ''),
    ),
  ];
  const chapters = chaptersFor(careNames.length === 1 ? (careNames[0] ?? null) : null);
  const week = data?.week.start ?? '';
  const today = data?.today ?? localParts(new Date(), timeZone).date;

  const go = useCallback(
    (i: number) => {
      setDir(i >= step ? 1 : -1);
      setStep(i);
      router.setParams({ chapter: String(i) });
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [step],
  );

  // ---------------------------------------------------------------------------------------------
  // Decisions
  // Settled during this session: the card stays where it was, now marked "Decided together".
  const [settledHere, setSettledHere] = useState<string[]>([]);
  const { putDecision: put } = reset;
  const putDecision = useCallback(
    (d: Decision) => {
      put(d);
      if (d.status === 'decided')
        setSettledHere((ids) => (ids.includes(d.id) ? ids : [...ids, d.id]));
    },
    [put],
  );
  const decisionActions = useDecisionActions(putDecision);
  const settledWatch = decisionActions.settled;
  const onSettled = useCallback(
    (d: Decision) => {
      setSettledHere((ids) => (ids.includes(d.id) ? ids : [...ids, d.id]));
      settledWatch(d);
    },
    [settledWatch],
  );
  useSettledWatcher(reset.decisions, onSettled, people.me?.id);
  const allDecisions = reset.decisions ?? data?.decisions ?? [];
  const openDecisions = allDecisions.filter((d) => d.status === 'open');
  const shownDecisions = allDecisions.filter(
    (d) => d.status === 'open' || (d.status === 'decided' && settledHere.includes(d.id)),
  );
  const recentlyDecided = allDecisions.filter(
    (d) =>
      d.status === 'decided' &&
      !settledHere.includes(d.id) &&
      !!data &&
      (d.decidedAt ?? '').slice(0, 10) >= data.lookBack.from,
  );

  // ---------------------------------------------------------------------------------------------
  // Loose ends: a stable list for the session (sorted ones stay, marked, so they can be undone).
  const cache = useRef(new Map<string, WorkItem>());
  const [looseOrder, setLooseOrder] = useState<string[] | null>(null);
  const [choices, setChoices] = useState<Record<string, LooseChoice & { before: WorkItem }>>({});
  useEffect(() => {
    if (!data) return;
    for (const i of [...data.unfinished, ...data.dueThisWeek]) cache.current.set(i.id, i);
    const ids = data.unfinished.map((i) => i.id);
    setLooseOrder((prev) => {
      if (!prev) return ids;
      const add = ids.filter((id) => !prev.includes(id));
      return add.length ? [...prev, ...add] : prev;
    });
  }, [data]);
  const looseItems = (looseOrder ?? [])
    .filter((id) => choices[id] || data?.unfinished.some((i) => i.id === id))
    .map((id) => data?.unfinished.find((i) => i.id === id) ?? cache.current.get(id))
    .filter((i): i is WorkItem => !!i);
  const unsorted = looseItems.filter((i) => !choices[i.id]);
  const keepOn = week && today > week ? today : week;
  const weekDays = data?.events.days.map((d) => d.date) ?? [];

  const bulk = useCallback(
    async (items: Record<string, unknown>[]) =>
      (
        await api<{ items: WorkItem[] }>(`/households/${household?.id}/work-items/bulk`, {
          method: 'POST',
          body: { items },
        })
      ).items,
    [household],
  );

  const choiceLabel = (item: WorkItem, a: SortAction): string => {
    switch (a.kind) {
      case 'keep':
        return keepOn === today ? 'Kept for today' : `Kept for ${weekdayName(keepOn)}`;
      case 'move':
        return a.dueOn > (data?.week.end ?? '')
          ? 'Moved to next week'
          : `Moved to ${weekdayName(a.dueOn)}`;
      case 'later':
        return 'Kept, with no date';
      case 'drop':
        return 'Let go';
      case 'hand': {
        const p = people.byId(a.to);
        return p?.isMe ? 'Yours now' : `Handed to ${p?.name ?? 'them'}`;
      }
    }
    return item.title;
  };

  const sortLoose = async (item: WorkItem, action: SortAction) => {
    const label = choiceLabel(item, action);
    setChoices((c) => ({ ...c, [item.id]: { action, label, before: item } }));
    haptics.light();
    try {
      await writing(async () => {
        const v = item.version;
        let saved =
          action.kind === 'keep'
            ? await bulk([{ id: item.id, expectedVersion: v, action: 'due', value: keepOn }])
            : action.kind === 'move'
              ? await bulk([
                  { id: item.id, expectedVersion: v, action: 'due', value: action.dueOn },
                ])
              : action.kind === 'later'
                ? await bulk([{ id: item.id, expectedVersion: v, action: 'clear_due' }])
                : action.kind === 'drop'
                  ? await bulk([{ id: item.id, expectedVersion: v, action: 'cancel' }])
                  : await bulk([
                      { id: item.id, expectedVersion: v, action: 'assign', value: action.to },
                    ]);
        if (action.kind === 'hand' && saved[0]) {
          saved = await bulk([
            { id: item.id, expectedVersion: saved[0].version, action: 'due', value: keepOn },
          ]);
        }
        for (const s of saved) cache.current.set(s.id, s);
        reset.putItems(saved);
      });
      if (action.kind === 'hand') {
        const p = people.byId(action.to);
        const from = people.byId(item.ownerMemberId);
        toast.show(
          p?.isMe
            ? from
              ? `Taken off ${from.name}’s plate`
              : `Yours now: ${item.title}`
            : `Handed to ${p?.name}: ${item.title}`,
          {
            detail: p?.isMe && !from ? 'One less thing for both of you.' : item.title,
          },
        );
      }
    } catch (caught) {
      setChoices((c) => without(c, [item.id]));
      toast.show(`Couldn’t sort “${item.title}”.`, { error: true, detail: errorMessage(caught) });
    }
  };

  const undoLoose = async (item: WorkItem) => {
    const choice = choices[item.id];
    if (!choice) return;
    const before = choice.before;
    const now = cache.current.get(item.id) ?? item;
    const dueBack = before.dueAt
      ? { action: 'due', value: before.dueAt }
      : before.dueOn
        ? { action: 'due', value: before.dueOn }
        : { action: 'clear_due' };
    try {
      await writing(async () => {
        let saved: WorkItem[];
        if (choice.action.kind === 'drop') {
          const res = await api<{ item: WorkItem }>(
            `/households/${household?.id}/work-items/${item.id}`,
            { method: 'PATCH', body: { expectedVersion: now.version, status: before.status } },
          );
          saved = [res.item];
        } else if (choice.action.kind === 'hand') {
          const first = await bulk([
            {
              id: item.id,
              expectedVersion: now.version,
              action: 'assign',
              value: before.ownerMemberId,
            },
          ]);
          saved = await bulk([
            { id: item.id, expectedVersion: first[0]?.version ?? now.version + 1, ...dueBack },
          ]);
        } else {
          saved = await bulk([{ id: item.id, expectedVersion: now.version, ...dueBack }]);
        }
        for (const s of saved) cache.current.set(s.id, s);
        reset.putItems(saved);
      });
      setChoices((c) => without(c, [item.id]));
    } catch (caught) {
      toast.show('Couldn’t undo that.', { error: true, detail: errorMessage(caught) });
    }
  };

  const keepRest = async () => {
    const rest = unsorted;
    if (!rest.length) return;
    const label = keepOn === today ? 'Kept for today' : `Kept for ${weekdayName(keepOn)}`;
    setChoices((c) => ({
      ...c,
      ...Object.fromEntries(
        rest.map((i) => [i.id, { action: { kind: 'keep' as const }, label, before: i }]),
      ),
    }));
    haptics.light();
    try {
      await writing(async () => {
        const saved = await bulk(
          rest.map((i) => ({ id: i.id, expectedVersion: i.version, action: 'due', value: keepOn })),
        );
        for (const s of saved) cache.current.set(s.id, s);
        reset.putItems(saved);
      });
      toast.show(
        `Kept ${rest.length === 1 ? 'one more' : `${rest.length} more`} for ${keepOn === today ? 'today' : weekdayName(keepOn)}`,
        {
          detail: 'They’re on the board now.',
        },
      );
    } catch (caught) {
      setChoices((c) =>
        without(
          c,
          rest.map((i) => i.id),
        ),
      );
      toast.show('Couldn’t keep those.', { error: true, detail: errorMessage(caught) });
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Covering the care: the board and the chapter change the same occurrence.
  const problemKeys = (r: NonNullable<typeof data>) =>
    new Set([
      ...r.events.needsOwner.map((h) => h.occurrenceKey),
      ...r.events.conflicts.map((h) => h.occurrenceKey),
    ]);

  const setHandoff = useCallback(
    async (o: Occurrence, memberId: string): Promise<boolean> => {
      if (!household || !data) return false;
      const def = defaultAdult(o, caredFor);
      const cur = currentAdult(o, caredFor);
      if (cur === memberId) return true;
      const problems = problemKeys(data);
      const wasProblem = problems.has(o.key);
      const wasConflict = data.events.conflicts.some((c) => c.occurrenceKey === o.key);
      const left = problems.size - (wasProblem ? 1 : 0);
      const next: Occurrence = {
        ...o,
        memberIds: [memberId, ...o.memberIds.filter(caredFor)],
        cover: memberId === def ? null : { memberId, replacedMemberIds: def ? [def] : [] },
      };
      patch((r) => ({
        ...r,
        events: {
          ...r.events,
          days: r.events.days.map((d) => ({
            ...d,
            occurrences: d.occurrences.map((x) => (x.key === o.key ? next : x)),
          })),
          needsOwner: r.events.needsOwner.filter((h) => h.occurrenceKey !== o.key),
          conflicts: r.events.conflicts.filter((h) => h.occurrenceKey !== o.key),
        },
        unresolved: r.unresolved.filter(
          (u) => !('occurrenceKey' in u) || u.occurrenceKey !== o.key,
        ),
      }));
      try {
        await writing(() =>
          memberId === def && o.cover
            ? api(`/households/${household.id}/events/${o.eventId}/occurrences/${o.date}`, {
                method: 'DELETE',
              })
            : api(`/households/${household.id}/events/${o.eventId}/occurrences/${o.date}`, {
                method: 'POST',
                body: { action: 'cover', memberId },
              }),
        );
      } catch (caught) {
        void load();
        toast.show(`Couldn’t change who has “${o.title}”.`, {
          error: true,
          detail: errorMessage(caught),
        });
        return false;
      }
      const who = people.byId(memberId);
      const child = people.byId(o.careMemberId);
      const at = `${weekdayName(o.date)} at ${timeOf(o.startsAt, timeZone)}`;
      const whoHas = who?.isMe ? 'You have' : `${who?.name ?? 'They'} have`;
      if (wasProblem) {
        if (left === 0) {
          celebrate({
            key: `week-covered:${week}`,
            title:
              child?.role === 'child' ? `${child.name}’s week is covered` : 'The week is covered',
            line: 'Every drop-off and pickup has someone, and nothing clashes.',
            colors: [who?.color, child?.color].filter((c): c is string => !!c),
          });
        } else {
          celebrate({
            key: `cover:${o.eventId}:${o.date}`,
            title: wasConflict ? 'Clash sorted' : 'Covered',
            line: `${whoHas.replace(/ have$/, who?.isMe ? ' have' : ' has')} ${careWhat(o, child, true)} ${at}.`,
            colors: [who?.color, child?.color].filter((c): c is string => !!c),
          });
        }
        haptics.medium();
      } else {
        haptics.light();
        toast.show(
          `${who?.isMe ? 'You have' : `${who?.name ?? 'They'} has`} ${careWhat(o, child, true)}`,
          {
            detail: `${at}. It’s on the board.`,
            undo: () => void setHandoff(next, cur ?? def ?? memberId),
          },
        );
      }
      return true;
    },
    [
      household,
      data,
      caredFor,
      patch,
      writing,
      load,
      toast,
      people,
      timeZone,
      celebrate,
      haptics,
      week,
    ],
  );

  // ---------------------------------------------------------------------------------------------
  // Dinners
  const { save: saveMeal } = useMealActions(reset.setMeals);
  const saveDinner = useCallback(
    (
      date: string,
      existing: Parameters<typeof saveMeal>[1],
      next: Parameters<typeof saveMeal>[2],
    ) => writing(() => saveMeal(date, existing, next)),
    [writing, saveMeal],
  );

  // ---------------------------------------------------------------------------------------------
  // Commit
  const commit = async () => {
    if (!household || !data) return;
    setCommitting(true);
    try {
      await writing(() =>
        api(`/households/${household.id}/reset/commit`, {
          method: 'POST',
          body: { week: data.week.start, ...(notes?.trim() ? { notes: notes.trim() } : {}) },
        }),
      );
      const first = await acknowledgeOnce(`reset:${data.week.start}`);
      setPlay(first);
      if (first) {
        haptics.medium();
        playChime();
      }
      go(DONE);
    } catch (caught) {
      toast.show('Couldn’t save the plan.', {
        error: true,
        detail: errorMessage(caught),
        action: { label: 'Try again', run: () => void commit() },
      });
    } finally {
      setCommitting(false);
    }
  };

  const seePlan = async () => {
    if (!data) return;
    const first = await acknowledgeOnce(`reset:${data.week.start}`);
    setPlay(first);
    if (first) haptics.medium();
    go(DONE);
  };

  // A plan committed elsewhere (the other phone) moves this one to the finish too.
  const committedAt = data?.plan?.committedAt ?? null;
  const sawCommit = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    if (sawCommit.current === undefined) {
      sawCommit.current = committedAt;
      return;
    }
    if (!sawCommit.current && committedAt && step !== DONE && mode === 'apart') {
      sawCommit.current = committedAt;
      void seePlan();
    }
  }, [committedAt, data]);

  // On phones the chapter bar carries quick capture, so the floating button steps aside while
  // the bar shows (it covered the bar and the chapter's last lines).
  const capture = useCapture();
  const { setFabHidden } = capture;
  const barShown = phone && !!data && step >= 0 && step < DONE;
  // Only while this screen is the one showing: another tab opened on top brings the button back.
  useFocusEffect(
    useCallback(() => {
      setFabHidden(barShown);
      return () => setFabHidden(false);
    }, [barShown, setFabHidden]),
  );

  // ---------------------------------------------------------------------------------------------
  if (household?.role === 'caregiver') {
    return (
      <Page maxWidth={860}>
        <EmptyState
          art={<LanesArt style={styles.art} />}
          title="The Weekly Reset is for the adults"
          body="It’s where the adults plan the week together. What it decides shows on Today for everyone."
          action={<Button title="Back to Today" onPress={() => router.navigate('/')} />}
        />
      </Page>
    );
  }

  if (!data) {
    return (
      <Page maxWidth={1440}>
        {reset.error ? (
          <ErrorNotice
            message="Couldn’t open the Weekly Reset. Check your connection."
            onRetry={load}
          />
        ) : (
          <Skeleton label="Opening the Weekly Reset">
            <View style={styles.skeleton}>
              <SkeletonBlock width={180} height={12} />
              <SkeletonBlock width={phone ? '90%' : 520} height={44} />
              <SkeletonBlock width={phone ? '70%' : 380} height={18} />
              <View style={styles.skeletonBoard}>
                <SkeletonBlock height={phone ? 260 : 380} />
              </View>
            </View>
          </Skeleton>
        )}
      </Page>
    );
  }

  const range = weekRange(data.week.start, data.week.end);
  const chapter = step >= 0 && step < DONE ? chapters[step] : null;
  const problems = problemKeys(data).size;
  const planned = weekDays.filter((d) =>
    data.meals.some((m) => m.onDate === d && m.slot === 'dinner'),
  ).length;
  const states: StepState[] = chapters.map((c) => {
    switch (c.key) {
      case 'loose':
        return {
          badge: unsorted.length ? `${unsorted.length} to sort` : null,
          done: looseOrder !== null && unsorted.length === 0,
        };
      case 'decide':
        return {
          badge: openDecisions.length ? `${openDecisions.length} open` : null,
          done: openDecisions.length === 0,
        };
      case 'cover':
        return { badge: problems ? `${problems} to cover` : null, done: problems === 0 };
      case 'dinners':
        return { badge: planned < 7 ? `${planned}/7` : null, done: planned === 7 };
      case 'plan':
        return { badge: null, done: !!data.plan?.committedAt };
      default:
        return { badge: null, done: step > 0 };
    }
  });

  const openingFacts = (() => {
    const parts: string[] = [];
    const care = careOccurrences(data).filter((o) => o.careAction);
    for (const name of careNames) {
      const n = care.filter((o) => people.byId(o.careMemberId)?.name === name).length;
      if (n) parts.push(`${name} has ${n} drop-offs and pickups`);
    }
    if (problems) parts.push(`${problems === 1 ? 'one needs' : `${problems} need`} someone`);
    if (openDecisions.length) {
      parts.push(
        openDecisions.length === 1
          ? 'one decision is waiting on you both'
          : `${openDecisions.length} decisions are waiting on you both`,
      );
    }
    if (planned < 7)
      parts.push(
        `${7 - planned === 1 ? 'one night has' : `${7 - planned} nights have`} no dinner yet`,
      );
    if (!parts.length)
      return 'The week looks settled already. A quick look together, then make it your plan.';
    const s = listWords(parts);
    return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
  })();

  const hour = Math.floor(localParts(new Date(), timeZone).minutes / 60);
  const me = people.me;
  const partner = adults.find((p) => !p.isMe);
  const greetingNames =
    mode === 'together' && partner && me ? `${me.name} and ${partner.name}` : (me?.name ?? '');

  const modeSwitch = (
    <View style={styles.mode}>
      <Segmented<Mode>
        label="How you’re planning"
        value={mode}
        onChange={(m) => {
          setMode(m);
          router.setParams({ mode: m });
        }}
        options={[
          {
            value: 'together',
            label: phone ? 'Together' : 'Together, one screen',
            leading: <AvatarStack people={adults} size={20} />,
          },
          { value: 'apart', label: phone ? 'Each on our phones' : 'Each on our phones' },
        ]}
      />
      <Text variant="small" tone="muted" style={styles.modeLine}>
        {mode === 'together'
          ? 'One of you drives; you decide out loud.'
          : 'Live: whatever either of you changes shows up on both phones.'}
      </Text>
    </View>
  );

  // -------------------------------------------------------------------------------------------
  const opening = (
    <View style={styles.opening}>
      <View style={[styles.openingHead, desktop && styles.openingHeadWide]}>
        <View style={styles.flex}>
          <Text variant="kicker" tone="muted">
            Weekly Reset · {range}
          </Text>
          <Text variant="greeting" style={styles.greeting}>
            {greetingFor(hour)}
            {greetingNames ? `, ${greetingNames}.` : '.'}
          </Text>
          <Text style={[styles.openingTitle, phone && styles.openingTitlePhone]}>
            {data.plan?.committedAt
              ? 'This week already has a plan.'
              : `Let’s plan ${range} together.`}
          </Text>
          <Text variant="lead" tone="muted" style={styles.openingLead}>
            {data.plan?.committedAt
              ? `${people.byId(data.plan.committedByMemberId)?.name ?? 'You'} made it your plan on ${weekdayName(localParts(data.plan.committedAt, timeZone).date)}. Look it over, or change anything that’s moved.`
              : openingFacts}
          </Text>
        </View>
        {desktop ? modeSwitch : null}
      </View>
      {!desktop ? modeSwitch : null}
      <View style={styles.preview}>
        {chapters.map((c, i) => (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            onPress={() => go(i)}
            style={(s: PressState) => [styles.previewItem, s.hovered && styles.previewHover]}
          >
            <Text style={styles.previewN}>{i + 1}</Text>
            <Text variant="label">{c.title}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.openingActions}>
        {data.plan?.committedAt ? (
          <>
            <Button
              title="See our plan"
              size="lg"
              icon={ArrowRight}
              iconRight
              onPress={() => void seePlan()}
            />
            <Button
              title="Go through it again"
              size="lg"
              variant="secondary"
              onPress={() => go(0)}
            />
          </>
        ) : (
          <Button
            title="Begin with a look back"
            size="lg"
            icon={ArrowRight}
            iconRight
            onPress={() => go(0)}
          />
        )}
        <Text variant="meta" tone="muted">
          Six short chapters, about fifteen minutes.
        </Text>
      </View>
      <View style={styles.boardBlock}>
        <Text variant="kicker" tone="muted" style={styles.boardKicker}>
          The week as it stands
        </Text>
        <WeekBoard
          data={data}
          layout={desktop ? 'grid' : 'days'}
          focus={desktop ? 'all' : ['care', 'dinners']}
          today={today}
          onHandoff={setChooser}
          onEvent={(o) => setEventSheet({ mode: 'occurrence', occurrence: o })}
        />
      </View>
    </View>
  );

  // -------------------------------------------------------------------------------------------
  const panelFor = (key: ChapterKey) => {
    switch (key) {
      case 'loose':
        return (
          <>
            <ChapterHead
              kicker="Chapter 2 · Loose ends"
              title="What carries into the week?"
              lead={`Still open from before ${weekdayName(data.week.start)}. Give each one a place: keep it, move it, hand it over, or let it go.`}
            />
            <LooseEnds
              items={looseItems}
              choices={choices}
              keepOn={keepOn}
              days={weekDays}
              nextWeek={addDays(data.week.start, 7)}
              today={today}
              timeZone={timeZone}
              onSort={(i, a) => void sortLoose(i, a)}
              onUndo={(i) => void undoLoose(i)}
              onKeepRest={() => void keepRest()}
            />
          </>
        );
      case 'decide':
        return (
          <>
            <ChapterHead
              kicker="Chapter 3 · Decide together"
              title={
                openDecisions.length
                  ? 'What needs both of you?'
                  : 'Nothing waiting on the two of you'
              }
              lead={
                mode === 'together'
                  ? 'You’re on one screen: vote, talk it through, and when you agree, settle it.'
                  : 'Each of you votes on your own phone. When you both pick the same thing, it’s decided.'
              }
            />
            <View style={styles.stack}>
              {shownDecisions.map((d) => (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  today={today}
                  together={mode === 'together'}
                  onVote={decisionActions.vote}
                  onDecideTogether={decisionActions.decideTogether}
                />
              ))}
              {recentlyDecided.length ? (
                <View style={styles.decided}>
                  <Text variant="kicker" tone="muted">
                    Decided lately
                  </Text>
                  {recentlyDecided.map((d) => (
                    <View key={d.id} style={styles.decidedRow}>
                      <View style={styles.tick}>
                        <Check size={12} strokeWidth={3} color={color.onInk} />
                      </View>
                      <Text variant="meta" style={styles.flex}>
                        {d.question}{' '}
                        <Text variant="meta" style={styles.bold}>
                          {d.options.find((o) => o.id === d.decidedOptionId)?.label}
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {addingDecision ? (
                <View style={styles.newDecision}>
                  <NewDecision
                    onCreate={decisionActions.create}
                    onDone={() => setAddingDecision(false)}
                  />
                </View>
              ) : (
                <Button
                  title="Something else to decide?"
                  icon={Plus}
                  variant="secondary"
                  size="sm"
                  onPress={() => setAddingDecision(true)}
                />
              )}
            </View>
          </>
        );
      case 'cover':
        return (
          <>
            <ChapterHead
              kicker={`Chapter 4 · ${chapters[3]?.title ?? 'Cover the handoffs'}`}
              title={
                careNames.length === 1
                  ? `Who has ${careNames[0]}, and when?`
                  : 'Who covers the drop-offs and pickups?'
              }
              lead={
                problems
                  ? `${problems === 1 ? 'One needs' : `${problems} need`} sorting: look for the hatching. Tap a handoff on the board to change who has it.`
                  : 'Everything has someone. Tap any handoff here or on the board to swap.'
              }
            />
            <Cover data={data} onSet={setHandoff} />
          </>
        );
      case 'dinners':
        return (
          <>
            <ChapterHead
              kicker="Chapter 5 · Dinners"
              title="What’s for dinner this week?"
              lead="As many nights as you like. Choosing who cooks is optional."
            />
            <DinnerWeek
              days={weekDays}
              meals={data.meals}
              today={today}
              ideas={reset.ideas}
              onSave={saveDinner}
              compact
            />
            <View style={styles.groceries}>
              <Text variant="h3">For the grocery list</Text>
              <GroceryAdd onAdd={groceries.add} compact autoFocus={dinnerFocus} />
              {groceries.items && groceries.items.some((i) => i.checkedAt === null) ? (
                <GroceryList
                  items={groceries.items}
                  showChecked={false}
                  onToggle={groceries.toggle}
                />
              ) : (
                <Text variant="meta" tone="muted">
                  Nothing on the list yet.
                </Text>
              )}
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/meals', params: { tab: 'groceries' } })}
                style={(s: PressState) => [styles.inline, s.hovered && { opacity: 0.7 }]}
              >
                <Text variant="label">Open meals and groceries</Text>
                <ArrowRight size={15} color={color.ink} strokeWidth={2.2} />
              </Pressable>
            </View>
          </>
        );
      case 'plan': {
        const open = stillOpen(data.unresolved);
        const rows: { ok: boolean; neutral?: boolean; text: string; chapter: ChapterKey }[] = [
          {
            ok: unsorted.length === 0,
            text:
              unsorted.length === 0
                ? 'Every loose end has a place'
                : `${unsorted.length} loose end${unsorted.length === 1 ? '' : 's'} still to sort`,
            chapter: 'loose',
          },
          {
            ok: openDecisions.length === 0,
            text:
              openDecisions.length === 0
                ? 'Nothing left to decide'
                : `${openDecisions.length} still to decide`,
            chapter: 'decide',
          },
          {
            ok: problems === 0,
            text:
              problems === 0
                ? 'Every drop-off and pickup has someone'
                : `${problems} drop-off${problems === 1 ? '' : 's'} or pickup${problems === 1 ? '' : 's'} need someone`,
            chapter: 'cover',
          },
          {
            ok: planned > 0,
            neutral: true,
            text:
              planned === 7
                ? 'Every dinner planned'
                : planned === 0
                  ? 'No dinners planned yet'
                  : `${planned} of 7 dinners planned`,
            chapter: 'dinners',
          },
        ];
        return (
          <>
            <ChapterHead
              kicker="Chapter 6 · Our plan"
              title="Make it our plan"
              lead="One look at where things stand, then it’s the plan you both work from: it shows on Today all week."
            />
            <View style={styles.checks}>
              {rows.map((r) => (
                <Pressable
                  key={r.chapter}
                  accessibilityRole="button"
                  accessibilityHint="Opens that chapter"
                  onPress={() => go(chapters.findIndex((c) => c.key === r.chapter))}
                  style={(s: PressState) => [styles.check, s.hovered && styles.checkHover]}
                >
                  {r.neutral ? (
                    <Utensils size={18} color={color.ink} strokeWidth={2.2} />
                  ) : r.ok ? (
                    <View style={styles.tick}>
                      <Check size={12} strokeWidth={3} color={color.onInk} />
                    </View>
                  ) : (
                    <Hatch width={20} height={14} radius={3} />
                  )}
                  <Text variant="title" style={styles.flex}>
                    {r.text}
                  </Text>
                  <ArrowRight size={15} color={color.muted} strokeWidth={2.2} />
                </Pressable>
              ))}
            </View>
            <Field
              label="Anything to remember this week? (optional)"
              value={notes ?? data.plan?.notes ?? ''}
              onChangeText={setNotes}
              placeholder="A swap you agreed, something to decide by midweek…"
              multiline
              maxLength={2000}
            />
            {open ? (
              <View style={styles.openNote}>
                <Hatch width={18} height={12} radius={3} />
                <Text variant="meta" style={styles.flex}>
                  {open} You can still make it your plan: they stay marked on Today until they’re
                  sorted.
                </Text>
              </View>
            ) : null}
            <Button
              title={data.plan?.committedAt ? 'Save the plan' : 'Make it our plan'}
              size="lg"
              icon={Check}
              busy={committing}
              onPress={() => void commit()}
            />
          </>
        );
      }
      default:
        return null;
    }
  };

  const nextTitle = step + 1 < chapters.length ? chapters[step + 1]?.title : null;
  const nav =
    chapter && !phone ? (
      <View style={styles.nav}>
        <Button title="Back" icon={ArrowLeft} variant="secondary" onPress={() => go(step - 1)} />
        {nextTitle ? (
          <Button title={nextTitle} icon={ArrowRight} iconRight onPress={() => go(step + 1)} />
        ) : null}
      </View>
    ) : null;

  const body =
    step === OPENING ? (
      opening
    ) : step === DONE ? (
      <Complete
        data={data}
        decisions={reset.decisions ?? []}
        play={play}
        onSort={(k) => go(chapters.findIndex((c) => c.key === k))}
        onChange={() => go(chapters.length - 1)}
        onHandoff={setChooser}
        onEvent={(o) => setEventSheet({ mode: 'occurrence', occurrence: o })}
      />
    ) : chapter?.key === 'look' ? (
      <View style={styles.reading}>
        <LookBack data={data} />
        {nav}
      </View>
    ) : chapter ? (
      <View style={[styles.split, desktop && styles.splitWide]}>
        {/* The board is the centre: the chapter's panel stays a narrow column beside it, and
            slimmer still where the work happens on the board itself (covering the handoffs). */}
        <View
          style={[
            styles.panel,
            desktop && (BOARD_HEAVY.includes(chapter.key) ? styles.panelSlim : styles.panelWide),
          ]}
        >
          {panelFor(chapter.key)}
          {nav}
        </View>
        <View style={[styles.boardCol, desktop && styles.boardColWide]}>
          {!desktop ? (
            <Text variant="kicker" tone="muted" style={styles.boardKicker}>
              The week · {range}
            </Text>
          ) : null}
          <WeekBoard
            data={data}
            layout={desktop ? 'grid' : 'days'}
            focus={chapter.focus}
            today={today}
            narrow
            onHandoff={setChooser}
            onEvent={(o) => setEventSheet({ mode: 'occurrence', occurrence: o })}
            onDinner={() => {
              if (chapter.key !== 'dinners') go(chapters.findIndex((c) => c.key === 'dinners'));
              setDinnerFocus(false);
            }}
          />
        </View>
      </View>
    ) : null;

  return (
    <View style={styles.fill}>
      <Page maxWidth={1440} scrollRef={scroll} docked={barShown}>
        {step >= 0 && step < DONE ? (
          <View style={styles.head}>
            {desktop ? (
              <View style={styles.headRow}>
                <Pressable accessibilityRole="button" onPress={() => go(OPENING)}>
                  <Text variant="kicker" tone="muted">
                    Weekly Reset · {range}
                  </Text>
                </Pressable>
                {modeSwitch}
              </View>
            ) : null}
            {phone ? (
              <PhoneProgress count={chapters.length} current={step} title={chapter?.title ?? ''} />
            ) : (
              <ChapterSteps chapters={chapters} current={step} states={states} onGo={go} />
            )}
          </View>
        ) : null}
        <ChapterTransition key={step} direction={dir}>
          {body}
        </ChapterTransition>
      </Page>
      {phone && chapter ? (
        <PhoneChapterBar
          sub={`${step + 1} of ${chapters.length}`}
          label={chapter.title}
          onBack={() => go(step - 1)}
          onNext={step + 1 < chapters.length ? () => go(step + 1) : null}
          nextLabel={nextTitle ? `Next: ${nextTitle}` : 'Next'}
          onCapture={() => capture.open()}
        />
      ) : null}

      <Sheet
        visible={chooser !== null}
        onClose={() => setChooser(null)}
        label="Who has it"
        title={
          chooser ? `${weekdayName(chooser.date)} · ${timeOf(chooser.startsAt, timeZone)}` : ''
        }
        width={460}
      >
        {chooser ? (
          <View style={styles.chooser}>
            <Text variant="chapter">
              Who has {careWhat(chooser, people.byId(chooser.careMemberId), true)}?
            </Text>
            {data.events.conflicts.some((c) => c.occurrenceKey === chooser.key) ? (
              <View style={styles.openNote}>
                <Hatch width={18} height={12} radius={3} />
                <Text variant="meta" style={styles.flex}>
                  It clashes with{' '}
                  {people.byId(
                    data.events.conflicts.find((c) => c.occurrenceKey === chooser.key)?.memberId,
                  )?.name ?? 'someone'}
                  ’s plans.
                </Text>
              </View>
            ) : null}
            <WhoPicker
              o={chooser}
              adults={adults}
              caredFor={caredFor}
              onSet={async (o, id) => {
                const ok = await setHandoff(o, id);
                if (ok) setChooser(null);
                return ok;
              }}
            />
            <Button
              title="Open the event"
              variant="quiet"
              size="sm"
              onPress={() => {
                const o = chooser;
                setChooser(null);
                setEventSheet({ mode: 'occurrence', occurrence: o });
              }}
            />
          </View>
        ) : null}
      </Sheet>
      <EventSheet
        target={eventSheet}
        today={today}
        onClose={() => setEventSheet(null)}
        onChanged={() => void load()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  art: { maxWidth: 360, marginBottom: 8 },
  skeleton: { gap: 14 },
  skeletonBoard: { marginTop: 20 },
  head: { gap: 14, marginBottom: 28 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  mode: { gap: 6, width: 420, maxWidth: '100%' },
  modeLine: { paddingHorizontal: 4 },
  opening: { gap: 28 },
  openingHead: { gap: 18 },
  openingHeadWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 40 },
  greeting: { marginTop: 8 },
  openingTitle: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 37,
    color: color.ink,
    marginTop: 6,
  },
  openingTitlePhone: { fontSize: 22, lineHeight: 28 },
  openingLead: { marginTop: 8, maxWidth: 720 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  previewHover: { borderColor: color.ink },
  previewN: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: 'center',
    lineHeight: 26,
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.muted,
    backgroundColor: color.lane,
    overflow: 'hidden',
  },
  openingActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  boardBlock: { marginTop: 12 },
  boardKicker: { marginBottom: 12 },
  reading: { maxWidth: 1080, gap: 36 },
  split: { gap: 32 },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  panel: { gap: 18 },
  panelWide: { width: 340 },
  panelSlim: { width: 300 },
  boardCol: { gap: 0 },
  boardColWide: { flex: 1, minWidth: 0, paddingTop: 6 },
  nav: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  stack: { gap: 12 },
  decided: { gap: 8, marginTop: 4 },
  decidedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bold: { fontFamily: font.uiBold },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newDecision: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  groceries: { gap: 10, marginTop: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, cursor: 'pointer' },
  checks: { gap: 8 },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  checkHover: { opacity: 0.85 },
  openNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
  },
  chooser: { gap: 14, paddingBottom: 8 },
});
