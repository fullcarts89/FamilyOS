import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, Check, NotebookPen, Utensils, Vote } from 'lucide-react-native';
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
import { planFacts } from '../reset/coordination';

const mondayOf = (date: string) => addDays(date, 1 - dayOfWeek(date));

/**
 * Today's line from the Weekly Reset: whether this week has a plan, its notes (one line, tap for
 * all of it), whether the week's care is covered from here on (or what still needs someone, a tap
 * from the Week), the decisions still open (a tap from Decisions), tonight's dinner, and on the
 * weekend a nudge to plan the next week together. Everything the Reset left open is reachable
 * from here. All of it comes from the plan's real data.
 */
export function WeekPlanStrip({ today, version }: { today: string; version: number }) {
  const { household } = useHousehold();
  const people = usePeople();
  const { phone } = useLayout();
  const [week, setWeek] = useState<ResetResponse | null>(null);
  const [next, setNext] = useState<ResetResponse | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
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
  const facts = planFacts(week, next, Date.now());
  const careOpen = facts?.care.count ?? 0;
  const dinner = week.meals.find((m) => m.onDate === today && m.slot === 'dinner');
  const cook = people.byId(dinner?.cookMemberId);
  const committed = !!week.plan?.committedAt;
  const care = people.caredFor.find((p) => p.role === 'child');
  const nextCommitted = !!next?.plan?.committedAt;

  const pieces: { key: string; icon: React.ReactNode; text: string; go?: () => void }[] = [];
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
    careOpen
      ? {
          key: 'care',
          icon: <Hatch width={18} height={12} radius={3} />,
          text: `${careOpen === 1 ? 'One drop-off or pickup still needs' : `${careOpen} drop-offs and pickups still need`} someone`,
          go: () =>
            router.push({
              pathname: '/week',
              params: facts?.care.first ? { date: facts.care.first } : {},
            }),
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
  if (facts?.decisionsOpen) {
    pieces.push({
      key: 'decisions',
      icon: <Vote size={16} color={color.ink} strokeWidth={2.2} />,
      text:
        facts.decisionsOpen === 1 ? 'One decision open' : `${facts.decisionsOpen} decisions open`,
      go: () => router.push('/decisions'),
    });
  }

  const nudge =
    weekend && next && !nextCommitted
      ? 'Plan next week together'
      : !committed && !weekend
        ? 'This week has no plan yet. Plan it together.'
        : null;

  return (
    <FadeIn>
      <View
        style={[styles.strip, phone && styles.stripPhone]}
        role="group"
        aria-label="The week’s plan"
      >
        <View style={[styles.pieces, phone && styles.piecesPhone]}>
          {pieces.map((p) =>
            p.go ? (
              <Pressable
                key={p.key}
                accessibilityRole="link"
                onPress={p.go}
                style={(s: PressState) => [
                  styles.piece,
                  styles.pieceLink,
                  s.hovered && styles.linkHover,
                ]}
              >
                {p.icon}
                <Text variant="label" style={styles.underline}>
                  {p.text}
                </Text>
              </Pressable>
            ) : (
              <View key={p.key} style={styles.piece}>
                {p.icon}
                <Text variant="label">{p.text}</Text>
              </View>
            ),
          )}
          {facts?.notes ? (
            <Pressable
              accessibilityRole="button"
              aria-expanded={notesOpen}
              accessibilityLabel={`${facts.notesFor === 'next' ? 'Notes for next week' : 'This week’s notes'}: ${facts.notes}`}
              accessibilityHint={notesOpen ? 'Shows one line' : 'Shows all of the notes'}
              onPress={() => setNotesOpen((v) => !v)}
              style={(s: PressState) => [
                styles.piece,
                styles.notes,
                phone && styles.notesPhone,
                s.hovered && styles.linkHover,
              ]}
            >
              <NotebookPen size={16} color={color.ink} strokeWidth={2.2} />
              <Text variant="label" numberOfLines={notesOpen ? undefined : 1} style={styles.flex}>
                <Text variant="label" tone="muted">
                  {facts.notesFor === 'next' ? 'Next week: ' : 'Notes: '}
                </Text>
                {facts.notes}
              </Text>
            </Pressable>
          ) : null}
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
  // One column on phones, and it must not wrap: a wrapping column sizes each line to its widest
  // content, so a long line (the notes) ran off the card instead of ending in an ellipsis.
  stripPhone: {
    paddingLeft: space[4],
    paddingVertical: space[3],
    alignItems: 'flex-start',
    flexDirection: 'column',
    flexWrap: 'nowrap',
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
  // Phones: one piece per line, as wide as the card (a column that wraps pushed a long piece,
  // the notes, into a second column off the card).
  piecesPhone: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    flexGrow: 0,
    flexBasis: 'auto',
    alignSelf: 'stretch',
  },
  piece: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pieceLink: { minHeight: touch, cursor: 'pointer' },
  underline: { textDecorationLine: 'underline', textDecorationColor: color.line2 },
  // Wide screens: the notes take a line of their own under the other pieces.
  notes: { minHeight: touch, flexBasis: '100%', minWidth: 0, cursor: 'pointer' },
  notesPhone: { flexBasis: 'auto', alignSelf: 'stretch' },
  flex: { flex: 1, minWidth: 0 },
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
    gap: space[2] - 2,
    minHeight: touch,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    cursor: 'pointer',
  },
  linkInk: { backgroundColor: color.ink },
  linkHover: { opacity: 0.85 },
});
