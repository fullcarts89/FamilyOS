import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Either } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, font, radius } from '../../design/tokens';
import type { Decision, Occurrence, ResetResponse, Unresolved } from '../../lib/api';
import { weekdayName } from '../../lib/dates';
import { decidedLabel } from '../../lib/decisions';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { currentAdult } from '../../lib/reset';
import { completionLine, shortWeekday, weekRange } from '../../lib/reset-words';
import { localParts, timeOf } from '../../lib/rhythm';
import { dueDate, isOpen } from '../../lib/tasks';
import { careOccurrences, careWhat } from './Cover';
import { PlanMoment } from './PlanMoment';
import { WeekBoard } from './WeekBoard';
import type { ChapterKey } from './chapters';

/**
 * The completion: a distinct moment ("Your week has a plan."), then the plan itself: the board,
 * what you decided, who covers what, what each of you has, dinners and the list. Anything still
 * open sits apart, hatched, with a way back to sort it; the words never claim it's all handled.
 */
export function Complete({
  data,
  decisions,
  play,
  onSort,
  onChange,
  onHandoff,
  onEvent,
}: {
  data: ResetResponse;
  decisions: Decision[];
  play: boolean;
  onSort: (chapter: ChapterKey) => void;
  onChange: () => void;
  onHandoff: (o: Occurrence) => void;
  onEvent: (o: Occurrence) => void;
}) {
  const people = usePeople();
  const { timeZone } = useHousehold();
  const { phone, desktop } = useLayout();
  const adults = people.adults.filter((p) => p.role === 'owner' || p.role === 'adult');
  const caredFor = (id: string) => !!people.byId(id)?.caredFor;
  const plan = data.plan;
  const by = people.byId(plan?.committedByMemberId);
  const when = plan?.committedAt ? localParts(plan.committedAt, timeZone) : null;

  // Decided in the last two weeks: the look back's and anything settled since.
  const decided = decisions.filter(
    (d) => d.status === 'decided' && d.decidedAt && d.decidedAt.slice(0, 10) >= data.lookBack.from,
  );
  const care = careOccurrences(data);
  const coverage = adults.map((p) => {
    const mine = care.filter((o) => currentAdult(o, caredFor) === p.id);
    const kinds = new Map<string, string[]>();
    for (const o of mine) {
      const label =
        o.careAction === 'drop_off'
          ? 'drop-offs'
          : o.careAction === 'pick_up'
            ? 'pickups'
            : o.title;
      kinds.set(label, [...(kinds.get(label) ?? []), shortWeekday(o.date)]);
    }
    return {
      person: p,
      words: [...kinds.entries()].map(
        ([k, ds]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} · ${[...new Set(ds)].join(', ')}`,
      ),
    };
  });
  const commitments = [...data.unfinished, ...data.dueThisWeek]
    .filter((i) => isOpen(i) && !i.recurrenceRuleId)
    .filter((i) => {
      const due = dueDate(i, timeZone);
      return !!due && due >= data.week.start && due <= data.week.end;
    });
  const responsibilities = adults.map((p) => ({
    person: p,
    lines: data.routines
      .map((r) => {
        const ds = r.turns
          .filter((t) => t.ownerMemberId === p.id && !t.skipped)
          .map((t) => shortWeekday(t.date));
        return ds.length ? `${r.title} · ${ds.join(', ')}` : null;
      })
      .filter((x): x is string => !!x),
  }));
  const dinners = data.events.days.map((d) => ({
    date: d.date,
    meal: data.meals.find((m) => m.onDate === d.date && m.slot === 'dinner') ?? null,
  }));
  const groceries = data.groceries.length;

  return (
    <View style={styles.wrap}>
      <FadeIn>
        <View style={[styles.moment, phone && styles.momentPhone]}>
          <PlanMoment play={play} colors={[...adults, ...people.caredFor].map((p) => p.color)} />
          <View style={styles.momentText}>
            <Text variant="kicker" tone="muted">
              {weekRange(data.week.start, data.week.end)}
            </Text>
            <Text style={[styles.title, phone && styles.titlePhone]} accessibilityRole="header">
              Your week has a plan.
            </Text>
            <Text variant="lead" style={styles.line}>
              {completionLine(data.unresolved)}
            </Text>
            {when && by ? (
              <Text variant="meta" tone="muted">
                {by.isMe ? 'You' : by.name} made it your plan on {weekdayName(when.date)} at{' '}
                {timeOf(plan?.committedAt ?? '', timeZone)}.
              </Text>
            ) : null}
          </View>
        </View>
      </FadeIn>

      {data.unresolved.length ? (
        <FadeIn delay={120}>
          <StillOpen data={data} decisions={decisions} onSort={onSort} />
        </FadeIn>
      ) : null}

      <FadeIn delay={180}>
        <WeekBoard
          data={data}
          layout={desktop ? 'grid' : 'days'}
          focus="all"
          today={data.today}
          committed
          onHandoff={onHandoff}
          onEvent={onEvent}
        />
      </FadeIn>

      <FadeIn delay={240}>
        <View style={[styles.cards, !phone && styles.cardsWide]}>
          <Card title="Decided together" wide={!phone}>
            {decided.length ? (
              decided.map((d) => (
                <Line key={d.id} title={decidedLabel(d) ?? 'Decided'} sub={d.question} />
              ))
            ) : (
              <Text variant="meta" tone="muted">
                Nothing new decided this week.
              </Text>
            )}
          </Card>
          <Card title="Who covers what" wide={!phone}>
            {coverage.map((c) =>
              c.words.length ? (
                <PersonLine key={c.person.id} person={c.person} lines={c.words} />
              ) : null,
            )}
            {care.length === 0 ? (
              <Text variant="meta" tone="muted">
                No drop-offs or pickups this week.
              </Text>
            ) : null}
          </Card>
          <Card title="What each of you has on" wide={!phone}>
            {adults.map((p) => {
              const mine = commitments.filter((i) => i.ownerMemberId === p.id);
              return mine.length ? (
                <PersonLine
                  key={p.id}
                  person={p}
                  lines={mine.map(
                    (i) => `${i.title} · ${shortWeekday(dueDate(i, timeZone) ?? '')}`,
                  )}
                />
              ) : null;
            })}
            {commitments.some((i) => !i.ownerMemberId) ? (
              <PersonLine
                person={null}
                lines={commitments
                  .filter((i) => !i.ownerMemberId)
                  .map((i) => `${i.title} · ${shortWeekday(dueDate(i, timeZone) ?? '')}`)}
              />
            ) : null}
            {commitments.length === 0 ? (
              <Text variant="meta" tone="muted">
                No dated to-dos this week.
              </Text>
            ) : null}
          </Card>
          <Card title="Routines" wide={!phone}>
            {responsibilities.map((r) =>
              r.lines.length ? (
                <PersonLine key={r.person.id} person={r.person} lines={r.lines} />
              ) : null,
            )}
            {responsibilities.every((r) => r.lines.length === 0) ? (
              <Text variant="meta" tone="muted">
                No routine turns this week.
              </Text>
            ) : null}
          </Card>
          <Card title="Dinners and groceries" wide={!phone}>
            {dinners.map(({ date, meal }) => {
              const cook = people.byId(meal?.cookMemberId);
              return (
                <View key={date} style={styles.dinner}>
                  <Text variant="label" style={styles.dinnerDay}>
                    {shortWeekday(date)}
                  </Text>
                  <Text
                    variant="meta"
                    tone={meal ? 'ink' : 'faint'}
                    style={styles.flex}
                    numberOfLines={1}
                  >
                    {meal ? meal.title : 'Open'}
                  </Text>
                  {cook ? <Avatar person={cook} size={18} /> : null}
                </View>
              );
            })}
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/meals', params: { tab: 'groceries' } })}
              style={(s: PressState) => [styles.link, s.hovered && { opacity: 0.75 }]}
            >
              <Text variant="label">
                {groceries === 0
                  ? 'The grocery list is empty'
                  : groceries === 1
                    ? 'One thing on the grocery list'
                    : `${groceries} things on the grocery list`}
              </Text>
              <ArrowRight size={15} color={color.ink} strokeWidth={2.2} />
            </Pressable>
          </Card>
          {plan?.notes ? (
            <Card title="Notes for the week" wide={!phone}>
              <Text variant="body">{plan.notes}</Text>
            </Card>
          ) : null}
        </View>
      </FadeIn>

      <View style={styles.actions}>
        <Button
          title="Back to Today"
          icon={ArrowRight}
          iconRight
          onPress={() => router.navigate('/')}
        />
        <Button title="Change something" variant="secondary" onPress={onChange} />
      </View>
    </View>
  );
}

function StillOpen({
  data,
  decisions,
  onSort,
}: {
  data: ResetResponse;
  decisions: Decision[];
  onSort: (chapter: ChapterKey) => void;
}) {
  const people = usePeople();
  const { timeZone } = useHousehold();
  const occurrences = data.events.days.flatMap((d) => d.occurrences);
  const items = [...data.unfinished, ...data.dueThisWeek];
  const line = (u: Unresolved): { text: string; chapter: ChapterKey } => {
    if (u.type === 'decision_open') {
      const d =
        decisions.find((x) => x.id === u.decisionId) ??
        data.decisions.find((x) => x.id === u.decisionId);
      return { text: `Still to decide: ${d?.question ?? 'a decision'}`, chapter: 'decide' };
    }
    if (u.type === 'overdue') {
      const i = items.find((x) => x.id === u.workItemId);
      return { text: `Still late: ${i?.title ?? 'a to-do from before'}`, chapter: 'loose' };
    }
    const o = occurrences.find((x) => x.key === u.occurrenceKey);
    const child = people.byId(o?.careMemberId);
    const what = o ? careWhat(o, child) : 'A drop-off or pickup';
    const at = `${o ? weekdayName(o.date) : ''} ${timeOf(u.time, timeZone)}`.trim();
    return {
      text:
        u.type === 'handoff_conflict'
          ? `${what}, ${at}: clashes with ${people.byId(u.memberId)?.name ?? 'someone'}’s plans`
          : `${what}, ${at}: nobody is down for it`,
      chapter: 'cover',
    };
  };
  return (
    <View style={styles.open} accessibilityLabel="Still open">
      <View style={styles.openHead}>
        <Hatch width={22} height={14} radius={3} />
        <Text variant="h3">Still open</Text>
      </View>
      {data.unresolved.map((u, i) => {
        const l = line(u);
        return (
          <View key={i} style={styles.openRow}>
            <Text variant="body" style={styles.flex}>
              {l.text}
            </Text>
            <Button
              title="Sort it"
              size="sm"
              variant="secondary"
              onPress={() => onSort(l.chapter)}
            />
          </View>
        );
      })}
    </View>
  );
}

function Card({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <View style={[styles.card, wide && styles.cardWide]}>
      <Text variant="kicker" tone="muted">
        {title}
      </Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Line({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.lineItem}>
      <Text variant="title">{title}</Text>
      {sub ? (
        <Text variant="small" tone="muted">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function PersonLine({ person, lines }: { person: Person | null; lines: string[] }) {
  const people = usePeople();
  const pair = people.adults.filter((p) => p.role === 'owner' || p.role === 'adult');
  return (
    <View style={styles.personLine}>
      {person ? (
        <Avatar person={person} size={22} />
      ) : (
        <Either
          size={22}
          colors={pair[0] && pair[1] ? [pair[0].color, pair[1].color] : undefined}
        />
      )}
      <View style={[styles.flex, styles.personLines]}>
        <Text variant="label">
          {person ? (person.isMe ? 'You' : person.name) : 'Either of you'}
        </Text>
        {lines.map((l) => (
          <Text key={l} variant="meta" tone="muted">
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 34 },
  flex: { flex: 1, minWidth: 0 },
  moment: { flexDirection: 'row', alignItems: 'center', gap: 32, paddingTop: 8 },
  momentPhone: { flexDirection: 'column', alignItems: 'flex-start', gap: 14 },
  momentText: { flex: 1, gap: 8, minWidth: 0 },
  title: {
    fontFamily: font.serif,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -0.8,
    color: color.ink,
  },
  titlePhone: { fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  line: { maxWidth: 680, color: color.ink },
  open: {
    gap: 4,
    padding: 18,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderStyle: 'dashed',
    backgroundColor: color.surface,
  },
  openHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingVertical: 6,
  },
  cards: { gap: 14 },
  cardsWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { gap: 10, padding: 18, borderRadius: radius.xl, backgroundColor: color.surface },
  cardWide: { width: '32%', minWidth: 300, flexGrow: 1 },
  cardBody: { gap: 10 },
  lineItem: { gap: 1 },
  personLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  personLines: { gap: 2 },
  dinner: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  dinnerDay: { width: 34 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    marginTop: 2,
    cursor: 'pointer',
  },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
