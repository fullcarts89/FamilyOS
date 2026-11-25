import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Env } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

export interface WebOptions {
  /** Directory holding the Expo web export (`expo export --platform web`). */
  root: string;
  /** Supabase project URL: the only other origin the web app talks to (sign-in). */
  supabaseUrl: string;
  /**
   * Apple Developer Team ID. With it, iPhones with FamilyOS installed open password reset links
   * in the app (a universal link); without it, those links open in Safari, which works too.
   */
  appleTeamId?: string;
}

/** The iPhone app's bundle identifier (apps/mobile/app.json). */
export const IOS_BUNDLE_ID = 'app.familyos.household';

/** The app paths an iPhone opens in the app rather than in Safari: only the reset link for now. */
export const APP_LINK_PATHS = ['/reset-password'];

/** apple-app-site-association: which app may open which of this site's links. */
export function appSiteAssociation(appleTeamId: string) {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${appleTeamId}.${IOS_BUNDLE_ID}`],
          components: APP_LINK_PATHS.map((path) => ({ '/': path })),
        },
      ],
    },
  };
}

/** Hashed bundles never change at a given URL; everything else is revalidated. */
const IMMUTABLE_PREFIX = '/_expo/static/';

/**
 * The deployed server (plan M4): the API under /api and the web app on the same origin, so the
 * browser needs no CORS and session tokens never cross origins. Without `web` it serves the API
 * only, as in local development.
 */
export function createServer<E extends Env>(api: Hono<E>, web?: WebOptions): Hono {
  const server = new Hono();
  server.route('/api', api);
  if (!web) return server;

  const site = new Hono();
  site.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // react-native-web writes component styles into a <style> element at runtime.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", new URL(web.supabaseUrl).origin],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      referrerPolicy: 'no-referrer',
    }),
  );
  site.use('*', async (c, next) => {
    await next();
    c.header(
      'cache-control',
      c.req.path.startsWith(IMMUTABLE_PREFIX) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
  });
  // iOS fetches this (through Apple's CDN) to trust the app with the paths above. JSON, no
  // redirect, no file extension. Not found without a Team ID, so nothing claims a wrong app.
  site.get('/.well-known/apple-app-site-association', (c) =>
    web.appleTeamId ? c.json(appSiteAssociation(web.appleTeamId)) : c.text('Not found', 404),
  );
  site.get('*', serveStatic({ root: web.root }));
  // App routes such as /item/123 have no file of their own: the single-page app handles them.
  // Paths that look like files (a dot in the last segment) stay 404 rather than becoming HTML.
  site.get('*', async (c, next) => {
    if (/\.[^/]+$/.test(c.req.path)) return next();
    return serveStatic({ root: web.root, path: 'index.html' })(c, next);
  });
  site.notFound((c) => c.text('Not found', 404));

  server.route('/', site);
  return server;
}
