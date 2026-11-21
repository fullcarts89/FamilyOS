import { ExtensionStorage } from '@bacons/apple-targets';
import { APP_GROUP, WIDGET_KIND, type WidgetStorage } from './shared';

const store = new ExtensionStorage(APP_GROUP);

/** The App Group's UserDefaults, through @bacons/apple-targets' small native module. */
export const widgetStorage: WidgetStorage = {
  available: true,
  set(key, value) {
    store.set(key, value);
  },
  get(key) {
    return store.get(key);
  },
  remove(key) {
    store.remove(key);
  },
  reload() {
    ExtensionStorage.reloadWidget(WIDGET_KIND);
  },
};
