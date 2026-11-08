import { Platform } from 'react-native';

/** Public, build-time configuration. Only publishable values belong here: they ship in the app. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}; copy .env.example to .env and fill it in`);
  return value;
}

export const config = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  apiUrl: apiUrl(required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL)),
};

/** The web build may use a same-origin path such as /api; the iPhone app needs a full URL. */
function apiUrl(value: string): string {
  if (Platform.OS !== 'web' && value.startsWith('/')) {
    throw new Error('EXPO_PUBLIC_API_URL must be a full https:// URL in the iPhone app');
  }
  return value;
}
