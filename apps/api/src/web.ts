import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Env } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

export interface WebOptions {
  /** Directory holding the Expo web export (`expo export --platform web`). */
  root: string;
  /** Supabase project URL: the only other origin the web app talks to (sign-in). */
  supabaseUrl: string;
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
