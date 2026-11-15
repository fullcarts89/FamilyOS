import { router, usePathname } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHousehold } from '../lib/household';
import { usePeople } from '../lib/people';
import { AvatarStack } from './Avatar';
import type { PressState } from './Button';
import { Mark } from './Mark';
import { Text } from './Text';
import { NAV, isActive } from './TopBar';
import { color, radius, shadow } from './tokens';

/** Phone header: the household, and its people (which open Household). */
export function PhoneHeader() {
  const { household } = useHousehold();
  const people = usePeople();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${household?.name ?? 'Household'}, today`}
        onPress={() => router.navigate('/')}
        style={styles.brand}
      >
        <Mark size={24} colors={people.all.map((p) => p.color)} />
        <Text variant="h3" numberOfLines={1} style={styles.brandText}>
          {household?.name ?? 'FamilyOS'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Household"
        onPress={() => router.navigate('/household')}
        style={(s: PressState) => [styles.people, s.pressed && { opacity: 0.7 }]}
      >
        <AvatarStack people={people.all.slice(0, 4)} size={30} />
      </Pressable>
    </View>
  );
}

/** Phone: Today, Week, Tasks and Reset at thumb's reach. */
export function BottomBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      aria-label="Main"
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      {NAV.slice(0, 4).map((item) => {
        const on = isActive(item, pathname);
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(item.href)}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text variant="label" color={on ? color.onInk : color.muted} style={styles.tabText}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The floating capture button on phones. */
export function CaptureFab({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Capture something"
      onPress={onPress}
      style={(s: PressState) => [
        styles.fab,
        { bottom: Math.max(insets.bottom, 10) + 70 },
        s.pressed && { transform: [{ scale: 0.94 }] },
      ]}
    >
      <Plus size={26} strokeWidth={2.4} color={color.onInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: color.ground,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, flexShrink: 1 },
  brandText: { fontSize: 19 },
  people: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  bar: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: color.ground,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: color.ink },
  tabText: { fontSize: 14.5 },
  fab: {
    position: 'absolute',
    right: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.fab,
    zIndex: 30,
  },
});
