import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Luggage, Plus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AwaySheet, type AwayTarget } from '../../components/in-town/AwaySheet';
import { VisitorSheet, type VisitorTarget } from '../../components/in-town/VisitorSheet';
import { Avatar } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { FadeIn, Skeleton, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, radius, shadow } from '../../design/tokens';
import { api, type PresenceResponse } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { awayLine, awayRange, coverLine, visitRange } from '../../lib/in-town';
import { usePeople } from '../../lib/people';

// Who's in town (docs/plan/whos-in-town.md): who's away and who covers, what an away period
// suggests handing over, and who's coming to stay. Adults change it; a sitter can read it.
export default function InTown() {
  const { household } = useHousehold();
  const people = usePeople();
  const { changed } = useCapture();
  const params = useLocalSearchParams<{ review?: string; add?: string }>();
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [error, setError] = useState(false);
  const [away, setAway] = useState<AwayTarget | null>(null);
  const [visitor, setVisitor] = useState<VisitorTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const canEdit = household?.role !== 'caregiver';

  const load = useCallback(async () => {
    if (!household) return;
    try {
      setData(await api<PresenceResponse>(`/households/${household.id}/presence`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Opened from Today's nudge: straight to that review. From the household: straight to adding.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!data || opened) return;
    setOpened(true);
    const p = params.review ? data.awayPeriods.find((x) => x.id === params.review) : null;
    if (p && canEdit) setAway({ mode: 'review', period: p });
    else if (params.add === 'away' && canEdit) setAway({ mode: 'add' });
    else if (params.add === 'visitor' && canEdit) setVisitor({ mode: 'add' });
  }, [data, opened, params.review, params.add, canEdit]);

  const onChanged = () => {
    void load();
    changed();
  };
  const today = data?.today ?? '';
  const pendingFor = (id: string) => data?.handovers.find((h) => h.awayPeriodId === id)?.count ?? 0;

  return (
    <Page
      maxWidth={820}
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
        kicker="Household"
        title="Who’s in town"
        lead="Who’s away and who’s coming to stay, so the week accounts for it. While someone’s away, the adult at home covers their handoffs and routine turns, and their other things are suggested."
      />

      {error ? (
        <View style={styles.gap}>
          <ErrorNotice
            message="Couldn’t load who’s in town. Check your connection."
            onRetry={load}
          />
        </View>
      ) : null}
      {!data && !error ? (
        <Skeleton label="Loading who’s in town">
          <View style={styles.gap}>
            <SkeletonRows count={3} />
          </View>
        </Skeleton>
      ) : null}

      {data ? (
        <FadeIn style={styles.sections}>
          <View style={styles.section}>
            <SectionHeader
              title="Away"
              sub="Out of town, from today on"
              action={
                canEdit ? (
                  <Button
                    title="Mark someone away"
                    icon={Plus}
                    size="sm"
                    variant="secondary"
                    onPress={() => setAway({ mode: 'add' })}
                  />
                ) : undefined
              }
            />
            {data.awayPeriods.length === 0 ? (
              <Text variant="body" tone="muted" style={styles.quiet}>
                Everyone’s home.
              </Text>
            ) : (
              <View style={styles.cards}>
                {data.awayPeriods.map((p) => {
                  const who = people.byId(p.memberId);
                  const pending = pendingFor(p.id);
                  return (
                    <View key={p.id} style={styles.card}>
                      <Pressable
                        accessibilityRole={canEdit ? 'button' : undefined}
                        accessibilityHint={canEdit ? 'Change the dates or who covers' : undefined}
                        disabled={!canEdit}
                        onPress={() => setAway({ mode: 'edit', period: p })}
                        style={(s: PressState) => [
                          styles.cardMain,
                          canEdit && s.hovered && styles.hover,
                        ]}
                      >
                        {who ? <Avatar person={who} size={32} /> : <Luggage size={20} />}
                        <View style={styles.cardText}>
                          <Text variant="title">{awayLine(p, people, today)}</Text>
                          <Text variant="meta" tone="muted">
                            {awayRange(p, today)}
                            {who && !who.caredFor ? ` · ${coverLine(p, people)}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                      {pending > 0 && canEdit ? (
                        <View style={styles.cardFoot}>
                          <Text variant="meta">
                            {pending === 1 ? '1 thing' : `${pending} things`} to hand over
                          </Text>
                          <Button
                            title="Review"
                            size="sm"
                            onPress={() => setAway({ mode: 'review', period: p })}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Visiting"
              sub="Family and friends staying, to plan ahead"
              action={
                canEdit ? (
                  <Button
                    title="Add a visitor"
                    icon={Plus}
                    size="sm"
                    variant="secondary"
                    onPress={() => setVisitor({ mode: 'add' })}
                  />
                ) : undefined
              }
            />
            {data.visitors.length === 0 ? (
              <Text variant="body" tone="muted" style={styles.quiet}>
                Nobody’s coming yet.
              </Text>
            ) : (
              <View style={styles.cards}>
                {data.visitors.map((v) => (
                  <View key={v.id} style={styles.card}>
                    <Pressable
                      accessibilityRole={canEdit ? 'button' : undefined}
                      accessibilityHint={canEdit ? 'Change or remove the visit' : undefined}
                      disabled={!canEdit}
                      onPress={() => setVisitor({ mode: 'edit', visitor: v })}
                      style={(s: PressState) => [
                        styles.cardMain,
                        canEdit && s.hovered && styles.hover,
                      ]}
                    >
                      <Users size={20} color={color.ink} strokeWidth={2.2} />
                      <View style={styles.cardText}>
                        <Text variant="title">{v.name}</Text>
                        <Text variant="meta" tone="muted">
                          {visitRange(v, today)}
                          {v.notes ? ` · ${v.notes}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </FadeIn>
      ) : null}

      <AwaySheet target={away} today={today} onClose={() => setAway(null)} onChanged={onChanged} />
      <VisitorSheet
        target={visitor}
        today={today}
        onClose={() => setVisitor(null)}
        onChanged={onChanged}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 24 },
  sections: { marginTop: 12, gap: 28 },
  section: { gap: 4 },
  quiet: { marginTop: 8 },
  cards: { gap: 10, marginTop: 10 },
  card: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    boxShadow: shadow.card,
    borderWidth: 1.5,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  hover: { backgroundColor: color.ground, cursor: 'pointer' },
  cardText: { flex: 1, gap: 2 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
});
