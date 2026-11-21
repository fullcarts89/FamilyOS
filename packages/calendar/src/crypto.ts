import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Calendar addresses are secrets: anyone holding a private ICS link can read the calendar. They
 * are stored only as AES-256-GCM ciphertext, bound to their household and row (additional
 * authenticated data), with the key held by the API and worker (CALENDAR_ENCRYPTION_KEY), never
 * the database. Nothing here logs or returns the plain address except `decryptUrl`.
 */

export class CalendarKeyError extends Error {
  constructor() {
    super('CALENDAR_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    this.name = 'CalendarKeyError';
  }
}

/** Parses CALENDAR_ENCRYPTION_KEY: exactly 32 bytes, standard base64. */
export function parseCalendarKey(base64: string): Buffer {
  const trimmed = base64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) throw new CalendarKeyError();
  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new CalendarKeyError();
  return key;
}

export interface SealedUrl {
  /** Ciphertext followed by the 16-byte GCM tag. */
  ciphertext: Buffer;
  nonce: Buffer;
}

const aadFor = (binding: { householdId: string; sourceId: string }) =>
  Buffer.from(`familyos:calendar_source:${binding.householdId}:${binding.sourceId}`);

export function encryptUrl(
  key: Buffer,
  url: string,
  binding: { householdId: string; sourceId: string },
): SealedUrl {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aadFor(binding));
  const body = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]), nonce };
}

export function decryptUrl(
  key: Buffer,
  sealed: SealedUrl,
  binding: { householdId: string; sourceId: string },
): string {
  const tag = sealed.ciphertext.subarray(sealed.ciphertext.length - 16);
  const body = sealed.ciphertext.subarray(0, sealed.ciphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce);
  decipher.setAAD(aadFor(binding));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export type UrlProblem = 'invalid_url' | 'insecure_url';

/**
 * The address to fetch: https only (webcal:// is https; http only for tests' local server), no
 * embedded credentials, at most 2000 characters. Returns the normalized URL or why it can't be used.
 */
export function normalizeCalendarUrl(
  raw: string,
  options: { allowHttp?: boolean } = {},
): URL | UrlProblem {
  const text = raw.trim();
  if (text.length === 0 || text.length > 2000) return 'invalid_url';
  let url: URL;
  try {
    url = new URL(text.replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return 'invalid_url';
  }
  const http = url.protocol === 'http:' && options.allowHttp === true;
  if (url.protocol !== 'https:' && !http) {
    return url.protocol === 'http:' ? 'insecure_url' : 'invalid_url';
  }
  if (url.username || url.password || !url.hostname) return 'invalid_url';
  return url;
}

/** "calendar.google.com/…": enough to recognise a calendar, never enough to read it. */
export function maskUrl(url: URL): string {
  return `${url.hostname.slice(0, 100)}/…`;
}
