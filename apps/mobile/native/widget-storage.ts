import type { WidgetStorage } from './shared';

/**
 * The App Group store the iPhone widget reads. Only iOS has widgets: this file is the no-op
 * used on web and Android; widget-storage.ios.ts is the real one.
 */
export const widgetStorage: WidgetStorage = {
  available: false,
  set() {},
  get: () => null,
  remove() {},
  reload() {},
};
