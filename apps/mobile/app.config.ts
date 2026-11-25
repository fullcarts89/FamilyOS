import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus the one setting that depends on the deploy: the web address whose password reset
 * links open in the iPhone app (a universal link). Set `APP_LINK_HOST` in the EAS `production`
 * environment to that bare host, the one in Supabase's Site URL (for example
 * `familyos.fullcarts.org`). Unset, the build has no associated domain and the links open in
 * Safari, which works too. Changing the address needs a new build.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const host = process.env.APP_LINK_HOST?.trim();
  if (host && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
    throw new Error('APP_LINK_HOST must be a bare host such as familyos.fullcarts.org');
  }
  return {
    ...config,
    name: config.name ?? 'FamilyOS',
    slug: config.slug ?? 'familyos',
    ios: {
      ...config.ios,
      ...(host && { associatedDomains: [`applinks:${host}`] }),
    },
  };
};
