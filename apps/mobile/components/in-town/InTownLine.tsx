import { router } from 'expo-router';
import { Luggage } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, type PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import type { RhythmResponse } from '../../lib/api';
import { handoverNudge, townWords } from '../../lib/in-town';
import type { People } from '../../lib/people';

/**
 * Today's "who's in town" line, under the greeting: who's away, who's visiting or arriving
 * within a week ("Theo’s away, back Fri · Grandma arrives Sat"), and, for an adult, an away
 * period's hand-over waiting for a yes. Nothing when everyone's home and nobody's coming.
 */
export function InTownLine({
  presence,
  people,
  today,
  canHandOver,
}: {
  presence: RhythmResponse['presence'];
  people: People;
  today: string;
  canHandOver: boolean;
}) {
  const words = townWords(presence, people, today);
  const nudges = canHandOver
    ? (presence?.handovers ?? []).flatMap((h) => {
        const text = handoverNudge(h, people);
        return text ? [{ id: h.awayPeriodId, text }] : [];
      })
    : [];
  if (!words && nudges.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {words ? (
        <Pressable
          accessibilityRole="link"
          accessibilityHint="Opens who’s in town"
          onPress={() => router.push('/in-town')}
          style={(s: PressState) => [styles.line, s.hovered && styles.hover]}
        >
          <Luggage size={16} color={color.muted} strokeWidth={2.2} />
          <Text variant="body" tone="muted" style={styles.text}>
            {words}
          </Text>
        </Pressable>
      ) : null}
      {nudges.map((n) => (
        <View key={n.id} style={styles.nudge}>
          <Text variant="body" style={styles.text}>
            {n.text}
          </Text>
          <Button
            title="Review"
            size="sm"
            variant="secondary"
            onPress={() => router.push({ pathname: '/in-town', params: { review: n.id } })}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 10 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    cursor: 'pointer',
  },
  hover: { opacity: 0.8 },
  text: { flexShrink: 1 },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
});
