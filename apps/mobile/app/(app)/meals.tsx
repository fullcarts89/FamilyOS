import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, ShoppingBasket } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { DinnerWeek } from '../../components/meals/DinnerWeek';
import { GroceryAdd, GroceryList } from '../../components/meals/GroceryList';
import { Button, IconButton } from '../../design/Button';
import { EmptyState } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { FadeIn, Skeleton, SkeletonBlock, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Segmented } from '../../design/Segmented';
import { Text } from '../../design/Text';
import { color } from '../../design/tokens';
import { api, type Meal } from '../../lib/api';
import { addDays, dayOfWeek, shortDate } from '../../lib/dates';
import { useGroceries } from '../../lib/groceries';
import { useHousehold } from '../../lib/household';
import { recentDinnerIdeas, useMealActions } from '../../lib/meals';
import { localParts } from '../../lib/rhythm';

const mondayOf = (date: string) => addDays(date, 1 - dayOfWeek(date));

type Tab = 'dinners' | 'groceries';

// Meals and groceries: the week's dinners (who's cooking, if anyone), and one shared grocery list
// by aisle that both of you tick off in the store. Also reachable from the Weekly Reset.
export default function Meals() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { household, timeZone } = useHousehold();
  const { phone, desktop } = useLayout();
  const today = localParts(new Date(), timeZone).date;
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>(params.tab === 'groceries' ? 'groceries' : 'dinners');
  const groceries = useGroceries({ poll: 8000 });
  const canPlan = household?.role !== 'caregiver';

  const load = useCallback(async () => {
    if (!household) return;
    try {
      // This week plus the four before it: the family's own recent dinners become the ideas.
      const res = await api<{ meals: Meal[] }>(
        `/households/${household.id}/meals?from=${addDays(monday, -28)}&to=${addDays(monday, 6)}`,
      );
      setMeals(res.meals);
      setError(false);
    } catch {
      setError(true);
    }
  }, [household, monday]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const update = useCallback((fn: (all: Meal[]) => Meal[]) => setMeals((m) => fn(m ?? [])), []);
  const { save } = useMealActions(update);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const ideas = useMemo(
    () => recentDinnerIdeas((meals ?? []).filter((m) => m.onDate < monday)),
    [meals, monday],
  );
  const week = (meals ?? []).filter((m) => m.onDate >= monday && m.onDate <= addDays(monday, 6));
  const planned = days.filter((d) => week.some((m) => m.onDate === d && m.slot === 'dinner'));
  const thisWeek = monday === mondayOf(today);
  const toBuy = (groceries.items ?? []).filter((i) => i.checkedAt === null).length;

  const dinners = (
    <View>
      <SectionHeader
        title={thisWeek ? 'Dinners this week' : `Dinners, week of ${shortDate(monday)}`}
        sub={
          meals
            ? planned.length === 7
              ? 'Every night planned'
              : planned.length === 0
                ? 'Nothing planned yet'
                : `${7 - planned.length} night${7 - planned.length === 1 ? '' : 's'} open`
            : undefined
        }
        action={
          <View style={styles.nav}>
            <IconButton
              icon={ChevronLeft}
              label="Previous week"
              variant="outline"
              size={36}
              onPress={() => setMonday((m) => addDays(m, -7))}
            />
            {!thisWeek ? (
              <Button
                title="This week"
                variant="secondary"
                size="sm"
                onPress={() => setMonday(mondayOf(today))}
                style={styles.center}
              />
            ) : null}
            <IconButton
              icon={ChevronRight}
              label="Next week"
              variant="outline"
              size={36}
              onPress={() => setMonday((m) => addDays(m, 7))}
            />
          </View>
        }
      />
      <View style={styles.body}>
        {error ? (
          <ErrorNotice message="Couldn’t load the dinners. Check your connection." onRetry={load} />
        ) : !meals ? (
          <Skeleton label="Loading dinners">
            <SkeletonBlock height={phone ? 380 : 420} />
          </Skeleton>
        ) : (
          <FadeIn>
            <DinnerWeek
              days={days}
              meals={week}
              today={today}
              ideas={ideas}
              onSave={save}
              readOnly={!canPlan}
            />
            <Text variant="small" tone="muted" style={styles.hint}>
              {canPlan
                ? 'Type a dinner or pick one you’ve had lately. Choosing a cook is optional.'
                : 'The adults plan dinners. This is what’s on.'}
            </Text>
          </FadeIn>
        )}
      </View>
    </View>
  );

  const list = (
    <View>
      <SectionHeader
        title="Groceries"
        sub={groceries.items ? (toBuy === 0 ? 'Nothing to buy' : `${toBuy} to buy`) : undefined}
      />
      <View style={styles.body}>
        {canPlan ? <GroceryAdd onAdd={groceries.add} compact={phone} /> : null}
        {groceries.error && !groceries.items ? (
          <View style={styles.listGap}>
            <ErrorNotice
              message="Couldn’t load the grocery list. Check your connection."
              onRetry={groceries.load}
            />
          </View>
        ) : !groceries.items ? (
          <Skeleton label="Loading the grocery list">
            <SkeletonRows count={5} />
          </Skeleton>
        ) : groceries.items.length === 0 ? (
          <EmptyState
            compact
            art={<ShoppingBasket size={28} color={color.muted} strokeWidth={1.8} />}
            title="The list is empty"
            body="Add what you need above. It sorts itself by aisle, and you both see it as you shop."
          />
        ) : (
          <FadeIn style={styles.listGap}>
            <GroceryList
              items={groceries.items}
              onToggle={canPlan ? groceries.toggle : () => undefined}
              onRemove={canPlan ? groceries.remove : undefined}
              onClear={canPlan ? groceries.clearChecked : undefined}
            />
          </FadeIn>
        )}
      </View>
    </View>
  );

  return (
    <Page
      maxWidth={1240}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([load(), groceries.load()]);
            setRefreshing(false);
          }}
        />
      }
    >
      <PageHeader
        kicker="Meals & groceries"
        title={phone ? 'Meals' : 'What’s for dinner'}
        lead="Dinners as a row in the week, who’s cooking, and one list you both add to and tick off at the store."
      />
      {phone ? (
        <View style={styles.tabs}>
          <Segmented<Tab>
            label="Dinners or groceries"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'dinners', label: 'Dinners' },
              {
                value: 'groceries',
                label: toBuy ? `Groceries · ${toBuy}` : 'Groceries',
              },
            ]}
          />
        </View>
      ) : null}
      <View style={[styles.cols, desktop && styles.colsWide]}>
        {!phone || tab === 'dinners' ? <View style={styles.col}>{dinners}</View> : null}
        {!phone || tab === 'groceries' ? <View style={styles.col}>{list}</View> : null}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  tabs: { marginTop: 20 },
  cols: { marginTop: 32, gap: 40 },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 48 },
  col: { flex: 1, minWidth: 0 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { alignSelf: 'center' },
  body: { marginTop: 16 },
  hint: { marginTop: 10 },
  listGap: { marginTop: 10 },
});
