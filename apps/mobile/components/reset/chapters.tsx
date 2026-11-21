import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { IconButton, type PressState } from '../../design/Button';
import { nativeDriver, useReducedMotion } from '../../design/layout';
import { Text } from '../../design/Text';
import { color, radius, shadow } from '../../design/tokens';
import type { RowKind } from './WeekBoard';

export type ChapterKey = 'look' | 'loose' | 'decide' | 'cover' | 'dinners' | 'plan';

export interface Chapter {
  key: ChapterKey;
  title: string;
  /** The lanes of the board this chapter changes. */
  focus: RowKind[] | 'all';
}

/** The chapters after the opening, in order. */
export function chaptersFor(careName: string | null): Chapter[] {
  return [
    { key: 'look', title: 'Look back', focus: 'all' },
    { key: 'loose', title: 'Loose ends', focus: ['adults'] },
    { key: 'decide', title: 'Decide together', focus: ['adults', 'together'] },
    { key: 'cover', title: careName ? `Cover ${careName}` : 'Cover the handoffs', focus: ['care'] },
    { key: 'dinners', title: 'Dinners', focus: ['dinners'] },
    { key: 'plan', title: 'Our plan', focus: 'all' },
  ];
}

export interface StepState {
  /** "2 open", or null. */
  badge: string | null;
  done: boolean;
}

/** Desktop and tablet: the chapters as a row of steps, each a tap away, with what's left in each. */
export function ChapterSteps({
  chapters,
  current,
  states,
  onGo,
}: {
  chapters: Chapter[];
  current: number;
  states: StepState[];
  onGo: (i: number) => void;
}) {
  return (
    <View style={styles.steps} accessibilityRole="tablist" aria-label="Chapters">
      {chapters.map((c, i) => {
        const on = i === current;
        const s = states[i];
        const past = i < current;
        return (
          <Pressable
            key={c.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={`Chapter ${i + 1}: ${c.title}${s?.badge ? `, ${s.badge}` : s?.done ? ', done' : ''}`}
            onPress={() => onGo(i)}
            style={(st: PressState) => [
              styles.step,
              on && styles.stepOn,
              !on && st.hovered && styles.stepHover,
            ]}
          >
            <View
              style={[
                styles.n,
                past && styles.nPast,
                s?.done && !on && styles.nDone,
                on && styles.nOn,
              ]}
            >
              {s?.done && !on ? (
                <Check size={12} strokeWidth={3.2} color={color.onInk} />
              ) : (
                <Text variant="small" color={on ? color.onInk : color.muted} style={styles.nText}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text variant="label" tone={on ? 'ink' : 'muted'} numberOfLines={1}>
              {c.title}
            </Text>
            {s?.badge ? (
              // On a white pill, the muted text reads at 6:1 (5.1:1 on the lane around it).
              <View style={styles.badge}>
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {s.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Phones: a segmented progress line and where you are. */
export function PhoneProgress({
  count,
  current,
  title,
}: {
  count: number;
  current: number;
  title: string;
}) {
  return (
    <View
      style={styles.progress}
      accessibilityLabel={`Chapter ${current + 1} of ${count}: ${title}`}
    >
      <View style={styles.segments}>
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i < current && styles.segmentDone,
              i === current && styles.segmentOn,
            ]}
          />
        ))}
      </View>
      <Text variant="small" tone="muted">
        {current + 1} of {count} · <Text variant="small">{title}</Text>
      </Text>
    </View>
  );
}

/** Phones: back and next at thumb's reach, left of the capture button. */
export function PhoneChapterBar({
  label,
  sub,
  onBack,
  onNext,
  nextLabel,
  onCapture,
}: {
  label: string;
  sub: string;
  onBack: (() => void) | null;
  onNext: (() => void) | null;
  nextLabel: string;
  /** Quick capture lives in the bar here, in place of the floating button. */
  onCapture: () => void;
}) {
  // Docked under the chapter, above the tab bar: it takes its own room, so it never sits on top
  // of the chapter's content.
  return (
    <View style={styles.dock}>
      <View style={styles.bar}>
        <IconButton
          icon={ArrowLeft}
          label="Previous chapter"
          variant="outline"
          size={44}
          disabled={!onBack}
          onPress={() => onBack?.()}
        />
        <View style={styles.barText}>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {sub}
          </Text>
          <Text variant="label" numberOfLines={1}>
            {label}
          </Text>
        </View>
        <IconButton
          icon={Plus}
          label="Capture something"
          variant="outline"
          size={44}
          onPress={onCapture}
        />
        <IconButton
          icon={ArrowRight}
          label={nextLabel}
          variant="ink"
          size={44}
          disabled={!onNext}
          onPress={() => onNext?.()}
        />
      </View>
    </View>
  );
}

/**
 * Moving between chapters: the new one fades in, sliding a little from the side you're heading
 * (forward from the right). Reduced motion: a plain, quick fade.
 */
export function ChapterTransition({
  children,
  direction,
}: {
  children: ReactNode;
  direction: 1 | -1;
}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: reduced ? 120 : 260,
      useNativeDriver: nativeDriver,
    }).start();
  }, [v, reduced]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: reduced
          ? []
          : [
              {
                translateX: v.interpolate({ inputRange: [0, 1], outputRange: [18 * direction, 0] }),
              },
            ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  steps: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: color.lane,
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    cursor: 'pointer',
  },
  stepOn: { backgroundColor: color.surface, boxShadow: shadow.raised },
  stepHover: { backgroundColor: 'rgba(255,255,255,0.55)' },
  n: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nOn: { backgroundColor: color.ink, borderColor: color.ink },
  nDone: { backgroundColor: color.muted, borderColor: color.muted },
  nPast: { borderColor: color.muted },
  nText: { fontSize: 12 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  progress: { gap: 6 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.line2 },
  segmentDone: { backgroundColor: color.muted },
  segmentOn: { backgroundColor: color.ink },
  dock: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: color.ground,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  bar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 29,
    backgroundColor: color.surface,
    boxShadow: shadow.card,
  },
  barText: { flex: 1, minWidth: 0, alignItems: 'center' },
});
