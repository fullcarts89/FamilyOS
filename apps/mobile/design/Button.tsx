import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { color, radius, touch } from './tokens';

/** Pressable state, with the hover state React Native Web adds. */
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/** Extra hit area so small-looking controls still meet the 44pt minimum. */
export const hitSlopFor = (height: number) => {
  const extra = Math.max(0, Math.ceil((touch - height) / 2));
  return { top: extra, bottom: extra, left: 4, right: 4 };
};

type Variant = 'primary' | 'secondary' | 'quiet';

/**
 * `primary`: the one main action (ink). `secondary`: an outlined alternative.
 * `quiet`: a low-emphasis text action.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight,
  busy,
  disabled,
  full,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  /** Place the icon after the title (e.g. an arrow). */
  iconRight?: boolean;
  busy?: boolean;
  disabled?: boolean;
  full?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = !!disabled || !!busy;
  const height = size === 'sm' ? 34 : size === 'lg' ? 52 : 44;
  const fg = variant === 'primary' ? color.onInk : color.ink;
  const iconNode = Icon ? <Icon size={size === 'sm' ? 15 : 17} color={fg} strokeWidth={2.2} /> : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={hitSlopFor(height)}
      style={(state: PressState) => [
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: variant === 'quiet' ? 6 : size === 'sm' ? 13 : size === 'lg' ? 24 : 18,
        },
        variant === 'primary' && {
          backgroundColor: state.hovered && !inactive ? color.inkHover : color.ink,
        },
        variant === 'secondary' && {
          borderColor: state.hovered && !inactive ? color.ink : color.line2,
          backgroundColor: state.hovered && !inactive ? color.surface : 'transparent',
        },
        variant === 'quiet' && state.hovered && !inactive && { backgroundColor: color.lane },
        full && styles.full,
        disabled && !busy && styles.disabled,
        state.pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.inner}>
          {!iconRight && iconNode}
          <Text
            variant="label"
            color={fg}
            style={size === 'sm' ? styles.smText : size === 'lg' ? styles.lgText : undefined}
            numberOfLines={1}
          >
            {title}
          </Text>
          {iconRight && iconNode}
        </View>
      )}
    </Pressable>
  );
}

/** A round icon-only button. Always has an accessible label. */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  variant = 'plain',
  size = 40,
  iconSize = 19,
  disabled,
  children,
  ...rest
}: {
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  variant?: 'plain' | 'ink' | 'outline';
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  children?: ReactNode;
} & Omit<PressableProps, 'onPress' | 'children' | 'style'>) {
  const fg = variant === 'ink' ? color.onInk : color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlopFor(size)}
      {...rest}
      style={(state: PressState) => [
        styles.icon,
        { width: size, height: size },
        variant === 'ink' && {
          backgroundColor: state.hovered ? color.inkHover : color.ink,
        },
        variant === 'outline' && {
          borderWidth: 1.5,
          borderColor: state.hovered ? color.ink : color.line2,
          backgroundColor: color.surface,
        },
        variant === 'plain' && state.hovered && { backgroundColor: color.lane },
        disabled && styles.disabled,
        state.pressed && styles.pressed,
      ]}
    >
      {children ?? (Icon ? <Icon size={iconSize} color={fg} strokeWidth={2} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    cursor: 'pointer',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  full: { alignSelf: 'stretch' },
  smText: { fontSize: 13, lineHeight: 16 },
  lgText: { fontSize: 15.5, lineHeight: 20 },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }] },
  icon: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
});
