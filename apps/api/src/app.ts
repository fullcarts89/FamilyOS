import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

export function createApp() {
  const app = new Hono();

  app.use('*', requestId());
  app.use('*', secureHeaders());

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  // Errors return an opaque reference; details (which may include household data) stay server-side.
  app.onError((error, c) => {
    console.error(`request ${c.get('requestId')} failed: ${error.name}`);
    return c.json({ error: 'internal_error', requestId: c.get('requestId') }, 500);
  });

  return app;
}
