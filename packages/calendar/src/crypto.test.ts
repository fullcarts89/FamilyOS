import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CalendarKeyError,
  decryptUrl,
  encryptUrl,
  maskUrl,
  normalizeCalendarUrl,
  parseCalendarKey,
} from './crypto';

const URL_TEXT =
  'https://calendar.google.com/calendar/ical/abc%40group/private-0123456789/basic.ics';

describe('calendar address encryption', () => {
  const key = randomBytes(32);
  const binding = { householdId: randomUUID(), sourceId: randomUUID() };

  it('round-trips, with a fresh nonce each time and no plaintext in the ciphertext', () => {
    const a = encryptUrl(key, URL_TEXT, binding);
    const b = encryptUrl(key, URL_TEXT, binding);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.includes(Buffer.from('private-0123456789'))).toBe(false);
    expect(decryptUrl(key, a, binding)).toBe(URL_TEXT);
  });

  it('fails with the wrong key, another row, or a tampered ciphertext', () => {
    const sealed = encryptUrl(key, URL_TEXT, binding);
    expect(() => decryptUrl(randomBytes(32), sealed, binding)).toThrow();
    expect(() => decryptUrl(key, sealed, { ...binding, sourceId: randomUUID() })).toThrow();
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    expect(() => decryptUrl(key, { ...sealed, ciphertext: tampered }, binding)).toThrow();
  });

  it('accepts only a 32-byte base64 key', () => {
    expect(parseCalendarKey(randomBytes(32).toString('base64')).length).toBe(32);
    for (const bad of ['', 'short', randomBytes(16).toString('base64'), 'not base64!!']) {
      expect(() => parseCalendarKey(bad)).toThrow(CalendarKeyError);
    }
  });
});

describe('calendar addresses', () => {
  it('takes https and webcal, refusing http, other schemes and credentials', () => {
    expect(String(normalizeCalendarUrl('webcal://p01-caldav.icloud.com/published/2/abc'))).toBe(
      'https://p01-caldav.icloud.com/published/2/abc',
    );
    expect(normalizeCalendarUrl('http://example.com/a.ics')).toBe('insecure_url');
    expect(normalizeCalendarUrl('file:///etc/passwd')).toBe('invalid_url');
    expect(normalizeCalendarUrl('https://user:pw@example.com/a.ics')).toBe('invalid_url');
    expect(normalizeCalendarUrl('not a url')).toBe('invalid_url');
    expect(normalizeCalendarUrl(`https://example.com/${'a'.repeat(2000)}`)).toBe('invalid_url');
  });

  it('masks everything but the host', () => {
    const url = normalizeCalendarUrl(URL_TEXT);
    if (typeof url === 'string') throw new Error(url);
    expect(maskUrl(url)).toBe('calendar.google.com/…');
  });
});
