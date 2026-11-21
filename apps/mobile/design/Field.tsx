import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { color, font, radius } from './tokens';

/** A labelled text field. The label is always visible (never only a placeholder). */
export const Field = forwardRef<
  ComponentRef<typeof TextInput>,
  TextInputProps & { label: string; hint?: string; error?: string | null }
>(function Field({ label, hint, error, style, onFocus, onBlur, multiline, ...input }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text variant="label" tone="ink" style={styles.label}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={color.faint}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.invalid,
          style,
        ]}
        {...input}
      />
      {error ? (
        <Text variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="meta" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { fontSize: 13.5 },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: color.line2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.ui,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  focused: { borderColor: color.ink },
  invalid: { borderColor: color.danger },
});
