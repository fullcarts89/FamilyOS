/**
 * Sending push notifications through Expo's push service (docs/operations/iphone.md). The
 * worker talks to a PushSender, so tests swap in a fake and never reach the network. Nothing
 * here logs a message's text or a token.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts up to 100 messages per request. */
export const EXPO_BATCH = 100;

export interface PushMessage {
  /** The device's Expo push token. */
  to: string;
  title: string;
  body: string;
  /** Routing only (kind, household); never text. */
  data: Record<string, string>;
  /** Time-sensitive: sound and high priority. Others arrive quietly. */
  urgent: boolean;
}

/** Fixed codes from Expo's ticket errors; anything else is 'unknown'. */
export const PUSH_ERRORS = [
  'DeviceNotRegistered',
  'MessageTooBig',
  'MessageRateExceeded',
  'MismatchSenderId',
  'InvalidCredentials',
] as const;
export type PushErrorCode = (typeof PUSH_ERRORS)[number] | 'unknown';

/** One per message, in the same order. */
export type PushTicket = { ok: true } | { ok: false; error: PushErrorCode };

export interface PushSender {
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
}

/** The whole request failed (network, timeout, HTTP error): nothing is known to be delivered. */
export class PushRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PushRequestError';
  }
}

const errorCode = (value: unknown): PushErrorCode =>
  (PUSH_ERRORS as readonly string[]).includes(value as string)
    ? (value as PushErrorCode)
    : 'unknown';

/**
 * A sender for the Expo push API. `accessToken` is needed only if the Expo project requires
 * push security (EXPO_ACCESS_TOKEN). `fetch` is swappable for tests.
 */
export function expoPushSender(
  options: { accessToken?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): PushSender {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    async send(messages) {
      const tickets: PushTicket[] = [];
      for (let i = 0; i < messages.length; i += EXPO_BATCH) {
        const batch = messages.slice(i, i + EXPO_BATCH);
        let response: Response;
        try {
          response = await doFetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              ...(options.accessToken && { authorization: `Bearer ${options.accessToken}` }),
            },
            body: JSON.stringify(
              batch.map((m) => ({
                to: m.to,
                title: m.title,
                body: m.body,
                data: m.data,
                priority: m.urgent ? 'high' : 'normal',
                ...(m.urgent && { sound: 'default' }),
              })),
            ),
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'error',
          });
        } catch (error) {
          throw new PushRequestError(
            error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network',
          );
        }
        if (!response.ok) throw new PushRequestError(`http_${response.status}`);
        let parsed: unknown;
        try {
          parsed = await response.json();
        } catch {
          throw new PushRequestError('invalid_response');
        }
        const data = (parsed as { data?: unknown }).data;
        if (!Array.isArray(data) || data.length !== batch.length) {
          throw new PushRequestError('invalid_response');
        }
        for (const ticket of data as { status?: unknown; details?: { error?: unknown } }[]) {
          tickets.push(
            ticket.status === 'ok'
              ? { ok: true }
              : { ok: false, error: errorCode(ticket.details?.error) },
          );
        }
      }
      return tickets;
    },
  };
}
