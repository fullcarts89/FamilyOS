import { router, type Href } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Button } from '../design/Button';
import { LanesArt } from '../design/EmptyState';
import { useLayout } from '../design/layout';
import { Page } from '../design/Page';
import { Text } from '../design/Text';
import { color, radius } from '../design/tokens';
import { usePeople } from '../lib/people';

/**
 * A designed "coming next in this redesign" page for areas that aren't built yet. It says what
 * the area will do, in plain words, and shows no made-up data.
 */
export function ComingNext({
  title,
  line,
  points,
  lanes,
  next,
}: {
  title: string;
  line: string;
  points: string[];
  lanes: [number, number][][];
  next?: { label: string; href: Href };
}) {
  const { phone } = useLayout();
  const people = usePeople();
  const colors = people.all.slice(0, 3).map((p) => p.color);
  return (
    <Page maxWidth={980}>
      <View style={[styles.wrap, phone && styles.wrapPhone]}>
        <View style={styles.tag}>
          <View style={styles.dot} />
          <Text variant="kicker" tone="ink">
            Coming next in this redesign
          </Text>
        </View>
        <Text variant="hero">{title}</Text>
        <Text variant="lead" tone="muted" style={styles.line}>
          {line}
        </Text>
        <LanesArt
          lanes={lanes}
          colors={colors.length >= 3 ? colors : undefined}
          height={phone ? 18 : 26}
          style={styles.art}
        />
        <View style={styles.points}>
          {points.map((p) => (
            <View key={p} style={styles.point}>
              <View style={styles.bead} />
              <Text variant="body" style={styles.pointText}>
                {p}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.actions}>
          <Button title="Back to today" onPress={() => router.navigate('/')} />
          {next ? (
            <Button
              title={next.label}
              variant="secondary"
              icon={ArrowRight}
              iconRight
              onPress={() => router.navigate(next.href)}
            />
          ) : null}
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingTop: 24 },
  wrapPhone: { paddingTop: 4, gap: 12 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    borderStyle: 'dashed',
  },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: color.ink },
  line: { maxWidth: 640 },
  art: { marginVertical: 18 },
  points: { gap: 10, borderTopWidth: 2, borderTopColor: color.ink, paddingTop: 16 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: color.ink,
    marginTop: 5,
  },
  pointText: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 14 },
});
