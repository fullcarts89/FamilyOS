import { useFocusEffect } from 'expo-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileUp,
  KeyRound,
  Pencil,
  RefreshCw,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  money,
  monthName,
  nextSyncText,
  planMoney,
  shiftMonth,
  syncedText,
} from '../../components/budgets/format';
import { ImportSheet } from '../../components/budgets/ImportSheet';
import { PlanSheet } from '../../components/budgets/PlanSheet';
import { SyncSheet } from '../../components/budgets/SyncSheet';
import { Button, IconButton } from '../../design/Button';
import { EmptyState, LanesArt } from '../../design/EmptyState';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import { FadeIn, Skeleton, SkeletonBlock, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, font, radius } from '../../design/tokens';
import {
  api,
  errorMessage,
  type BudgetCategory,
  type BudgetMonth,
  type BudgetPlanChange,
} from '../../lib/api';
import { shortDate } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { localParts } from '../../lib/rhythm';

// Budgets: the month's Monarch budget, category by category: what's planned and what's been
// spent. Spending only (income on its own line, transfers left out). With the Monarch sync, an
// adult can change a category's plan here; it goes to Monarch at the next sync and shows as
// waiting until Monarch confirms it. Adults only; never transactions.
export default function Budgets() {
  const { household, timeZone } = useHousehold();
  const { phone } = useLayout();
  const toast = useToast();
  const today = localParts(new Date(), timeZone).date;
  const current = `${today.slice(0, 7)}-01`;
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<BudgetMonth | null>(null);
  const [error, setError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [planning, setPlanning] = useState<BudgetCategory | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const adult = household?.role !== 'caregiver';

  const load = useCallback(async () => {
    if (!household || !adult) return;
    try {
      setData(await api<BudgetMonth>(`/households/${household.id}/budgets?month=${month}`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [household, month, adult]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!adult) {
    return (
      <Page maxWidth={900}>
        <PageHeader kicker="Budgets" title="Budgets" />
        <EmptyState
          title="Budgets are for the adults"
          body="The household’s budget is shared between the adults who plan it."
        />
      </Page>
    );
  }

  const shown = data && data.month === month ? data : null;
  const sync = shown?.sync ?? null;
  const nextSync = nextSyncText(sync?.nextSyncAround ?? null);
  const changes = new Map((shown?.changes ?? []).map((c) => [c.monarchCategoryId, c]));
  const spending = (shown?.categories ?? []).filter(
    (c) => c.type === 'expense' && (c.budgeted || c.actual),
  );
  const planned = (c: BudgetCategory) => (c.budgeted ?? 0) > 0;
  const groups = (shown?.groups ?? [])
    .map((g) => ({
      ...g,
      items: [
        ...spending
          .filter((c) => c.group === g.group && planned(c))
          .sort((a, b) => (b.budgeted ?? 0) - (a.budgeted ?? 0)),
        ...spending
          .filter((c) => c.group === g.group && !planned(c))
          .sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0)),
      ],
    }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => Number(a.budgeted === 0) - Number(b.budgeted === 0) || b.budgeted - a.budgeted);
  // Two columns on wider screens, filled in order: the first takes groups until it holds half.
  const weight = (g: (typeof groups)[number]) => g.items.length + 2;
  const total = groups.reduce((n, g) => n + weight(g), 0);
  const columns: (typeof groups)[] = phone ? [groups] : [[], []];
  if (!phone) {
    let filled = 0;
    for (const g of groups) {
      (filled < total / 2 ? columns[0] : columns[1])?.push(g);
      filled += weight(g);
    }
  }
  const biggest = spending
    .map((c) => ({ c, over: (c.actual ?? 0) - (c.budgeted ?? 0) }))
    .filter((x) => x.over > 0)
    .sort((a, b) => b.over - a.over)
    .slice(0, 3)
    .map((x) => x.c.category);
  const canPlan = (c: BudgetCategory) => !!sync?.connected && !!c.monarchCategoryId;

  const resend = async (change: BudgetPlanChange) => {
    if (!household) return;
    try {
      await api(`/households/${household.id}/budgets/changes`, {
        method: 'POST',
        body: {
          month,
          monarchCategoryId: change.monarchCategoryId,
          amount: change.toAmount,
          applyToFuture: change.applyToFuture,
        },
      });
      toast.show(`Waiting for Monarch: ${change.category}, ${planMoney(change.toAmount)}`, {
        detail: `Goes to Monarch at the next sync${nextSync ? `, ${nextSync}` : ''}.`,
      });
    } catch (caught) {
      toast.show(`Couldn’t send ${change.category}’s plan`, {
        error: true,
        detail: errorMessage(caught),
      });
    }
    await load();
  };

  const putAway = async (change: BudgetPlanChange, message: string) => {
    if (!household) return;
    try {
      await api(`/households/${household.id}/budgets/changes/${change.id}`, { method: 'DELETE' });
      toast.show(message);
    } catch (caught) {
      toast.show(`Couldn’t change ${change.category}’s plan`, {
        error: true,
        detail: errorMessage(caught),
      });
    }
    await load();
  };

  const syncButton = sync?.connected ? (
    <Button
      title={`${sync.lastSyncedAt ? `Synced ${syncedText(sync.lastSyncedAt, timeZone, today)}` : 'Not synced yet'}${nextSync ? ` · next ${nextSync}` : ''}`}
      icon={RefreshCw}
      variant="secondary"
      size="sm"
      accessibilityLabel={`Monarch sync: ${sync.lastSyncedAt ? `last synced ${syncedText(sync.lastSyncedAt, timeZone, today)}` : 'not synced yet'}${nextSync ? `, next ${nextSync}` : ''}`}
      onPress={() => setSyncing(true)}
    />
  ) : shown ? (
    <Button
      title="Set up Monarch sync"
      icon={KeyRound}
      variant="secondary"
      size="sm"
      onPress={() => setSyncing(true)}
    />
  ) : null;

  const incomeTile = shown?.income ? (
    <Tile
      kicker={month < current ? 'Income' : 'Income so far'}
      value={money(shown.income.actual)}
      line={`of ${money(shown.income.budgeted)} planned`}
    />
  ) : null;
  const planGap = shown?.income ? shown.income.budgeted - shown.totals.budgeted : 0;

  return (
    <Page
      maxWidth={1040}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <PageHeader
        kicker="Budgets · from Monarch"
        title={`${monthName(month)}${month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ''}`}
        lead={
          shown?.source === 'csv' && shown.importedAt
            ? `Planned and spent by category, as of the import on ${shortDate(localParts(shown.importedAt, timeZone).date)}. Transfers and card payments aren’t spending, so they’re left out.`
            : 'Planned and spent by category, for the adults. Transfers and card payments aren’t spending, so they’re left out.'
        }
        action={
          <View style={styles.headActions}>
            {syncButton}
            <View style={styles.nav}>
              <IconButton
                icon={ChevronLeft}
                label="Previous month"
                variant="outline"
                size={40}
                onPress={() => setMonth((m) => shiftMonth(m, -1))}
              />
              {month !== current ? (
                <Button
                  title="This month"
                  variant="secondary"
                  size="sm"
                  onPress={() => setMonth(current)}
                  style={styles.center}
                />
              ) : null}
              <IconButton
                icon={ChevronRight}
                label="Next month"
                variant="outline"
                size={40}
                onPress={() => setMonth((m) => shiftMonth(m, 1))}
              />
            </View>
          </View>
        }
      />

      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message="Couldn’t load the budget. Check your connection." onRetry={load} />
        </View>
      ) : null}
      {!shown && !error ? (
        <Skeleton label="Loading the budget">
          <View style={styles.gap}>
            <SkeletonBlock height={96} />
            <SkeletonRows count={5} />
          </View>
        </Skeleton>
      ) : null}

      {shown && spending.length === 0 ? (
        <EmptyState
          art={<LanesArt style={styles.art} lanes={[[[0, 62]], [[0, 38]], [[0, 81]]]} />}
          title={`No budget for ${monthName(month)} yet`}
          body={
            sync?.connected
              ? `The Monarch sync brings it in${nextSync ? ` at the next sync, ${nextSync}` : ''}. Or import a file you export from Monarch.`
              : 'Set up the Monarch sync to bring the budget in by itself, or import a file you export from Monarch.'
          }
          action={
            <View style={styles.emptyActions}>
              {!sync?.connected ? (
                <Button
                  title="Set up Monarch sync"
                  icon={KeyRound}
                  onPress={() => setSyncing(true)}
                />
              ) : null}
              <Button
                title="Import a file"
                icon={FileUp}
                variant="secondary"
                onPress={() => setImporting(true)}
              />
            </View>
          }
        />
      ) : null}

      {shown && spending.length > 0 ? (
        <FadeIn>
          <View style={[styles.total, phone && styles.totalPhone]}>
            <View style={styles.totalText}>
              <Text variant="kicker" tone="muted">
                {month < current ? 'Spent' : 'Spent so far'}
              </Text>
              <Text style={[styles.big, phone && styles.bigPhone]}>
                {money(shown.totals.actual)}
                <Text variant="lead" tone="muted">
                  {'  '}of {money(shown.totals.budgeted)} planned
                </Text>
              </Text>
              <Text variant="meta" tone="muted">
                {shown.totals.actual <= shown.totals.budgeted
                  ? `${money(shown.totals.budgeted - shown.totals.actual)} left across the budget.`
                  : `${money(shown.totals.actual - shown.totals.budgeted)} over across the budget.`}
                {biggest.length && shown.totals.actual > shown.totals.budgeted
                  ? ` The biggest differences: ${listOf(biggest)}.`
                  : ''}
              </Text>
            </View>
            <Bar budgeted={shown.totals.budgeted} actual={shown.totals.actual} height={12} />
            <View style={[styles.tiles, phone && styles.tilesPhone]}>
              {incomeTile}
              {shown.unplanned.count > 0 ? (
                <Tile
                  kicker="Not in the budget"
                  value={money(shown.unplanned.actual)}
                  line={
                    shown.unplanned.count === 1
                      ? 'in a category with no plan'
                      : `across ${shown.unplanned.count} categories with no plan`
                  }
                />
              ) : null}
              {shown.income ? (
                <Tile
                  kicker="The plan"
                  value={
                    planGap < 0
                      ? `${money(-planGap)} short`
                      : planGap > 0
                        ? `${money(planGap)} to spare`
                        : 'Even'
                  }
                  line={
                    planGap < 0
                      ? 'planned spending is more than planned income'
                      : planGap > 0
                        ? 'planned income is more than planned spending'
                        : 'planned spending matches planned income'
                  }
                />
              ) : null}
            </View>
          </View>

          <View style={[styles.columns, phone && styles.columnsPhone]}>
            {columns.map((col, i) => (
              <View key={i} style={styles.column}>
                {col.map((g) => (
                  <View key={g.group ?? 'none'} style={styles.block}>
                    <SectionHeader
                      title={g.group ?? 'Other'}
                      sub={
                        g.budgeted
                          ? `${money(g.actual)} of ${money(g.budgeted)}`
                          : `${money(g.actual)} spent, no plan`
                      }
                    />
                    {g.items.map((c, n) => (
                      <CategoryRow
                        key={c.category}
                        c={c}
                        last={n === g.items.length - 1}
                        change={
                          c.monarchCategoryId ? (changes.get(c.monarchCategoryId) ?? null) : null
                        }
                        canPlan={canPlan(c)}
                        nextSync={nextSync}
                        timeZone={timeZone}
                        today={today}
                        onPlan={() => setPlanning(c)}
                        onResend={(change) => void resend(change)}
                        onPutAway={(change, message) => void putAway(change, message)}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.foot}>
            <Text variant="meta" tone="muted" style={styles.footText}>
              Monarch is where the money lives: FamilyOS reads the budget and can send a new plan
              back. It never sees transactions or accounts.
            </Text>
            <Button
              title="Import a file instead"
              icon={FileUp}
              variant="quiet"
              size="sm"
              onPress={() => setImporting(true)}
            />
          </View>
        </FadeIn>
      ) : null}

      <ImportSheet
        visible={importing}
        month={month}
        onClose={() => setImporting(false)}
        onImported={(budget, months) => {
          setImporting(false);
          setMonth(budget.month);
          setData(budget);
          toast.show(
            months.length === 1
              ? `Imported ${monthName(budget.month)}`
              : `Imported ${months.length} months`,
            { detail: `${budget.categories.length} categories, as of now.` },
          );
        }}
      />
      <PlanSheet
        visible={!!planning}
        month={month}
        category={planning}
        waiting={(() => {
          const change = planning?.monarchCategoryId
            ? changes.get(planning.monarchCategoryId)
            : null;
          return change?.status === 'waiting' ? change : null;
        })()}
        nextSync={nextSync}
        onClose={() => setPlanning(null)}
        onSent={() => void load()}
      />
      <SyncSheet
        visible={syncing}
        onClose={() => setSyncing(false)}
        onChanged={() => void load()}
      />
    </Page>
  );
}

/** "A, B and C". */
const listOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function Tile({ kicker, value, line }: { kicker: string; value: string; line: string }) {
  return (
    <View style={styles.tile}>
      <Text variant="kicker" tone="muted">
        {kicker}
      </Text>
      <Text style={styles.tileValue}>{value}</Text>
      <Text variant="small" tone="faint">
        {line}
      </Text>
    </View>
  );
}

/**
 * One category: planned and spent with its bar, or "No plan" when it has none. With the sync, a
 * pencil (or "Add a plan") opens the plan sheet; a change on its way to Monarch shows beneath.
 */
function CategoryRow({
  c,
  last,
  change,
  canPlan,
  nextSync,
  timeZone,
  today,
  onPlan,
  onResend,
  onPutAway,
}: {
  c: BudgetCategory;
  last: boolean;
  change: BudgetPlanChange | null;
  canPlan: boolean;
  nextSync: string | null;
  timeZone: string;
  today: string;
  onPlan: () => void;
  onResend: (change: BudgetPlanChange) => void;
  onPutAway: (change: BudgetPlanChange, message: string) => void;
}) {
  const budgeted = c.budgeted ?? 0;
  const actual = c.actual ?? 0;
  const left = c.remaining ?? budgeted - actual;
  const hasPlan = budgeted > 0;
  return (
    <View
      style={[styles.row, last && styles.rowLast]}
      accessibilityLabel={
        hasPlan
          ? `${c.category}: ${money(actual)} spent of ${money(budgeted)}${left < 0 ? `, ${money(-left)} over` : ''}`
          : `${c.category}: ${money(actual)} spent, no plan`
      }
    >
      <View style={styles.rowHead}>
        <Text variant="title" style={styles.cat}>
          {c.category}
        </Text>
        {!hasPlan ? (
          <Text variant="meta" tone="muted">
            No plan
          </Text>
        ) : left < 0 ? (
          <View style={styles.overMeta}>
            <Hatch width={12} height={10} radius={3} />
            <Text variant="meta">{money(-left)} over</Text>
          </View>
        ) : (
          <Text variant="meta" tone="muted">
            {money(left)} left
          </Text>
        )}
        {canPlan && hasPlan ? (
          <IconButton
            icon={Pencil}
            label={`Change the plan for ${c.category}`}
            variant="outline"
            size={32}
            iconSize={15}
            onPress={onPlan}
          />
        ) : canPlan ? (
          <Button
            title="Add a plan"
            variant="quiet"
            size="sm"
            accessibilityLabel={`Add a plan for ${c.category}`}
            onPress={onPlan}
          />
        ) : null}
      </View>
      {hasPlan ? <Bar budgeted={budgeted} actual={actual} /> : null}
      <Text variant="small" tone="faint">
        {!hasPlan
          ? `${money(actual)} spent, not in the budget`
          : actual < 0
            ? `${money(-actual)} back in refunds · ${money(budgeted)} planned`
            : `${money(actual)} of ${money(budgeted)}`}
      </Text>
      {change ? (
        <ChangeState
          change={change}
          category={c}
          nextSync={nextSync}
          timeZone={timeZone}
          today={today}
          onResend={onResend}
          onPutAway={onPutAway}
        />
      ) : null}
    </View>
  );
}

function ChangeState({
  change,
  category,
  nextSync,
  timeZone,
  today,
  onResend,
  onPutAway,
}: {
  change: BudgetPlanChange;
  category: BudgetCategory;
  nextSync: string | null;
  timeZone: string;
  today: string;
  onResend: (change: BudgetPlanChange) => void;
  onPutAway: (change: BudgetPlanChange, message: string) => void;
}) {
  const from = planMoney(change.fromAmount ?? 0);
  const to = planMoney(change.toAmount);
  if (change.status === 'waiting') {
    return (
      <View style={styles.waiting} role="status">
        <Clock size={14} color={color.ink} strokeWidth={2.4} />
        <View style={styles.waitingText}>
          <Text variant="meta">
            Waiting for Monarch · {change.fromAmount ? `${from} → ${to}` : `a plan of ${to}`}
            {change.applyToFuture ? ', this month and after' : ''}
            <Text variant="meta" tone="muted">
              {' '}
              · goes at the next sync{nextSync ? `, ${nextSync}` : ''}
            </Text>
          </Text>
          {change.lastFailure ? (
            <Text variant="small" tone="muted">
              Monarch didn’t take it last time: {change.lastFailure}. It tries again at the next
              sync.
            </Text>
          ) : null}
        </View>
        <Button
          title="Cancel"
          variant="quiet"
          size="sm"
          accessibilityLabel={`Cancel the new plan for ${category.category}`}
          onPress={() =>
            onPutAway(change, `Cancelled: ${category.category} stays at Monarch’s ${from}`)
          }
        />
      </View>
    );
  }
  if (change.status === 'saved') {
    return (
      <View style={styles.saved}>
        <Check size={14} color={color.ink} strokeWidth={2.6} />
        <Text variant="small">
          Saved in Monarch {change.resolvedAt ? syncedText(change.resolvedAt, timeZone, today) : ''}
          {' · '}
          {to}
          {change.applyToFuture ? ' from this month on' : ''}
        </Text>
      </View>
    );
  }
  if (change.status === 'conflict') {
    const theirs = change.monarchAmount;
    return (
      <View style={styles.notice} role="status">
        <Text variant="meta">
          <Text variant="meta" style={styles.strong}>
            Monarch’s plan for {category.category} changed
            {theirs !== null ? ` to ${planMoney(theirs)}` : ''} before yours went.
          </Text>{' '}
          Nothing was overwritten.
        </Text>
        <View style={styles.noticeActions}>
          <Button title={`Send ${to}`} size="sm" onPress={() => onResend(change)} />
          <Button
            title={theirs !== null ? `Keep ${planMoney(theirs)}` : 'Keep Monarch’s'}
            variant="secondary"
            size="sm"
            onPress={() =>
              onPutAway(
                change,
                `Kept Monarch’s plan for ${category.category}${theirs !== null ? `: ${planMoney(theirs)}` : ''}`,
              )
            }
          />
        </View>
      </View>
    );
  }
  // Failed: Monarch refused it three times.
  return (
    <View style={styles.notice} role="status">
      <Text variant="meta">
        <Text variant="meta" style={styles.strong}>
          Monarch didn’t take the new plan for {category.category}.
        </Text>{' '}
        It tried three times{change.lastFailure ? `; the last answer: ${change.lastFailure}` : ''}.
      </Text>
      <View style={styles.noticeActions}>
        <Button title="Try again" size="sm" onPress={() => onResend(change)} />
        <Button
          title="Cancel the change"
          variant="secondary"
          size="sm"
          onPress={() => onPutAway(change, `Cancelled the new plan for ${category.category}`)}
        />
      </View>
    </View>
  );
}

/** Spent against planned: ink up to the plan, hatching past it. Refunds leave it empty. */
function Bar({
  budgeted,
  actual,
  height = 8,
}: {
  budgeted: number;
  actual: number;
  height?: number;
}) {
  const [w, setW] = useState(0);
  const max = Math.max(budgeted, actual, 1);
  const fill = Math.max(0, Math.min(actual, budgeted)) / max;
  const overBy = actual > budgeted ? (actual - budgeted) / max : 0;
  return (
    <View
      style={[styles.bar, { height, borderRadius: height / 2 }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      aria-hidden
    >
      <View style={[styles.fill, { width: `${fill * 100}%`, borderRadius: height / 2 }]} />
      {overBy > 0 && w > 0 ? (
        <View style={[styles.over, { left: `${fill * 100}%`, width: `${overBy * 100}%` }]}>
          <Hatch width={Math.max(4, w * overBy)} height={height} radius={height / 2} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { alignSelf: 'center' },
  gap: { marginTop: 28, gap: 14 },
  art: { maxWidth: 380, marginBottom: 8 },
  emptyActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  total: {
    marginTop: 30,
    padding: 20,
    gap: 16,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
  },
  totalPhone: { padding: 16 },
  totalText: { gap: 4 },
  big: {
    fontFamily: font.displayHeavy,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.7,
    color: color.ink,
  },
  bigPhone: { fontSize: 31, lineHeight: 37 },
  tiles: { flexDirection: 'row', gap: 10 },
  tilesPhone: { flexDirection: 'column' },
  tile: {
    flex: 1,
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.ground,
  },
  tileValue: { fontFamily: font.displayHeavy, fontSize: 22, lineHeight: 28, color: color.ink },
  columns: { flexDirection: 'row', gap: 40, alignItems: 'flex-start' },
  columnsPhone: { flexDirection: 'column', gap: 0 },
  column: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  block: { marginTop: 36 },
  row: { paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: color.hairline },
  rowLast: { borderBottomWidth: 0 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cat: { flex: 1 },
  overMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { backgroundColor: color.lane, overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.ink },
  over: { position: 'absolute', top: 0, bottom: 0 },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line2,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  waitingText: { flex: 1, gap: 2 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  notice: {
    gap: 10,
    marginTop: 4,
    padding: 12,
    borderWidth: 1.5,
    borderColor: color.line2,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  strong: { fontFamily: font.uiBold },
  noticeActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  foot: { marginTop: 36, gap: 10, alignItems: 'flex-start' },
  footText: { maxWidth: 640 },
});
