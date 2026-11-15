import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, FileUp } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ImportSheet } from '../../components/budgets/ImportSheet';
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
import { api, type BudgetMonth } from '../../lib/api';
import { shortDate } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { localParts } from '../../lib/rhythm';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? '';
const shiftMonth = (m: string, by: number) => {
  const y = Number(m.slice(0, 4));
  const n = Number(m.slice(5, 7)) - 1 + by;
  const year = y + Math.floor(n / 12);
  const month = ((n % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
};
const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2,
  }).format(n);

// Budgets: this month's Monarch budget, category by category: what you planned and what's been
// spent, as of the last import. Adults only; read-only; never transactions.
export default function Budgets() {
  const { household, timeZone } = useHousehold();
  const { phone } = useLayout();
  const toast = useToast();
  const current = `${localParts(new Date(), timeZone).date.slice(0, 7)}-01`;
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<BudgetMonth | null>(null);
  const [error, setError] = useState(false);
  const [importing, setImporting] = useState(false);
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
  const groups = shown
    ? [...new Set(shown.categories.map((c) => c.group))].map((group) => ({
        group,
        total: shown.groups.find((g) => g.group === group),
        items: shown.categories.filter((c) => c.group === group),
      }))
    : [];
  const over = shown?.categories.filter(
    (c) => c.budgeted !== null && c.actual !== null && c.actual > c.budgeted,
  );

  return (
    <Page
      maxWidth={960}
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
          shown?.importedAt
            ? `Planned and spent by category, as of the import on ${shortDate(localParts(shown.importedAt, timeZone).date)}. Read-only, and never transactions.`
            : 'Planned and spent by category, from the budget you export from Monarch. Read-only, and never transactions.'
        }
        action={
          <View style={styles.headActions}>
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
            <Button
              title="Import from Monarch"
              icon={FileUp}
              variant="secondary"
              onPress={() => setImporting(true)}
            />
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

      {shown && shown.categories.length === 0 ? (
        <EmptyState
          art={<LanesArt style={styles.art} lanes={[[[0, 62]], [[0, 38]], [[0, 81]]]} />}
          title={`No budget for ${monthName(month)} yet`}
          body="Export the month’s budget from Monarch and upload it here. It takes about a minute, and you can re-upload whenever you like."
          action={
            <Button title="Import from Monarch" icon={FileUp} onPress={() => setImporting(true)} />
          }
        />
      ) : null}

      {shown && shown.categories.length > 0 ? (
        <FadeIn>
          <View style={[styles.total, phone && styles.totalPhone]}>
            <View style={styles.totalText}>
              <Text variant="kicker" tone="muted">
                Spent so far
              </Text>
              <Text style={styles.big}>
                {money(shown.totals.actual)}
                <Text variant="lead" tone="muted">
                  {'  '}of {money(shown.totals.budgeted)} planned
                </Text>
              </Text>
              <Text variant="meta" tone="muted">
                {shown.totals.actual <= shown.totals.budgeted
                  ? `${money(shown.totals.budgeted - shown.totals.actual)} left across the budget.`
                  : `${money(shown.totals.actual - shown.totals.budgeted)} over across the budget.`}
                {over && over.length
                  ? ` ${over.map((c) => c.category).join(', ')} ${over.length === 1 ? 'is' : 'are'} over.`
                  : ''}
              </Text>
            </View>
            <Bar budgeted={shown.totals.budgeted} actual={shown.totals.actual} height={12} />
          </View>

          {groups.map((g) => (
            <View key={g.group ?? 'none'} style={styles.block}>
              <SectionHeader
                title={g.group ?? 'Other'}
                sub={g.total ? `${money(g.total.actual)} of ${money(g.total.budgeted)}` : undefined}
              />
              {g.items.map((c, i) => {
                const left = c.remaining;
                return (
                  <View
                    key={c.category}
                    style={[styles.row, i === g.items.length - 1 && styles.rowLast]}
                    accessibilityLabel={`${c.category}: ${money(c.actual ?? 0)} spent of ${c.budgeted === null ? 'no budget' : money(c.budgeted)}`}
                  >
                    <View style={styles.rowHead}>
                      <Text variant="title" style={styles.cat}>
                        {c.category}
                      </Text>
                      <Text variant="meta" tone={left !== null && left < 0 ? 'ink' : 'muted'}>
                        {c.budgeted === null
                          ? `${money(c.actual ?? 0)} spent`
                          : left !== null && left < 0
                            ? `${money(-left)} over`
                            : `${money(left ?? 0)} left`}
                      </Text>
                    </View>
                    {c.budgeted !== null ? (
                      <Bar budgeted={c.budgeted} actual={c.actual ?? 0} />
                    ) : null}
                    <Text variant="small" tone="faint">
                      {money(c.actual ?? 0)}
                      {c.budgeted !== null ? ` of ${money(c.budgeted)}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </FadeIn>
      ) : null}

      <ImportSheet
        visible={importing}
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
    </Page>
  );
}

/** Spent against planned: ink up to the plan, hatching past it. */
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
  const fill = Math.min(actual, budgeted) / max;
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
  gap: { marginTop: 28, gap: 14 },
  art: { maxWidth: 380, marginBottom: 8 },
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
  block: { marginTop: 36 },
  row: { paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: color.hairline },
  rowLast: { borderBottomWidth: 0 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  cat: { flex: 1 },
  bar: { backgroundColor: color.lane, overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.ink },
  over: { position: 'absolute', top: 0, bottom: 0 },
});
