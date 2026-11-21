import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Screen reader announcements for confirmations (toasts, milestones). Each platform reads them
 * once: the web through the element's role="status" (a polite live region), Android through
 * `accessibilityLiveRegion` on the same element, and iPhone (where neither exists) through
 * VoiceOver's announcement queue, here.
 */
export function announce(parts: (string | undefined)[], extra?: string): void {
  if (Platform.OS !== 'ios') return;
  const text = [...parts, extra]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => p.trim().replace(/[.。]$/, ''))
    .join('. ');
  if (text) AccessibilityInfo.announceForAccessibility(`${text}.`);
}

/** Props that make a newly shown confirmation a polite live region on Android (none elsewhere). */
export const politeLiveRegion =
  Platform.OS === 'android' ? ({ accessibilityLiveRegion: 'polite' } as const) : {};

/**
 * Whether VoiceOver or TalkBack is on (native only: react-native-web always answers yes, so the
 * web treats it as off and relies on pausing while focused or hovered instead).
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}
