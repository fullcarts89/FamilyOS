import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { color, radius, shadow } from './tokens';

/** Where a tip points: the middle of the thing it's about, and its top and bottom edges. */
export interface TipAnchor {
  x: number;
  top: number;
  bottom: number;
}

interface TipState {
  text: string;
  anchor: TipAnchor;
}

/** What a pressable chip spreads on itself to show its full text on hover or long press. */
export interface TipProps {
  onHoverIn?: (e: unknown) => void;
  onHoverOut?: () => void;
  onLongPress?: (e: unknown) => void;
}

const WIDTH = 260;
const SHOWN_MS = 3200;

function anchorOf(e: unknown): TipAnchor | null {
  const n = (e as { nativeEvent?: { pageX?: number; pageY?: number } }).nativeEvent;
  if (typeof n?.pageX !== 'number' || typeof n.pageY !== 'number') return null;
  return { x: n.pageX, top: n.pageY - 24, bottom: n.pageY + 24 };
}

/**
 * Full text for short labels (a chip on the week board): on a phone, press and hold the chip,
 * or tap one that does nothing else. The tip floats above everything and goes on its own.
 * The web version (Tooltip.web.tsx) also shows it on hover.
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

  const showTip = useCallback((text: string, e: unknown) => {
    const anchor = anchorOf(e);
    if (!anchor) return;
    setTip({ text, anchor });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(null), SHOWN_MS);
  }, []);

  const tipProps = useCallback(
    (text: string): TipProps => ({ onLongPress: (e) => showTip(text, e) }),
    [showTip],
  );

  const left = tip ? Math.min(Math.max(8, tip.anchor.x - WIDTH / 2), width - WIDTH - 8) : 0;
  const below = tip ? tip.anchor.bottom + 80 < height : true;
  const tipLayer = tip ? (
    <Modal transparent visible animationType="fade" onRequestClose={() => setTip(null)}>
      <Pressable
        accessibilityLabel="Close"
        style={StyleSheet.absoluteFill}
        onPress={() => setTip(null)}
      />
      <View
        pointerEvents="none"
        style={[
          styles.place,
          { left },
          below ? { top: tip.anchor.bottom + 6 } : { bottom: height - tip.anchor.top + 6 },
        ]}
      >
        <View style={styles.tip}>
          <Text variant="meta" color={color.onInk}>
            {tip.text}
          </Text>
        </View>
      </View>
    </Modal>
  ) : null;

  return { tipProps, showTip, tipLayer };
}

const styles = StyleSheet.create({
  place: { position: 'absolute', width: WIDTH, alignItems: 'center' },
  tip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: color.ink,
    boxShadow: shadow.toast,
  },
});
