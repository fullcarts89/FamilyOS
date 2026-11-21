import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import zlib from 'node:zlib';

/**
 * Fetching a calendar the household gave us, without letting the address reach anything else
 * (server-side request forgery): https only, every resolved address must be public (checked at
 * connect time, so a DNS answer can't change between check and use), at most 3 redirects, each
 * checked again, 5 MB and 15 seconds at most. Failures are fixed codes; nothing from the remote
 * server (status text, body) is kept.
 */

export type FetchErrorCode =
  | 'invalid_url'
  | 'insecure_url'
  | 'blocked_address'
  | 'dns_failed'
  | 'network_error'
  | 'tls_error'
  | 'timeout'
  | 'too_large'
  | 'too_many_redirects'
  | `http_${number}`;

export class CalendarFetchError extends Error {
  constructor(readonly code: FetchErrorCode | 'not_calendar' | 'too_many_events' | 'too_complex') {
    super(code);
    this.name = 'CalendarFetchError';
  }
}

export interface FetchPolicy {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  /** Tests only: allow http:// (a local test server). */
  allowHttp?: boolean;
  /** Tests only: which addresses may be reached instead of public ones (a local test server). */
  allowAddress?: (address: string) => boolean;
  /** Resolves a hostname; defaults to the system resolver. Tests inject answers. */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
}

export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 15_000,
  maxRedirects: 3,
};

// Everything that isn't the public internet: RFC 6890 special-purpose ranges and friends. Two
// lists: Node's BlockList matches IPv4 addresses against IPv6 rules too (as ::a.b.c.d and
// ::ffff:a.b.c.d), so the IPv6 ranges below that contain those would block every IPv4 address.
const blocked = new BlockList();
const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  // Unspecified, loopback and IPv4-compatible (::a.b.c.d, deprecated but still parsed).
  ['::', 96],
  ['::1', 128],
  // IPv4-mapped in any spelling (0:0:0:0:0:ffff:7f00:1 as well as ::ffff:127.0.0.1).
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedV6.addSubnet(net, prefix, 'ipv6');
}

/** Whether an IP address is on the public internet. IPv4-mapped IPv6 is checked as IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped?.[1]) return !blocked.check(mapped[1], 'ipv4');
    if (/^::ffff:/i.test(address)) return false;
    return !blockedV6.check(address, 'ipv6');
  }
  return false;
}

const systemResolve = (hostname: string) =>
  new Promise<LookupAddress[]>((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    );
  });

function fail(code: FetchErrorCode): never {
  throw new CalendarFetchError(code);
}

/** Fetches a calendar's text under the policy. Throws CalendarFetchError with a fixed code. */
export async function fetchCalendarText(
  address: URL,
  policy: FetchPolicy = DEFAULT_FETCH_POLICY,
): Promise<string> {
  const deadline = Date.now() + policy.timeoutMs;
  const resolve = policy.resolve ?? systemResolve;
  const allowed = policy.allowAddress ?? isPublicAddress;
  let url = address;

  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'https:' && !(policy.allowHttp && url.protocol === 'http:')) {
      fail(url.protocol === 'http:' ? 'insecure_url' : 'invalid_url');
    }
    if (url.username || url.password) fail('invalid_url');
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    // Resolve once, check every answer, then connect to that exact address: a second DNS answer
    // can't sneak in between the check and the connection.
    let connectTo: string;
    if (isIP(host)) {
      connectTo = host;
    } else {
      let addresses: LookupAddress[];
      try {
        addresses = await resolve(host);
      } catch {
        fail('dns_failed');
      }
      const first = addresses[0];
      if (!first) fail('dns_failed');
      connectTo = first.address;
      if (addresses.some((a) => !allowed(a.address))) fail('blocked_address');
    }
    if (!allowed(connectTo)) fail('blocked_address');

    const response = await request(url, connectTo, deadline, policy.maxBytes);
    if (response.location !== null) {
      if (hop >= policy.maxRedirects) fail('too_many_redirects');
      try {
        url = new URL(response.location, url);
      } catch {
        fail('invalid_url');
      }
      continue;
    }
    return response.body;
  }
}

function request(
  url: URL,
  connectTo: string,
  deadline: number,
  maxBytes: number,
): Promise<{ location: string | null; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new CalendarFetchError('timeout'));
      return;
    }
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (
      error: CalendarFetchError | null,
      value?: { location: string | null; body: string },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        req.destroy();
        reject(error);
      } else if (value) {
        resolvePromise(value);
      }
    };
    const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
    const req = client.request(
      {
        protocol: url.protocol,
        host: connectTo,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        agent: false,
        // TLS still checks the certificate against the calendar's own hostname.
        ...(url.protocol === 'https:' && !isIP(hostname) && { servername: hostname }),
        headers: {
          host: url.host,
          accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1',
          'accept-encoding': 'gzip, deflate',
          'user-agent': 'FamilyOS-calendar-sync',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && status !== 304) {
          res.resume();
          const location = res.headers.location;
          if (!location) finish(new CalendarFetchError(`http_${status}`));
          else finish(null, { location, body: '' });
          return;
        }
        if (status !== 200) {
          res.resume();
          finish(new CalendarFetchError(`http_${status}`));
          return;
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          finish(new CalendarFetchError('too_large'));
          return;
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip'
            ? res.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? res.pipe(zlib.createInflate())
              : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            finish(new CalendarFetchError('too_large'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () =>
          finish(null, { location: null, body: Buffer.concat(chunks).toString('utf8') }),
        );
        stream.on('error', () => finish(new CalendarFetchError('network_error')));
      },
    );
    const timer = setTimeout(() => finish(new CalendarFetchError('timeout')), remaining);
    req.on('error', (error: NodeJS.ErrnoException) => {
      const code = error.code ?? '';
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        finish(new CalendarFetchError('dns_failed'));
      } else if (/CERT|SSL|TLS/i.test(code)) {
        finish(new CalendarFetchError('tls_error'));
      } else {
        finish(new CalendarFetchError('network_error'));
      }
    });
    req.end();
  });
}
