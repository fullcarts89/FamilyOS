import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useLayout } from '../../design/layout';
import { Text } from '../../design/Text';
import { em, font } from '../../design/tokens';
import { color } from '../../design/tokens';

/**
 * True once someone has moved between the Weekly Reset's chapters: each chapter's title then
 * takes the screen reader's (and the keyboard's) focus as it opens, so "Next" lands you on the
 * new chapter instead of somewhere in the old one.
 */
export const ChapterFocus = createContext(false);

/** A ref for a title that takes the focus when it mounts, while `ChapterFocus` says so. */
export function useChapterFocus<T>() {
  const focus = useContext(ChapterFocus);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!focus) return;
    const node = ref.current;
    if (!node) return;
    if (Platform.OS === 'web') {
      (node as unknown as { focus?: (o?: { preventScroll?: boolean }) => void }).focus?.({
        preventScroll: true,
      });
    } else {
      const tag = findNodeHandle(node as never);
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }
    // Once, as the chapter opens.
  }, []);
  return ref;
}

/** Focusable for the keyboard's programmatic focus on the web, out of the tab order. */
export const focusTarget = Platform.OS === 'web' ? ({ tabIndex: -1 } as object) : {};

/** A Weekly Reset chapter's opening: "Chapter 2 · Loose ends", a Fraunces question, one line. */
export function ChapterHead({
  kicker,
  title,
  lead,
  large,
}: {
  kicker: string;
  title: string;
  lead?: ReactNode;
  /** The reflective chapters (look back, the opening) get A's larger, slower type. */
  large?: boolean;
}) {
  const { phone } = useLayout();
  const ref = useChapterFocus<ComponentRef<typeof RNText>>();
  return (
    <View style={styles.head}>
      <Text variant="kicker" tone="muted">
        {kicker}
      </Text>
      <RNText
        ref={ref}
        accessibilityRole="header"
        {...focusTarget}
        style={[
          styles.title,
          large && styles.large,
          phone && styles.phone,
          phone && large && styles.phoneLarge,
        ]}
      >
        {title}
      </RNText>
      {lead ? (
        typeof lead === 'string' ? (
          <Text variant="lead" tone="muted" style={styles.lead}>
            {lead}
          </Text>
        ) : (
          lead
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8 },
  title: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: em(30, -0.012),
    color: color.ink,
  },
  large: { fontSize: 44, lineHeight: 50, letterSpacing: em(44, -0.015) },
  phone: { fontSize: 25, lineHeight: 31 },
  phoneLarge: { fontSize: 31, lineHeight: 37 },
  lead: { maxWidth: 640 },
});
