import { WIDGET_KEYS } from './shared';
import type { WidgetSnapshot } from './widget-snapshot';
import { widgetStorage } from './widget-storage';

/**
 * What the widget needs to call FamilyOS itself (complete an item, refresh its snapshot).
 * Only public values: the session stays in the shared keychain item, never in here.
 */
export interface WidgetConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  householdId: string;
  memberId: string;
}

/** True where widgets exist (the iPhone app); everything below is a no-op elsewhere. */
export const widgetsAvailable = widgetStorage.available;

export function publishWidgetConfig(config: WidgetConfig): void {
  widgetStorage.set(WIDGET_KEYS.config, JSON.stringify(config));
}

/** Saves the snapshot to the App Group and asks WidgetKit to redraw. */
export function publishWidgetSnapshot(snapshot: WidgetSnapshot): void {
  widgetStorage.set(WIDGET_KEYS.snapshot, JSON.stringify(snapshot));
  widgetStorage.reload();
}

/** On sign-out: the widget forgets the household and asks to sign in. */
export function clearWidget(): void {
  widgetStorage.remove(WIDGET_KEYS.snapshot);
  widgetStorage.remove(WIDGET_KEYS.config);
  widgetStorage.reload();
}

/** Whether Lock Screen widgets may show household content (titles, names). On by default. */
export function widgetLockScreenVisible(): boolean {
  return widgetStorage.get(WIDGET_KEYS.lockScreen) !== 'off';
}

export function setWidgetLockScreenVisible(visible: boolean): void {
  widgetStorage.set(WIDGET_KEYS.lockScreen, visible ? 'on' : 'off');
  widgetStorage.reload();
}
