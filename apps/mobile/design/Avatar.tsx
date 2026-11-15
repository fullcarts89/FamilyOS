import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Person } from '../lib/people';
import { Text } from './Text';
import { color, font } from './tokens';

/** A member's initial on their own color. Decorative: the name is always written nearby. */
export function Avatar({
  person,
  size = 28,
  ring,
  style,
}: {
  person: Pick<Person, 'initial' | 'color'> | null;
  size?: number;
  /** A ground-colored ring, for overlapping stacks. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!person) return <Either size={size} />;
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { width: size, height: size, backgroundColor: person.color },
        ring && { borderWidth: 2, borderColor: color.ground },
        style,
      ]}
    >
      <Text
        style={{ fontFamily: font.display, fontSize: size * 0.44, lineHeight: size * 0.6 }}
        color={color.onInk}
      >
        {person.initial}
      </Text>
    </View>
  );
}

/** Overlapping avatars for the household or a group. */
export function AvatarStack({ people, size = 28 }: { people: Person[]; size?: number }) {
  return (
    <View style={styles.stack} aria-hidden importantForAccessibility="no-hide-descendants">
      {people.map((p, i) => (
        <Avatar
          key={p.id}
          person={p}
          size={size}
          ring
          style={i > 0 ? { marginLeft: -size * 0.28 } : undefined}
        />
      ))}
    </View>
  );
}

/** "Either of you": two overlapping dots, one per adult. */
export function Either({ size = 28, colors }: { size?: number; colors?: [string, string] }) {
  const [a, b] = colors ?? ['#D2553F', '#2F6FB3'];
  const dot = size * 0.66;
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <View
        style={[
          styles.dot,
          { width: dot, height: dot, left: 0, top: 0, backgroundColor: a, borderRadius: dot },
        ]}
      />
      <View
        style={[
          styles.dot,
          { width: dot, height: dot, right: 0, bottom: 0, backgroundColor: b, borderRadius: dot },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  dot: { position: 'absolute', borderWidth: 2, borderColor: color.ground },
});
