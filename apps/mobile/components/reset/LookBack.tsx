import { Check, Heart, Repeat2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { useLayout } from '../../design/layout';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, font, radius } from '../../design/tokens';
import type { ResetResponse } from '../../lib/api';
import { weekdayName } from '../../lib/dates';
import { usePeople } from '../../lib/people';
import {
  appreciation,
  entryDetail,
  listWords,
  thankYouGroups,
  weekRange,
} from '../../lib/reset-words';
import { ChapterHead } from './ChapterHead';

/**
 * Chapter 1, looking back (A's pacing and warmth): what the household got done together, then
 * each adult's part in words, as thanks; both partners always appear. Items, never counts;
 * nothing set side by side as a score.
 */
export function LookBack({ data }: { data: ResetResponse }) {
  const people = usePeople();
  const { desktop } = useLayout();
  const nameOf = (id: string | null) => people.byId(id)?.name ?? null;
  const lb = data.lookBack;

  const together: { key: string; text: string }[] = [];
  for (const p of lb.projects) {
    if (p.completed) together.push({ key: p.id, text: `Finished “${p.title}”.` });
    else if (p.progress.done > 0) {
      together.push({
        key: p.id,
        text: `“${p.title}” moved along: ${p.progress.done} of ${p.progress.total} steps done so far.`,
      });
    }
  }
  for (const d of lb.decisions) {
    together.push({
      key: d.id,
      text: d.decidedOption
        ? `Decided together: ${d.decidedOption}, for “${d.question}”`
        : `Decided together: “${d.question}”`,
    });
  }
  for (const c of lb.coverage.byCareMember) {
    const name = nameOf(c.memberId) ?? 'The children';
    together.push({
      key: `cov:${c.memberId}`,
      text: c.allCovered
        ? `Every drop-off and pickup for ${name} had someone.`
        : `A few of ${name}’s drop-offs and pickups had nobody down for them.`,
    });
  }
  const coverWords = lb.coverage.covers
    .map((c) => {
      const who = people.byId(c.memberId);
      const what = /pick/i.test(c.title) ? 'pickup' : /drop/i.test(c.title) ? 'drop-off' : c.title;
      return who ? `${who.name} stepped in for ${weekdayName(c.date)}’s ${what}` : null;
    })
    .filter((x): x is string => !!x);
  if (coverWords.length) {
    together.push({ key: 'covers', text: `${listWords(coverWords)}.` });
  }

  // Both partners always get a card, even in a week with nothing on the list for one of them.
  const partnerIds = people.adults
    .filter((p) => p.role === 'owner' || p.role === 'adult')
    .map((p) => p.id);
  const groups = thankYouGroups(partnerIds, lb.byMember, (id) => !!people.byId(id));
  const quiet = together.length === 0 && groups.every((g) => g.entries.length === 0);

  return (
    <View style={styles.wrap}>
      <ChapterHead
        large
        kicker="Chapter 1 · Look back"
        title={quiet ? 'A quieter week on the list' : 'What we got done together'}
        lead={
          quiet
            ? `Nothing important was marked done between ${weekRange(lb.from, lb.to)}. That happens. Let’s set up the week ahead.`
            : `${weekRange(lb.from, lb.to)}. The things that mattered, and the part each of you played.`
        }
      />

      {together.length ? (
        <FadeIn delay={80} style={styles.section}>
          <Text variant="h2" style={styles.sectionTitle}>
            Together
          </Text>
          {together.map((t) => (
            <View key={t.key} style={styles.highlight}>
              <View style={styles.check}>
                <Check size={14} strokeWidth={3} color={color.onInk} />
              </View>
              <Text variant="lead" style={styles.flex}>
                {t.text}
              </Text>
            </View>
          ))}
        </FadeIn>
      ) : null}

      {groups.length ? (
        <FadeIn delay={160} style={styles.section}>
          <Text variant="h2" style={styles.sectionTitle}>
            Thank you
          </Text>
          <View style={[styles.people, desktop && styles.peopleWide]}>
            {groups.map((g) => {
              const p = people.byId(g.memberId);
              if (!p) return null;
              return (
                <View key={p.id} style={[styles.person, desktop && styles.personWide]}>
                  <View style={styles.personHead}>
                    <Avatar person={p} size={30} />
                    <Text variant="h3">{p.name}</Text>
                  </View>
                  <Text style={styles.thanks}>{appreciation(p.name, g.entries, nameOf)}</Text>
                  <View style={styles.entries}>
                    {g.entries.map((e) => (
                      <View
                        key={e.kind === 'item' ? e.id : `${e.routineId}:${p.id}`}
                        style={styles.entry}
                      >
                        {e.kind === 'routine' ? (
                          <Repeat2 size={15} color={p.color} strokeWidth={2.4} />
                        ) : e.reason === 'care' ? (
                          <Heart size={15} color={p.color} strokeWidth={2.4} />
                        ) : (
                          <Check size={15} color={p.color} strokeWidth={2.8} />
                        )}
                        <View style={styles.flex}>
                          <Text variant="title">{e.title}</Text>
                          <Text variant="small" tone="muted">
                            {entryDetail(e, nameOf)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </FadeIn>
      ) : null}

      {!quiet ? (
        <FadeIn delay={240}>
          <Text style={styles.prompt}>
            Anything else worth a thank-you that isn’t on a list? Say it out loud.
          </Text>
        </FadeIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 30 },
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  sectionTitle: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  highlight: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  people: { gap: 16 },
  peopleWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  person: {
    gap: 12,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
  },
  personWide: { flex: 1 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thanks: {
    fontFamily: font.serifRegular,
    fontSize: 19,
    lineHeight: 27,
    color: color.ink,
  },
  entries: { gap: 10 },
  entry: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  prompt: {
    fontFamily: font.serifRegular,
    fontSize: 18,
    lineHeight: 26,
    color: color.muted,
  },
});
