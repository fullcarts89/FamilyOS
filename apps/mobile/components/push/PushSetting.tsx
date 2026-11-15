import { StyleSheet, View } from 'react-native';
import { Button } from '../../design/Button';
import { Text } from '../../design/Text';
import { color } from '../../design/tokens';
import { openPushSettings, pushAvailable, pushProjectId } from '../../native/push';
import { usePush } from './use-push';

/**
 * Household, Your settings: whether this iPhone gets notifications, and a way to turn them on.
 * On the web there's nothing to turn on here; the line says they arrive on the iPhone.
 */
export function PushSetting() {
  const { permission, registration, enable } = usePush();
  if (!pushAvailable) {
    return (
      <Text variant="meta" tone="muted" style={styles.note}>
        Notifications arrive in the FamilyOS iPhone app. What you choose here applies there.
      </Text>
    );
  }
  const configured = pushProjectId() !== null;
  const state =
    permission === 'granted'
      ? !configured || registration === 'not_configured'
        ? {
            title: 'Allowed on this iPhone',
            line: 'They’ll start once this build of FamilyOS is set up for push.',
          }
        : registration === 'failed'
          ? {
              title: 'Allowed, not connected yet',
              line: 'Couldn’t reach FamilyOS to finish. It tries again when you come back.',
            }
          : { title: 'On for this iPhone', line: 'Choose which kinds below.' }
      : permission === 'denied'
        ? {
            title: 'Off for this iPhone',
            line: 'Turned off in iOS Settings. Turn them on there, under FamilyOS.',
          }
        : {
            title: 'Not on yet',
            line: 'Handoff reminders, a morning check-in and the Weekly Reset, on this iPhone.',
          };
  return (
    <View style={styles.row} accessibilityLabel={`Notifications on this iPhone: ${state.title}`}>
      <View style={styles.text}>
        <Text variant="title">{state.title}</Text>
        <Text variant="meta" tone="muted">
          {state.line}
        </Text>
      </View>
      {permission === 'undetermined' ? (
        <Button title="Turn on" size="sm" onPress={() => void enable()} />
      ) : permission === 'denied' ? (
        <Button title="Open Settings" size="sm" variant="secondary" onPress={openPushSettings} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  text: { flex: 1, gap: 2 },
});
