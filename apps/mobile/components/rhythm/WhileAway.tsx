import { StyleSheet, View } from 'react-native';
import { Text } from '../../design/Text';
import { color, radius, space } from '../../design/tokens';
import type { Activity } from '../../lib/api';
import type { People } from '../../lib/people';
import { awayWords } from './today-model';

/**
 * Back after two or more days: one line to catch up on, from what Today already loaded. "While you
 * were away: Theo handled 6 things; 3 need you." The details are in "Since you last looked" and
 * your own list.
 */
export function WhileAway({
  since,
  today,
  timeZone,
  activity,
  people,
  needYou,
}: {
  /** When you last looked (before this visit). */
  since: string | null;
  today: string;
  timeZone: string;
  activity: Activity[] | null;
  people: People;
  /** Your late and due-today rows. */
  needYou: number;
}) {
  const words = awayWords({ since, today, timeZone, activity, people, needYou });
  if (!words) return null;
  return (
    <View style={styles.line}>
      <Text variant="body">{words}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    marginTop: space[4],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.line2,
    alignSelf: 'flex-start',
    maxWidth: 760,
  },
});
