import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
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

/**
 * Extra hit area so small-looking controls still meet the 44pt minimum, the same on every side
 * (pass the width too when the control is narrower than it is tall).
 */
export const hitSlopFor = (height: number, width = height) => {
  const v = Math.max(0, Math.ceil((touch - height) / 2));
  const h = Math.max(0, Math.ceil((touch - width) / 2));
  return { top: v, bottom: v, left: h, right: h };
};

/**
 * The web has no hitSlop: this invisible layer, the first child of a small control, reaches past
 * its edges by the same amounts, so a tap or click there still lands on the control.
 */
export function HitArea({
  slop,
  border = 0,
}: {
  slop: { top: number; bottom: number; left: number; right: number };
  /** The control's border width: the layer is placed inside it, so it reaches that much further. */
  border?: number;
}) {
  if (Platform.OS !== 'web' || (!slop.top && !slop.bottom && !slop.left && !slop.right))
    return null;
  const b = Math.ceil(border);
  return (
    <View
      aria-hidden
      style={{
        position: 'absolute',
        top: -(slop.top && slop.top + b),
        bottom: -(slop.bottom && slop.bottom + b),
        left: -(slop.left && slop.left + b),
        right: -(slop.right && slop.right + b),
      }}
    />
  );
}

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
  const slop = hitSlopFor(height, touch);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: !!busy }}
      aria-disabled={inactive}
      aria-busy={!!busy}
      disabled={inactive}
      onPress={onPress}
      hitSlop={slop}
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
      <HitArea slop={slop} border={1.5} />
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.inner}>
          {!iconRight && iconNode}
          <Text
            variant="label"
            color={fg}
            style={[
              styles.title,
              size === 'sm' ? styles.smText : size === 'lg' ? styles.lgText : undefined,
            ]}
            numberOfLines={2}
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
      aria-disabled={!!disabled}
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
      <HitArea slop={hitSlopFor(size)} />
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
  inner: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  /** Large text wraps to a second line rather than being cut off. */
  title: { flexShrink: 1, textAlign: 'center' },
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
