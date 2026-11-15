import { usePathname } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../design/Button';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { color } from '../../design/tokens';
import {
  pushAvailable,
  pushPromptAnswered,
  setPushPromptAnswered,
  usePushResponses,
} from '../../native/push';
import { usePush } from './use-push';

/** How long Today is on screen before the question comes up: after a first look, not at launch. */
const SETTLE_MS = 2500;

/**
 * iPhone only: once, after the first sign-in on this device, on Today (never at launch), a short
 * explanation of what FamilyOS would send, then iOS's own permission prompt if you want it.
 * "Not now" is an answer too; it's never asked again here (Household, Your settings, has the
 * switch). Also keeps this device registered while allowed, and opens what a notification is
 * about when you tap it.
 */
export function PushPrompt() {
  usePushResponses();
  const { permission, enable } = usePush();
  const onToday = usePathname() === '/';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushAvailable || !onToday || permission !== 'undetermined') return;
    let alive = true;
    const timer = setTimeout(() => {
      void pushPromptAnswered().then((answered) => alive && !answered && setOpen(true));
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [onToday, permission]);

  if (!pushAvailable) return null;
  const close = () => {
    setOpen(false);
    void setPushPromptAnswered();
  };
  return (
    <Sheet visible={open} onClose={close} label="Notifications on this iPhone" width={480}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Bell size={22} color={color.ink} strokeWidth={2.2} />
        </View>
        <Text variant="chapter">A heads-up when it matters?</Text>
        <Text variant="body" tone="muted">
          FamilyOS can tell you on this iPhone, only about things that are yours:
        </Text>
        <View style={styles.list}>
          {[
            'Half an hour before a drop-off or pickup you’re covering',
            'A short morning check-in, on days something concerns you',
            'When it’s time for the Weekly Reset',
          ].map((line) => (
            <Text key={line} variant="body">
              · {line}
            </Text>
          ))}
        </View>
        <Text variant="meta" tone="muted">
          Never to get you to open the app. Quiet hours are respected, and each kind has its own
          switch in Household, Your settings.
        </Text>
      </View>
      <SheetActions>
        <View style={styles.actions}>
          <Button
            title="Turn on notifications"
            busy={busy}
            onPress={async () => {
              setBusy(true);
              await enable();
              setBusy(false);
              close();
            }}
          />
          <Button title="Not now" variant="quiet" onPress={close} />
        </View>
      </SheetActions>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.lane,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
