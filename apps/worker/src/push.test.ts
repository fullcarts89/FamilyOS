import { describe, expect, it } from 'vitest';
import {
  EXPO_PUSH_URL,
  PushRequestError,
  expoPushSender,
  pushSenderFor,
  type PushMessage,
} from './push';

const message = (n: number, urgent = false): PushMessage => ({
  to: `ExponentPushToken[device${n}]`,
  title: 'Good morning',
  body: 'Today: 1 thing due',
  data: { kind: 'morning_checkin', householdId: 'h' },
  urgent,
});

function fakeFetch(respond: (body: { to: string }[]) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown>[] }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { to: string }[];
    calls.push({ url: String(url), init: init ?? {}, body });
    return respond(body);
  }) as typeof fetch;
  return { fn, calls };
}

describe('Expo push sender', () => {
  it('posts batches of up to 100 to the Expo push API and reads each ticket', async () => {
    const { fn, calls } = fakeFetch(
      (body) =>
        new Response(
          JSON.stringify({
            data: body.map((m) =>
              m.to.endsWith('[device1]')
                ? {
                    status: 'error',
                    message: 'not registered',
                    details: { error: 'DeviceNotRegistered' },
                  }
                : m.to.endsWith('[device2]')
                  ? { status: 'error', details: { error: 'SomethingNew' } }
                  : { status: 'ok', id: 'x' },
            ),
          }),
        ),
    );
    const sender = expoPushSender({ fetch: fn, accessToken: 'expo-token' });
    const messages = Array.from({ length: 150 }, (_, i) => message(i, i === 0));
    const tickets = await sender.send(messages);
    expect(calls.map((c) => [c.url, c.body.length])).toEqual([
      [EXPO_PUSH_URL, 100],
      [EXPO_PUSH_URL, 50],
    ]);
    expect(calls[0]?.init.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer expo-token',
    });
    expect(calls[0]?.body[0]).toEqual({
      to: 'ExponentPushToken[device0]',
      title: 'Good morning',
      body: 'Today: 1 thing due',
      data: { kind: 'morning_checkin', householdId: 'h' },
      priority: 'high',
      sound: 'default',
    });
    expect(calls[0]?.body[3]).not.toHaveProperty('sound');
    expect(tickets.slice(0, 4)).toEqual([
      { ok: true },
      { ok: false, error: 'DeviceNotRegistered' },
      { ok: false, error: 'unknown' },
      { ok: true },
    ]);
    expect(tickets).toHaveLength(150);
  });

  it('sends no authorization header without an access token', async () => {
    const { fn, calls } = fakeFetch(
      (body) => new Response(JSON.stringify({ data: body.map(() => ({ status: 'ok' })) })),
    );
    await expoPushSender({ fetch: fn }).send([message(1)]);
    expect(calls[0]?.init.headers).not.toHaveProperty('authorization');
  });

  it('fails the whole request on an HTTP error, a bad response or the network', async () => {
    const cases: [() => Response | Promise<Response>, string][] = [
      [() => new Response('nope', { status: 500 }), 'http_500'],
      [() => new Response('not json'), 'invalid_response'],
      [() => new Response(JSON.stringify({ errors: [{ code: 'X' }] })), 'invalid_response'],
      [() => new Response(JSON.stringify({ data: [] })), 'invalid_response'],
      [() => Promise.reject(new TypeError('fetch failed')), 'network'],
    ];
    for (const [respond, code] of cases) {
      const { fn } = fakeFetch(respond);
      await expect(expoPushSender({ fetch: fn }).send([message(1)])).rejects.toEqual(
        new PushRequestError(code),
      );
    }
  });
});

describe('choosing the sender', () => {
  it('sends nothing in production without EXPO_ACCESS_TOKEN', () => {
    expect(pushSenderFor({ NODE_ENV: 'production' })).toBeNull();
    expect(pushSenderFor({ NODE_ENV: 'production', EXPO_ACCESS_TOKEN: '' })).toBeNull();
    expect(pushSenderFor({ NODE_ENV: 'production', EXPO_ACCESS_TOKEN: 'x' })).not.toBeNull();
    // Development and tests may send unauthenticated (Expo projects without push security).
    expect(pushSenderFor({ NODE_ENV: 'development' })).not.toBeNull();
    expect(pushSenderFor({})).not.toBeNull();
  });
});
