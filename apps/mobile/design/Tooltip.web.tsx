import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, radius, shadow } from './tokens';
import type { TipAnchor, TipProps } from './Tooltip';

interface TipState {
  text: string;
  anchor: TipAnchor;
  /** Shown by a press (a touch screen): stays a moment, then goes on its own. */
  pinned: boolean;
}

const WIDTH = 260;
const SHOWN_MS = 3200;

/** The element the pointer is on (hover) or the press landed on, in viewport coordinates. */
function anchorOf(e: unknown): TipAnchor | null {
  const ev = e as {
    currentTarget?: unknown;
    nativeEvent?: { target?: unknown; clientX?: number; clientY?: number };
  };
  for (const el of [ev.currentTarget, ev.nativeEvent?.target]) {
    if (el && typeof (el as HTMLElement).getBoundingClientRect === 'function') {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0) return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
    }
  }
  const n = ev.nativeEvent;
  if (typeof n?.clientX === 'number' && typeof n.clientY === 'number')
    return { x: n.clientX, top: n.clientY - 12, bottom: n.clientY + 12 };
  return null;
}

/**
 * Full text for short labels (a chip on the week board): on hover with a mouse, on a long press
 * or a tap on a touch screen. Drawn in a portal on the page itself so no transform or overflow
 * of the board clips it; it never takes focus or blocks the pointer.
 */
export function useTip(): {
  tipProps: (text: string) => TipProps;
  showTip: (text: string, e: unknown) => void;
  tipLayer: ReactNode;
} {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width, height } = useWindowDimensions();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // Scrolling moves the chip away from the tip: hide it.
  useEffect(() => {
    if (!tip || typeof window === 'undefined') return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);

  const showTip = useCallback((text: string, e: unknown) => {
    const anchor = anchorOf(e);
    if (!anchor) return;
    setTip({ text, anchor, pinned: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(null), SHOWN_MS);
  }, []);

  const tipProps = useCallback(
    (text: string): TipProps => ({
      onHoverIn: (e) => {
        const anchor = anchorOf(e);
        if (anchor) setTip({ text, anchor, pinned: false });
      },
      onHoverOut: () => setTip((t) => (t && !t.pinned ? null : t)),
      onLongPress: (e) => showTip(text, e),
    }),
    [showTip],
  );

  if (!tip || typeof document === 'undefined') return { tipProps, showTip, tipLayer: null };
  const left = Math.min(Math.max(8, tip.anchor.x - WIDTH / 2), width - WIDTH - 8);
  const below = tip.anchor.bottom + 80 < height;
  const place = {
    position: 'fixed',
    left,
    ...(below ? { top: tip.anchor.bottom + 6 } : { bottom: height - tip.anchor.top + 6 }),
  } as unknown as ViewStyle;
  const tipLayer = createPortal(
    <View pointerEvents="none" style={[styles.place, place]}>
      <View style={styles.tip} accessibilityRole="none">
        <Text variant="meta" color={color.onInk}>
          {tip.text}
        </Text>
      </View>
    </View>,
    document.body,
  );
  return { tipProps, showTip, tipLayer };
}

const styles = StyleSheet.create({
  place: { width: WIDTH, alignItems: 'center', zIndex: 1000 },
  tip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: color.ink,
    boxShadow: shadow.toast,
  },
});
