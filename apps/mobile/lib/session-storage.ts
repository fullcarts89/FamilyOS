import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { APP_GROUP, SESSION_STORAGE_KEY, SHARED_KEYCHAIN_SERVICE } from '../native/shared';
import { clearWidget } from '../native/widget';

/**
 * Session storage for Supabase Auth. On iOS and Android the session lives in the keychain or
 * keystore. SecureStore values should stay small, so long sessions are split into chunks.
 * On web the browser's localStorage is used (development only for now).
 */
const CHUNK = 1800;
const countKey = (key: string) => `${key}.chunks`;

const secure = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await secure.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(countKey(key), String(count));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

const web = {
  getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage?.removeItem(key),
};

/**
 * iPhone: one keychain item per key, in the App Group's access group, so the widget can read
 * the session and write back the tokens it refreshes (docs/operations/iphone.md). Readable
 * after the first unlock so Lock Screen widgets work; never synced or restored to another device.
 * No iPhone build has shipped before this, so there are no older sessions to move.
 */
const SHARED: SecureStore.SecureStoreOptions = {
  keychainService: SHARED_KEYCHAIN_SERVICE,
  accessGroup: APP_GROUP,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const ios = {
  getItem: (key: string) => SecureStore.getItemAsync(key, SHARED),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, SHARED),
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key, SHARED);
    // Signed out: the widget forgets the household too.
    if (key === SESSION_STORAGE_KEY) clearWidget();
  },
};

export const sessionStorage = Platform.OS === 'web' ? web : Platform.OS === 'ios' ? ios : secure;
