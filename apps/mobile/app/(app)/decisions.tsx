import { useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { DecisionCard } from '../../components/decisions/DecisionCard';
import { NewDecision } from '../../components/decisions/NewDecision';
import { Button } from '../../design/Button';
import { EmptyState, LanesArt } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { FadeIn, Skeleton, SkeletonBlock } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Sheet } from '../../design/Sheet';
import { api, type Decision } from '../../lib/api';
import { localParts } from '../../lib/rhythm';
import { useDecisionActions, useSettledWatcher } from '../../lib/decisions';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

// Decisions: what the adults are deciding together. Open ones to vote on (faces show who picked
// what, never a tally), and what you've decided, newest first. Refreshes while open, so a vote
// cast on the other phone shows up here.
export default function Decisions() {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const { phone } = useLayout();
  const [all, setAll] = useState<Decision[] | null>(null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const today = localParts(new Date(), timeZone).date;
  const adult = household?.role !== 'caregiver';

  const put = useCallback(
    (d: Decision) =>
      setAll((list) =>
        list
          ? list.some((x) => x.id === d.id)
            ? list.map((x) => (x.id === d.id ? d : x))
            : [d, ...list]
          : [d],
      ),
    [],
  );
  const actions = useDecisionActions(put);

  const load = useCallback(async () => {
    if (!household || !adult) return;
    try {
      const res = await api<{ decisions: Decision[] }>(
        `/households/${household.id}/decisions?status=all`,
      );
      setAll(res.decisions);
      setError(false);
    } catch {
      setError(true);
    }
  }, [household, adult]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 10_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  // A decision your partner just settled with their vote: acknowledged once, here or anywhere.
  useSettledWatcher(all, actions.settled, people.me?.id);

  const open = useMemo(() => (all ?? []).filter((d) => d.status === 'open'), [all]);
  const decided = useMemo(
    () =>
      (all ?? [])
        .filter((d) => d.status === 'decided')
        .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')),
    [all],
  );

  if (!adult) {
    return (
      <Page maxWidth={860}>
        <PageHeader kicker="Decide together" title="Decisions" />
        <EmptyState
          title="Decisions are between the adults"
          body="The adults in the household decide these together. Everything that affects your day shows on Today."
        />
      </Page>
    );
  }

  return (
    <Page
      maxWidth={860}
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
        kicker="Decide together"
        title="Decisions"
        lead="Questions for both of you. Vote on your own phone; when you both pick the same thing, it’s decided."
        action={<Button title="New decision" icon={Plus} onPress={() => setAdding(true)} />}
      />
      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message="Couldn’t load decisions. Check your connection." onRetry={load} />
        </View>
      ) : null}
      {!all && !error ? (
        <Skeleton label="Loading decisions">
          <View style={[styles.gap, styles.list]}>
            <SkeletonBlock height={170} />
            <SkeletonBlock height={170} />
          </View>
        </Skeleton>
      ) : null}
      {all ? (
        <FadeIn>
          <View style={styles.block}>
            <SectionHeader title="Open" sub={open.length ? 'Waiting on a vote' : undefined} />
            {open.length === 0 ? (
              <EmptyState
                compact
                art={<LanesArt style={styles.art} height={phone ? 14 : 18} />}
                title="Nothing waiting on the two of you"
                body="When something needs both of you (a school, a trip, a big purchase), add it here and vote when you have a minute."
                action={
                  <Button title="Add a decision" icon={Plus} onPress={() => setAdding(true)} />
                }
              />
            ) : (
              <View style={styles.list}>
                {open.map((d) => (
                  <DecisionCard key={d.id} decision={d} today={today} onVote={actions.vote} />
                ))}
              </View>
            )}
          </View>
          {decided.length ? (
            <View style={styles.block}>
              <SectionHeader title="Decided" sub="Newest first" />
              <View style={styles.list}>
                {decided.map((d) => (
                  <DecisionCard
                    key={d.id}
                    decision={d}
                    today={today}
                    onVote={actions.vote}
                    onReopen={(x) => void actions.reopen(x)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </FadeIn>
      ) : null}
      <Sheet
        visible={adding}
        onClose={() => setAdding(false)}
        label="New decision"
        title="Decide together"
        width={540}
      >
        {adding ? <NewDecision onCreate={actions.create} onDone={() => setAdding(false)} /> : null}
      </Sheet>
    </Page>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 24 },
  block: { marginTop: 36 },
  list: { gap: 12, marginTop: 16 },
  art: { maxWidth: 360, marginBottom: 6 },
});
