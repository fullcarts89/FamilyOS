import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchCalendarText, isPublicAddress, type FetchPolicy } from './fetch';

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

describe('which addresses are public', () => {
  it('blocks loopback, private, link-local, CGNAT, multicast and mapped forms', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.5',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '64:ff9b::a00:1',
      'not-an-ip',
    ]) {
      expect({ ip, public: isPublicAddress(ip) }).toEqual({ ip, public: false });
    }
    for (const ip of [
      '142.250.80.46',
      '17.253.144.10',
      '2607:f8b0:4005:80e::200e',
      '::ffff:8.8.8.8',
    ]) {
      expect({ ip, public: isPublicAddress(ip) }).toEqual({ ip, public: true });
    }
  });
});

describe('fetching a calendar', () => {
  let server: Server;
  let base: string;
  // Reaches only the local test server, over http; everything else follows the real rules.
  const local: FetchPolicy = {
    maxBytes: 64 * 1024,
    timeoutMs: 2000,
    maxRedirects: 3,
    allowHttp: true,
    allowAddress: (ip) => ip === '127.0.0.1',
  };
  const code = async (promise: Promise<unknown>) =>
    promise.then(
      () => 'ok',
      (error: { code?: string }) => error.code,
    );

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url ?? '';
      const hops = /^\/hop\/(\d+)$/.exec(path);
      if (path === '/ok') return void res.end(ICS);
      if (path === '/gzip') {
        res.setHeader('content-encoding', 'gzip');
        return void res.end(gzipSync(ICS));
      }
      if (path === '/missing') {
        res.statusCode = 404;
        return void res.end('Not here, secret detail');
      }
      if (path === '/big-declared') {
        res.setHeader('content-length', String(10 * 1024 * 1024));
        return void res.end();
      }
      if (path === '/big-streamed') {
        // No length: chunked until it's too much.
        const chunk = Buffer.alloc(16 * 1024, 'x');
        for (let i = 0; i < 8; i++) res.write(chunk);
        return void res.end();
      }
      if (path === '/zip-bomb') {
        res.setHeader('content-encoding', 'gzip');
        return void res.end(gzipSync(Buffer.alloc(1024 * 1024, 'x')));
      }
      if (path === '/slow') return; // never answers
      if (hops) {
        const n = Number(hops[1]);
        res.statusCode = 302;
        res.setHeader('location', n === 0 ? '/ok' : `/hop/${n - 1}`);
        return void res.end();
      }
      if (path === '/to-private') {
        res.statusCode = 301;
        res.setHeader('location', 'http://10.0.0.7/cal.ics');
        return void res.end();
      }
      if (path === '/to-metadata-name') {
        res.statusCode = 307;
        res.setHeader('location', 'http://metadata.internal.test/latest');
        return void res.end();
      }
      res.statusCode = 500;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('fetches text, gzip included', async () => {
    expect(await fetchCalendarText(new URL(`${base}/ok`), local)).toBe(ICS);
    expect(await fetchCalendarText(new URL(`${base}/gzip`), local)).toBe(ICS);
  });

  it('refuses http and private addresses under the real policy, before connecting', async () => {
    expect(await code(fetchCalendarText(new URL(`${base}/ok`)))).toBe('insecure_url');
    for (const url of [
      'https://127.0.0.1/cal.ics',
      'https://10.0.0.1/cal.ics',
      'https://[::1]/cal.ics',
      'https://169.254.169.254/latest/meta-data',
      'https://[::ffff:192.168.0.1]/cal.ics',
    ]) {
      expect({ url, code: await code(fetchCalendarText(new URL(url))) }).toEqual({
        url,
        code: 'blocked_address',
      });
    }
  });

  it('checks every DNS answer before connecting', async () => {
    const resolving = (...addresses: string[]): FetchPolicy => ({
      maxBytes: local.maxBytes,
      timeoutMs: local.timeoutMs,
      maxRedirects: local.maxRedirects,
      resolve: async () =>
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    });
    const url = new URL('https://calendar.example.test/cal.ics');
    expect(await code(fetchCalendarText(url, resolving('192.168.1.5')))).toBe('blocked_address');
    // One bad answer among good ones is enough to refuse.
    expect(await code(fetchCalendarText(url, resolving('142.250.80.46', '127.0.0.1')))).toBe(
      'blocked_address',
    );
    expect(await code(fetchCalendarText(url, resolving()))).toBe('dns_failed');
    const failing: FetchPolicy = {
      ...local,
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
    };
    expect(await code(fetchCalendarText(url, failing))).toBe('dns_failed');
  });

  it('reports HTTP errors by status only', async () => {
    const result = await fetchCalendarText(new URL(`${base}/missing`), local).catch(
      (error: Error & { code: string }) => error,
    );
    expect(result).toMatchObject({ code: 'http_404', message: 'http_404' });
  });

  it('stops at the size limit, declared, streamed or decompressed', async () => {
    for (const path of ['/big-declared', '/big-streamed', '/zip-bomb']) {
      expect({
        path,
        code: await code(fetchCalendarText(new URL(`${base}${path}`), local)),
      }).toEqual({
        path,
        code: 'too_large',
      });
    }
  });

  it('gives up after the timeout', async () => {
    const started = Date.now();
    expect(
      await code(fetchCalendarText(new URL(`${base}/slow`), { ...local, timeoutMs: 300 })),
    ).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('follows at most three redirects, checking each one', async () => {
    expect(await fetchCalendarText(new URL(`${base}/hop/2`), local)).toBe(ICS);
    expect(await code(fetchCalendarText(new URL(`${base}/hop/3`), local))).toBe(
      'too_many_redirects',
    );
    expect(await code(fetchCalendarText(new URL(`${base}/to-private`), local))).toBe(
      'blocked_address',
    );
    const resolvesPrivate: FetchPolicy = {
      ...local,
      resolve: async () => [{ address: '169.254.169.254', family: 4 }],
    };
    expect(
      await code(fetchCalendarText(new URL(`${base}/to-metadata-name`), resolvesPrivate)),
    ).toBe('blocked_address');
  });
});
