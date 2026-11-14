import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../lib/theme';

/** A single centered column, never wider than a phone, on every screen size. */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

/** The FamilyOS name, for the screens people see before they are signed in. */
export function Brand() {
  const t = useTheme();
  return (
    <View style={styles.brand}>
      <Text accessibilityRole="header" style={[styles.wordmark, { color: t.accent }]}>
        FamilyOS
      </Text>
      <Text style={[styles.tagline, { color: t.muted }]}>Your household, shared.</Text>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.muted : t.text }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="alert" style={[styles.body, { color: t.danger }]}>
      {children}
    </Text>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        {...input}
      />
    </View>
  );
}

/** `primary` is the screen's main action; `secondary` is a quiet text button beside it. */
export function Button({
  title,
  onPress,
  busy,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const t = useTheme();
  const inactive = disabled || busy;
  const primary = variant === 'primary';
  // Disabled uses its own colors rather than opacity, which renders unevenly on the web.
  const background = !primary ? 'transparent' : disabled && !busy ? t.disabled : t.accent;
  const foreground = !primary ? t.accent : disabled && !busy ? t.onDisabled : t.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  column: { width: '100%', maxWidth: 440, gap: 16 },
  brand: { gap: 4, marginBottom: 16 },
  wordmark: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  tagline: { fontSize: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  field: { gap: 6 },
  label: { fontSize: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
