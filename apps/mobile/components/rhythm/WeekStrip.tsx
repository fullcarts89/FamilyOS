import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import { Text } from '../../design/Text';
import { color, font, radius, space, tint } from '../../design/tokens';
import type { Occurrence } from '../../lib/api';
import { addDays, shortDate, weekdayName } from '../../lib/dates';
import type { People, Person } from '../../lib/people';
import { localParts, spanOn, timeOf, type DayHeadsUp } from '../../lib/rhythm';

const FROM = 6 * 60;
const TO = 22 * 60;
const frac = (m: number) => (Math.min(Math.max(m, FROM), TO) - FROM) / (TO - FROM);

/**
 * The rest of the week as a strip of tiny rhythms: each day's lanes, its drop-offs and pickups
 * (whose, or a hatched "?" when nobody has it or it clashes), and a couple of its events.
 */
export function WeekStrip({
  start,
  today,
  timeZone,
  occurrences,
  headsUps,
  people,
}: {
  start: string;
  today: string;
  timeZone: string;
  occurrences: Occurrence[];
  headsUps: DayHeadsUp[];
  people: People;
}) {
  const { phone } = useLayout();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const lanes: Person[] = [
    ...(people.me ? [people.me] : []),
    ...people.caredFor.filter((p) => p.role === 'child'),
    ...people.adults.filter((p) => !p.isMe),
  ];
  const nowMin = localParts(new Date(), timeZone).minutes;

  const cards = days.map((d) => {
    const dayOcc = occurrences.filter((o) => o.date === d && !o.skipped && !o.allDay);
    const allDay = occurrences.filter((o) => o.date === d && !o.skipped && o.allDay);
    const care = dayOcc.filter((o) => o.careAction);
    const issues = headsUps.filter((h) => h.date === d);
    const clashKeys = new Set(issues.map((h) => h.headsUp.occurrenceKey));
    const notes = [...allDay, ...dayOcc.filter((o) => !o.careAction)].slice(0, phone ? 2 : 3);
    const isToday = d === today;
    return (
      <Pressable
        key={d}
        accessibilityRole="link"
        accessibilityLabel={`${weekdayName(d)}, ${shortDate(d)}${issues.length ? `, ${issues.length} to sort out` : ''}`}
        onPress={() => router.push({ pathname: '/week', params: { date: d } })}
        style={(s: PressState) => [
          styles.day,
          phone && styles.dayPhone,
          isToday && styles.today,
          issues.length > 0 && styles.clash,
          s.hovered && styles.hover,
        ]}
      >
        <View style={styles.dayHead}>
          <Text variant="label" tone={isToday ? 'ink' : 'muted'}>
            {isToday ? 'Today' : weekdayName(d).slice(0, 3)}
          </Text>
          <Text variant="h3" style={styles.num}>
            {Number(d.slice(8, 10))}
          </Text>
        </View>
        <View style={styles.lanes} aria-hidden>
          {lanes.map((p) => {
            const mine = p.caredFor
              ? care.filter((o) => o.careMemberId === p.id)
              : dayOcc.filter((o) => o.memberIds.includes(p.id));
            let away: { start: number; end: number } | null = null;
            if (p.caredFor) {
              const drop = mine.find((o) => o.careAction === 'drop_off');
              const pick = mine.find((o) => o.careAction === 'pick_up');
              if (drop || pick)
                away = {
                  start: drop ? spanOn(drop, d, timeZone).end : FROM,
                  end: pick ? spanOn(pick, d, timeZone).start : TO,
                };
            }
            return (
              <View key={p.id} style={styles.lane}>
                {away ? (
                  <View
                    style={[
                      styles.mini,
                      {
                        left: `${frac(away.start) * 100}%`,
                        width: `${(frac(away.end) - frac(away.start)) * 100}%`,
                        backgroundColor: tint(p.color, 0.6),
                      },
                    ]}
                  />
                ) : null}
                {mine.map((o) => {
                  const sp = spanOn(o, d, timeZone);
                  const adult = people.byId(o.memberIds.find((id) => !people.byId(id)?.caredFor));
                  const c = p.caredFor
                    ? (adult?.color ?? color.ink)
                    : o.careAction
                      ? p.color
                      : tint(p.color, 0.55);
                  const w = Math.max(0.03, frac(sp.end) - frac(sp.start));
                  return clashKeys.has(o.key) ? (
                    <View
                      key={o.key}
                      style={[
                        styles.mini,
                        {
                          left: `${frac(sp.start) * 100}%`,
                          width: `${w * 100}%`,
                          overflow: 'hidden',
                        },
                      ]}
                    >
                      <Hatch width={40} height={8} radius={2} stroke={color.ink} />
                    </View>
                  ) : (
                    <View
                      key={o.key}
                      style={[
                        styles.mini,
                        {
                          left: `${frac(sp.start) * 100}%`,
                          width: `${w * 100}%`,
                          backgroundColor: c,
                        },
                      ]}
                    />
                  );
                })}
                {isToday ? (
                  <View style={[styles.nowTick, { left: `${frac(nowMin) * 100}%` }]} />
                ) : null}
              </View>
            );
          })}
        </View>
        {care.length > 0 ? (
          <View style={styles.careRow}>
            {care
              .filter((o) => o.careAction)
              .slice(0, 2)
              .map((o) => {
                const adult = people.byId(o.memberIds.find((id) => !people.byId(id)?.caredFor));
                const problem = clashKeys.has(o.key) || !adult;
                return (
                  <View key={o.key} style={[styles.careChip, problem && styles.careProblem]}>
                    {problem ? (
                      <Hatch width={10} height={10} radius={5} />
                    ) : (
                      <View style={[styles.dot, { backgroundColor: adult?.color }]} />
                    )}
                    <Text variant="small">
                      {o.careAction === 'drop_off' ? 'Drop' : 'Pick'}{' '}
                      {timeOf(o.startsAt, timeZone).replace(/am|pm/, '')}
                    </Text>
                  </View>
                );
              })}
          </View>
        ) : null}
        <View style={styles.notes}>
          {notes.map((o) => (
            <Text key={o.key} variant="small" tone="muted" numberOfLines={1}>
              <Text variant="small" style={styles.noteTime}>
                {o.allDay ? 'All day' : timeOf(o.startsAt, timeZone)}
              </Text>{' '}
              {o.title}
            </Text>
          ))}
          {notes.length === 0 && care.length === 0 ? (
            <Text variant="small" tone="muted">
              Nothing planned
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  });

  if (phone) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.phoneRow}
      >
        {cards}
      </ScrollView>
    );
  }
  return <View style={styles.grid}>{cards}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: space[3] },
  phoneRow: { gap: space[3], paddingRight: space[4] },
  day: {
    flex: 1,
    minWidth: 0,
    gap: space[3],
    padding: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
    cursor: 'pointer',
  },
  dayPhone: { width: 150, flexGrow: 0, flexShrink: 0, flexBasis: 150 },
  today: { borderColor: color.ink },
  clash: { borderStyle: 'dashed', borderColor: color.ink },
  hover: { borderColor: color.ink },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  num: { fontFamily: font.displayHeavy },
  lanes: { gap: space[1] },
  lane: { height: 8, borderRadius: 4, backgroundColor: color.lane, overflow: 'hidden' },
  mini: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  nowTick: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: color.ink },
  careRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
  careChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: space[5] + 2,
    paddingHorizontal: space[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  careProblem: { borderColor: color.ink, borderStyle: 'dashed' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  notes: { gap: space[1] },
  noteTime: { fontFamily: font.uiBold, color: color.ink },
});
