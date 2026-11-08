import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';

describe('api app', () => {
  const app = createApp();

  it('reports health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('sets security headers and a request id', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('hides error details from the response', async () => {
    const failing = createApp();
    failing.get('/boom', () => {
      throw new Error('household secret in message');
    });
    const res = await failing.request('/boom');
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('household secret');
    expect(body).toContain('internal_error');
  });
});

describe('api config', () => {
  it('defaults the port and rejects invalid values without echoing them', () => {
    expect(loadConfig({}).API_PORT).toBe(8787);
    expect(() => loadConfig({ DATABASE_URL: 'not a url with secret' })).toThrow(
      /Invalid API configuration: DATABASE_URL$/,
    );
  });
});
