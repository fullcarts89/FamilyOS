import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, Check, Utensils } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, radius, space, touch } from '../../design/tokens';
import { api, type ResetResponse } from '../../lib/api';
import { addDays, dayOfWeek } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

const mondayOf = (date: string) => addDays(date, 1 - dayOfWeek(date));

/**
 * Today's line from the Weekly Reset: whether this week has a plan, whether the week's care is
 * covered from here on (or what still needs someone), tonight's dinner, and on the weekend a
 * nudge to plan the next week together. Everything comes from the committed plan's real data.
 */
export function WeekPlanStrip({ today, version }: { today: string; version: number }) {
  const { household } = useHousehold();
  const people = usePeople();
  const { phone } = useLayout();
  const [week, setWeek] = useState<ResetResponse | null>(null);
  const [next, setNext] = useState<ResetResponse | null>(null);
  const adult = household?.role === 'owner' || household?.role === 'adult';
  const monday = mondayOf(today);
  const weekend = dayOfWeek(today) >= 5;

  const load = useCallback(async () => {
    if (!household || !adult || !today) return;
    const base = `/households/${household.id}/reset`;
    try {
      const [w, n] = await Promise.all([
        api<ResetResponse>(`${base}?week=${monday}`),
        weekend ? api<ResetResponse>(`${base}?week=${addDays(monday, 7)}`) : Promise.resolve(null),
      ]);
      setWeek(w);
      setNext(n);
    } catch {
      // Today works without the plan line; it comes back on the next refresh.
    }
    // `version` reloads after a change elsewhere in the app.
  }, [household, adult, today, monday, weekend, version]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!adult || !week) return null;
  const now = Date.now();
  const ahead = [...week.events.needsOwner, ...week.events.conflicts].filter(
    (h) => new Date(h.time).getTime() > now,
  );
  const dinner = week.meals.find((m) => m.onDate === today && m.slot === 'dinner');
  const cook = people.byId(dinner?.cookMemberId);
  const committed = !!week.plan?.committedAt;
  const care = people.caredFor.find((p) => p.role === 'child');
  const nextCommitted = !!next?.plan?.committedAt;

  const pieces: { key: string; icon: React.ReactNode; text: string }[] = [];
  if (committed) {
    pieces.push({
      key: 'plan',
      icon: (
        <View style={styles.tick}>
          <Check size={11} strokeWidth={3.2} color={color.onInk} />
        </View>
      ),
      text: 'This week has a plan',
    });
  }
  pieces.push(
    ahead.length
      ? {
          key: 'care',
          icon: <Hatch width={18} height={12} radius={3} />,
          text: `${ahead.length === 1 ? 'One drop-off or pickup still needs' : `${ahead.length} drop-offs and pickups still need`} someone`,
        }
      : {
          key: 'care',
          icon: (
            <View style={styles.tick}>
              <Check size={11} strokeWidth={3.2} color={color.onInk} />
            </View>
          ),
          text: care
            ? `${care.name}’s week is covered from here`
            : 'The week’s handoffs are covered',
        },
  );
  pieces.push({
    key: 'dinner',
    icon: cook ? (
      <Avatar person={cook} size={18} />
    ) : (
      <Utensils size={16} color={color.ink} strokeWidth={2.2} />
    ),
    text: dinner
      ? `Dinner tonight: ${dinner.title}${cook ? ` · ${cook.isMe ? 'you cook' : `${cook.name} cooks`}` : ''}`
      : 'No dinner planned tonight',
  });

  const nudge =
    weekend && next && !nextCommitted
      ? 'Plan next week together'
      : !committed && !weekend
        ? 'This week has no plan yet. Plan it together.'
        : null;

  return (
    <FadeIn>
      <View style={[styles.strip, phone && styles.stripPhone]}>
        <View style={[styles.pieces, phone && styles.piecesPhone]}>
          {pieces.map((p) => (
            <View key={p.key} style={styles.piece}>
              {p.icon}
              <Text variant="label" style={styles.pieceText}>
                {p.text}
              </Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: '/reset',
              params: nudge ? {} : { chapter: '6', week: monday },
            })
          }
          style={(s: PressState) => [
            styles.link,
            nudge && styles.linkInk,
            s.hovered && styles.linkHover,
          ]}
        >
          <Text variant="label" color={nudge ? color.onInk : color.ink}>
            {nudge ?? 'Open the plan'}
          </Text>
          <ArrowRight size={15} color={nudge ? color.onInk : color.ink} strokeWidth={2.2} />
        </Pressable>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    flexWrap: 'wrap',
    paddingVertical: space[2],
    paddingLeft: space[4],
    paddingRight: space[2],
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  stripPhone: {
    paddingLeft: space[4],
    paddingVertical: space[3],
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: space[3],
  },
  pieces: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space[5],
    rowGap: space[2],
    minWidth: 0,
  },
  piecesPhone: { flexDirection: 'column' },
  piece: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pieceText: { flexShrink: 1 },
  tick: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: touch,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    cursor: 'pointer',
  },
  linkInk: { backgroundColor: color.ink },
  linkHover: { opacity: 0.85 },
});
