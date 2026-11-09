import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';

// 192.0.2.1 is TEST-NET-1 (RFC 5737): never routable, so even a broken guard makes no real call.
const UNROUTABLE = '192.0.2.1';

describe('test network guard', () => {
  it('blocks net.connect to non-local hosts', () => {
    expect(() => net.connect({ host: UNROUTABLE, port: 443 })).toThrow(/Network access is blocked/);
    expect(() => net.connect(443, UNROUTABLE)).toThrow(/Network access is blocked/);
  });

  it('blocks tls.connect to non-local hosts', () => {
    expect(() => tls.connect({ host: UNROUTABLE, port: 443 })).toThrow(/Network access is blocked/);
  });

  it('blocks fetch to non-local hosts', async () => {
    const error = await fetch(`http://${UNROUTABLE}/`).catch((caught: unknown) => caught);
    expect(String((error as Error & { cause?: unknown }).cause)).toMatch(
      /Network access is blocked/,
    );
  });

  it('allows connections to the local machine', () => {
    const socket = net.connect({ host: '127.0.0.1', port: 9 });
    socket.on('error', () => {});
    socket.destroy();
  });
});
