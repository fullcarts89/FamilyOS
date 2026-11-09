import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@familyos/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workerStatus } from './app';
import { createTestApp } from './testing/harness';
import { createServer } from './web';

// The deployed server (plan M4): API under /api, the web export everywhere else.
describe('web server', () => {
  let root: string;
  const bundle = '/_expo/static/js/web/entry-abc123.js';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'familyos-web-'));
    await mkdir(join(root, '_expo/static/js/web'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html><title>FamilyOS</title>');
    await writeFile(join(root, bundle.slice(1)), 'console.log(1)');
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  const server = () =>
    createServer(createTestApp().app, { root, supabaseUrl: 'https://abc.supabase.co/' });

  it('routes /api to the API, with its own headers and errors', async () => {
    const res = await server().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: 'dev' });
    expect((await server().request('/api/me')).status).toBe(401);
    expect((await server().request('/api/nope')).status).toBe(401);
  });

  it('serves the app shell for app routes, with a strict content security policy', async () => {
    for (const path of ['/', '/item/123', '/routines', '/invite?token=abc']) {
      const res = await server().request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<title>FamilyOS</title>');
      expect(res.headers.get('cache-control')).toBe('no-cache');
    }
    const csp = (await server().request('/')).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('caches hashed bundles forever and 404s missing files instead of returning HTML', async () => {
    const res = await server().request(bundle);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await server().request('/_expo/static/js/web/missing.js')).status).toBe(404);
    expect((await server().request('/favicon.ico')).status).toBe(404);
  });

  it('never serves files outside the export directory', async () => {
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json']) {
      const res = await server().request(path);
      expect(await res.text()).not.toContain('"name"');
    }
  });

  it('serves the API alone when there is no web export (local development)', async () => {
    const apiOnly = createServer(createTestApp().app);
    expect((await apiOnly.request('/api/health')).status).toBe(200);
    expect((await apiOnly.request('/')).status).toBe(404);
  });
});

describe('readiness', () => {
  it('reports 503 without details when the database is unreachable', async () => {
    const { request, logs } = createTestApp();
    const res = await request('/health/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'unavailable',
      database: 'unavailable',
      version: 'dev',
    });
    expect(logs.join('\n')).toContain('readiness_failed');
    expect(logs.join('\n')).not.toContain('127.0.0.1');
  });

  it('calls the worker stale after three missed heartbeats', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    expect(workerStatus(null, now)).toBe('never_seen');
    expect(workerStatus(new Date('2026-11-08T11:40:00Z'), now)).toBe('ok');
    expect(workerStatus(new Date('2026-11-08T11:29:00Z'), now)).toBe('stale');
  });
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('readiness with the database', () => {
  it('is ready when the database answers through the request role', async () => {
    const db = createDb({ connectionString: url ?? '', maxConnections: 1 });
    try {
      const res = await createTestApp({ db }).request('/health/ready');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { database: string; worker: string };
      expect(body.database).toBe('ok');
      expect(['ok', 'stale', 'never_seen']).toContain(body.worker);
    } finally {
      await db.destroy();
    }
  });
});
