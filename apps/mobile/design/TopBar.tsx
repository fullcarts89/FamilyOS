import { router, usePathname, type Href } from 'expo-router';
import { ChevronDown, Plus } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useHousehold } from '../lib/household';
import { usePeople } from '../lib/people';
import { Avatar } from './Avatar';
import { type PressState } from './Button';
import { useLayout } from './layout';
import { Mark } from './Mark';
import { Text } from './Text';
import { color, radius, shadow } from './tokens';

export interface NavItem {
  label: string;
  href: Href;
  /** Path prefixes that also count as this section. */
  match: string[];
  /** A short line under the label in the More menu. */
  hint?: string;
  /** Owners and adults only (caregivers don't see it). */
  adultsOnly?: boolean;
}

export const NAV: NavItem[] = [
  { label: 'Today', href: '/', match: ['/', '/inbox'] },
  { label: 'Week', href: '/week', match: ['/week'] },
  { label: 'Tasks', href: '/tasks', match: ['/tasks', '/item', '/routine', '/work', '/routines'] },
  { label: 'Reset', href: '/reset', match: ['/reset'] },
  { label: 'Household', href: '/household', match: ['/household'] },
];

export const MORE: NavItem[] = [
  {
    label: 'Meals & groceries',
    href: '/meals',
    match: ['/meals'],
    hint: 'Dinners and the shared list',
  },
  {
    label: 'Decisions',
    href: '/decisions',
    match: ['/decisions'],
    hint: 'Vote and decide together',
    adultsOnly: true,
  },
  { label: 'Contacts', href: '/contacts', match: ['/contacts'], hint: 'Who to call' },
  {
    label: 'Budgets',
    href: '/budgets',
    match: ['/budgets'],
    hint: 'This month, from Monarch',
    adultsOnly: true,
  },
];

/** The More items this person can open. */
export const moreFor = (role: string | undefined) =>
  MORE.filter((m) => !m.adultsOnly || role !== 'caregiver');

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)));
}

/** Desktop and tablet: household mark and people, centered navigation, and the capture button. */
export function TopBar({ onCapture }: { onCapture: () => void }) {
  const pathname = usePathname();
  const { household } = useHousehold();
  const people = usePeople();
  const { desktop } = useLayout();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const moreActive = MORE.some((m) => isActive(m, pathname));
  const shown = people.all.filter((p) => p.role !== 'caregiver').slice(0, 4);

  const openMenu = () => {
    moreRef.current?.measureInWindow((x, y, w, h) => setMenu({ x: x + w, y: y + h + 8 }));
  };

  return (
    <View style={styles.bar} accessibilityRole="toolbar">
      <View style={styles.left}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${household?.name ?? 'Household'}, today`}
          onPress={() => router.navigate('/')}
          style={(s: PressState) => [styles.brand, s.hovered && styles.hover]}
        >
          <Mark colors={people.all.map((p) => p.color)} />
          <Text variant="h3" style={styles.brandText} numberOfLines={1}>
            {household?.name ?? 'FamilyOS'}
          </Text>
        </Pressable>
        {desktop && shown.length > 0 ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Household: ${shown.map((p) => p.name).join(', ')}`}
            onPress={() => router.navigate('/household')}
            style={(s: PressState) => [
              styles.people,
              shown.length > 3 && styles.peopleTight,
              s.hovered && styles.hover,
            ]}
          >
            {shown.map((p) => (
              <View key={p.id} style={styles.person}>
                <Avatar person={p} size={30} />
                {shown.length <= 3 ? (
                  <Text variant="label" style={styles.personName} numberOfLines={1}>
                    {p.name.split(' ')[0]}
                  </Text>
                ) : null}
              </View>
            ))}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.nav} accessibilityRole="menubar" aria-label="Main">
        {NAV.map((item) => {
          const on = isActive(item, pathname);
          return (
            <Pressable
              key={item.label}
              accessibilityRole="link"
              aria-current={on ? 'page' : undefined}
              onPress={() => router.navigate(item.href)}
              style={(s: PressState) => [
                styles.navItem,
                on && styles.navOn,
                !on && s.hovered && styles.navHover,
              ]}
            >
              <Text variant="label" tone={on ? 'ink' : 'muted'}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.navDivider} />
        <View ref={moreRef} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More: meals, decisions, contacts and budgets"
            aria-expanded={!!menu}
            onPress={openMenu}
            style={(s: PressState) => [
              styles.navItem,
              moreActive && styles.navOn,
              !moreActive && s.hovered && styles.navHover,
            ]}
          >
            <Text variant="label" tone={moreActive ? 'ink' : 'muted'}>
              More
            </Text>
            <ChevronDown size={14} strokeWidth={2.4} color={moreActive ? color.ink : color.muted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.right}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture something (N)"
          onPress={onCapture}
          style={(s: PressState) => [
            styles.capture,
            s.hovered && { backgroundColor: color.inkHover },
            s.pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Plus size={18} strokeWidth={2.4} color={color.onInk} />
          <Text variant="label" color={color.onInk}>
            Capture
          </Text>
          {desktop ? (
            <View style={styles.kbd}>
              <Text variant="small" color={color.onInk} style={styles.kbdText}>
                N
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Modal visible={!!menu} transparent animationType="none" onRequestClose={() => setMenu(null)}>
        <Pressable
          accessibilityLabel="Close menu"
          style={StyleSheet.absoluteFill}
          onPress={() => setMenu(null)}
        />
        {menu ? (
          <View
            role="menu"
            style={[styles.menu, { top: menu.y, left: Math.max(12, menu.x - 240) }]}
          >
            {moreFor(household?.role).map((item) => (
              <Pressable
                key={item.label}
                role="menuitem"
                onPress={() => {
                  setMenu(null);
                  router.navigate(item.href);
                }}
                style={(s: PressState) => [
                  styles.menuItem,
                  (s.hovered || isActive(item, pathname)) && styles.menuHover,
                ]}
              >
                <Text variant="label">{item.label}</Text>
                {item.hint ? (
                  <Text variant="small" tone="muted">
                    {item.hint}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
    backgroundColor: color.ground,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    zIndex: 10,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: radius.pill,
    flexShrink: 1,
    cursor: 'pointer',
  },
  brandText: { fontSize: 20, lineHeight: 24 },
  hover: { backgroundColor: color.lane },
  people: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 10,
    minHeight: 44,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
    borderRadius: radius.pill,
    cursor: 'pointer',
  },
  peopleTight: { gap: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  personName: { fontSize: 13.5 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: color.lane,
  },
  navItem: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
  },
  navOn: { backgroundColor: color.surface, boxShadow: shadow.raised },
  navHover: { backgroundColor: 'rgba(255,255,255,0.55)' },
  navDivider: { width: 1, height: 22, backgroundColor: color.line2, marginHorizontal: 4 },
  right: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  capture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    cursor: 'pointer',
  },
  kbd: {
    marginLeft: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  kbdText: { fontSize: 11 },
  menu: {
    position: 'absolute',
    width: 240,
    padding: 6,
    borderRadius: 14,
    backgroundColor: color.surface,
    boxShadow: shadow.menu,
  },
  menuItem: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    justifyContent: 'center',
    gap: 1,
    cursor: 'pointer',
  },
  menuHover: { backgroundColor: color.lane },
});
