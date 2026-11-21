import { router, usePathname } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHousehold } from '../lib/household';
import { usePeople } from '../lib/people';
import { AvatarStack } from './Avatar';
import type { PressState } from './Button';
import { Mark } from './Mark';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { bottomBar, fab, fabBottom } from './chrome';
import { NAV, isActive, moreFor, moreLabel, type NavItem } from './TopBar';
import { color, radius, shadow } from './tokens';

/** Phone header: the household, and its people (which open Household). */
export function PhoneHeader() {
  const { household } = useHousehold();
  const people = usePeople();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]} role="banner">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${household?.name ?? 'Household'}, today`}
        onPress={() => router.navigate('/')}
        style={styles.brand}
      >
        <Mark size={24} colors={people.all.map((p) => p.color)} />
        <Text variant="h3" numberOfLines={1} style={styles.brandText} maxFontSizeMultiplier={1.4}>
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

/**
 * Phone: Today, Week, Tasks and the Weekly Reset at thumb's reach (plain links, the current one
 * marked); everything else under More, a button that opens a sheet.
 */
export function BottomBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { household } = useHousehold();
  const [more, setMore] = useState(false);
  const extra: NavItem[] = [
    { label: 'Household', href: '/household', match: ['/household'], hint: 'People, pets, calendars' },
    ...moreFor(household?.role),
  ];
  const moreOn = extra.some((m) => isActive(m, pathname));
  return (
    <View
      role="navigation"
      aria-label="Main"
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, bottomBar.pad) }]}
    >
      {NAV.slice(0, 4).map((item) => {
        const on = isActive(item, pathname);
        return (
          <Pressable
            key={item.label}
            accessibilityRole="link"
            accessibilityLabel={item.label}
            aria-current={on ? 'page' : undefined}
            {...nativeSelected(on)}
            onPress={() => router.navigate(item.href)}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text
              variant="label"
              color={on ? color.onInk : color.muted}
              style={styles.tabText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {item.short ?? item.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel(extra)}
        aria-haspopup="dialog"
        aria-expanded={more}
        onPress={() => setMore(true)}
        style={[styles.tab, moreOn && styles.tabOn]}
      >
        <Text
          variant="label"
          color={moreOn ? color.onInk : color.muted}
          style={styles.tabText}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          More
        </Text>
      </Pressable>
      <Sheet visible={more} onClose={() => setMore(false)} label="More" title="More">
        <View style={styles.menu}>
          {extra.map((item) => {
            const on = isActive(item, pathname);
            return (
              <Pressable
                key={item.label}
                accessibilityRole="link"
                onPress={() => {
                  setMore(false);
                  router.navigate(item.href);
                }}
                style={(s: PressState) => [styles.menuItem, (on || s.pressed) && styles.menuOn]}
              >
                <View style={styles.menuText}>
                  <Text variant="title">{item.label}</Text>
                  {item.hint ? (
                    <Text variant="small" tone="muted">
                      {item.hint}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={18} color={color.muted} strokeWidth={2.2} />
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

/**
 * iPhone and Android read "selected" from accessibilityState; the web uses aria-current or
 * aria-pressed instead (aria-selected is only allowed on tabs and options).
 */
export const nativeSelected = (on: boolean) =>
  Platform.OS === 'web' ? {} : { accessibilityState: { selected: on } };

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
        { bottom: fabBottom(insets.bottom) },
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
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: color.ink },
  tabText: { fontSize: 14 },
  menu: { gap: 2, paddingBottom: 8 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  menuOn: { backgroundColor: color.lane },
  menuText: { flex: 1, gap: 1 },
  fab: {
    position: 'absolute',
    right: 16,
    width: fab.size,
    height: fab.size,
    borderRadius: fab.size / 2,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.fab,
    zIndex: 30,
  },
});
