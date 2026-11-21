/**
 * Names the app and the iPhone widget agree on. The Swift side is
 * apps/mobile/targets/widget/Shared.swift; change both together.
 */

/** The App Group: a shared container for the widget snapshot, and on iOS a keychain access group. */
export const APP_GROUP = 'group.app.familyos.household';

/** WidgetKit kind of the "Today" widget, for reloads. */
export const WIDGET_KIND = 'FamilyOSToday';

/** Keys in the App Group's UserDefaults. */
export const WIDGET_KEYS = {
  config: 'familyos.widget.config',
  snapshot: 'familyos.widget.snapshot',
  /** "off" hides household content from Lock Screen widgets; anything else shows it. */
  lockScreen: 'familyos.widget.lockScreen',
} as const;

/**
 * The Supabase session's storage key on iOS. It is one keychain item, shared with the widget
 * through the App Group, which refreshes the session and writes the rotated tokens back to it.
 */
export const SESSION_STORAGE_KEY = 'familyos.session';

/** expo-secure-store service for shared items (the store appends ":no-auth"). */
export const SHARED_KEYCHAIN_SERVICE = 'familyos';

/** The App Group's UserDefaults as the app sees them (native/widget-storage*.ts). */
export interface WidgetStorage {
  /** False where there are no widgets (web, Android). */
  available: boolean;
  set(key: string, value: string): void;
  get(key: string): string | null;
  remove(key: string): void;
  /** Asks WidgetKit to rebuild the widget's timeline from the new data. */
  reload(): void;
}
