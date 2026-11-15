import { AlertCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { color, radius } from './tokens';

/** A problem the person can act on: what happened, and a way to try again. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <AlertCircle size={18} color={color.danger} strokeWidth={2.2} />
      <Text variant="meta" color={color.danger} style={styles.text}>
        {message}
      </Text>
      {onRetry ? <Button title="Try again" size="sm" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: color.dangerTint,
  },
  text: { flex: 1, minWidth: 180, fontSize: 14 },
});
