import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESET_PATH,
  RESET_SENT,
  linkFailure,
  newPasswordCheck,
  resetRequestMessage,
  resetToken,
  saveFailure,
} from '../apps/mobile/lib/password-reset';
import { APP_LINK_PATHS, IOS_BUNDLE_ID } from '../apps/api/src/web';

describe('asking for a reset link never reveals who has an account', () => {
  it('says the same words for every answer Supabase gives', () => {
    // No error (sent, or no such account), a resend too soon for that account, a failure to send
    // to a real address, a refused address: all one message, all "sent".
    for (const error of [
      null,
      { status: 400, code: 'validation_failed' },
      { status: 422, code: 'email_address_invalid' },
      { status: 429, code: 'over_email_send_rate_limit' },
      { status: 500, code: 'unexpected_failure' },
      { status: 503 },
    ]) {
      expect(resetRequestMessage(error)).toEqual({ sent: true, message: RESET_SENT });
    }
  });

  it('only says otherwise when the request never left this device', () => {
    for (const error of [{ status: 0 }, {}]) {
      const answer = resetRequestMessage(error);
      expect(answer.sent).toBe(false);
      expect(answer.message).toContain('offline');
      expect(answer.message).toContain('Nothing was sent.');
    }
  });

  it('words the sent message as an if, never a claim that the account exists', () => {
    expect(RESET_SENT).toMatch(/^If that email has a FamilyOS account/);
  });
});

describe('reading the reset link', () => {
  const hash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c';

  it('takes the token from a recovery link', () => {
    expect(resetToken({ token_hash: hash, type: 'recovery' })).toBe(hash);
  });

  it('refuses an incomplete link, another link type or a mangled token', () => {
    expect(resetToken({})).toBeNull();
    expect(resetToken({ token_hash: hash })).toBeNull();
    expect(resetToken({ token_hash: hash, type: 'signup' })).toBeNull();
    expect(resetToken({ token_hash: [hash, hash], type: 'recovery' })).toBeNull();
    expect(resetToken({ token_hash: 'short', type: 'recovery' })).toBeNull();
    expect(resetToken({ token_hash: `${hash}<script>`, type: 'recovery' })).toBeNull();
  });
});

describe('choosing the new password', () => {
  it('checks it with the same rule as the server (passwordProblem)', () => {
    expect(newPasswordCheck('too short', 'too short').ready).toBe(false);
    expect(newPasswordCheck('a quiet morning', 'a quiet morning')).toEqual({
      passwordError: null,
      againError: null,
      ready: true,
    });
    expect(newPasswordCheck('a'.repeat(73), 'a'.repeat(73))).toMatchObject({
      passwordError: 'That password is too long.',
      ready: false,
    });
  });

  it('says when the two fields differ, but not before the second is typed', () => {
    expect(newPasswordCheck('a quiet morning', '').againError).toBeNull();
    expect(newPasswordCheck('a quiet morning', 'a quiet mornin')).toMatchObject({
      againError: 'The passwords don’t match.',
      ready: false,
    });
  });
});

describe('what the reset screen says when something fails', () => {
  it('offers a new link when the link is used up or expired', () => {
    expect(linkFailure({ status: 403, code: 'otp_expired' })).toEqual({ expired: true });
    expect(linkFailure({ status: 400 })).toEqual({ expired: true });
  });

  it('keeps the link for a retry when Supabase could not be reached or answer', () => {
    expect(linkFailure({ status: 0 })).toMatchObject({ expired: false });
    expect(linkFailure({ status: 429 })).toMatchObject({ expired: false });
    expect(linkFailure({ status: 502 })).toMatchObject({ expired: false });
  });

  it('names a leaked password, and lets the current password through', () => {
    expect(saveFailure({ status: 422, code: 'weak_password' })).toContain('data breach');
    expect(saveFailure({ status: 422, code: 'same_password' })).toBeNull();
    expect(saveFailure({ status: 0 })).toContain('offline');
    expect(saveFailure({ status: 500 })).toBe(
      'Couldn’t save your new password. Try again in a moment.',
    );
  });
});

describe('the reset email (supabase/templates/recovery.html)', () => {
  const template = readFileSync(resolve(__dirname, '../supabase/templates/recovery.html'), 'utf8');
  const href = /href="([^"]+)"/.exec(template)?.[1]?.replaceAll('&amp;', '&') ?? '';

  it('links straight to the app’s reset page, built from the Site URL', () => {
    expect(href).toBe(`{{ .SiteURL }}${RESET_PATH}?token_hash={{ .TokenHash }}&type=recovery`);
  });

  it('never links through Supabase’s verify address, which would use the token on opening', () => {
    expect(template).not.toContain('ConfirmationURL');
  });

  it('is the template the local stack sends', () => {
    const config = readFileSync(resolve(__dirname, '../supabase/config.toml'), 'utf8');
    expect(config).toMatch(
      /\[auth\.email\.template\.recovery\][^[]*content_path = "\.\/supabase\/templates\/recovery\.html"/,
    );
  });
});

describe('the universal link', () => {
  it('names the iPhone app by its bundle ID, and claims the reset page', () => {
    const app = JSON.parse(readFileSync(resolve(__dirname, '../apps/mobile/app.json'), 'utf8')) as {
      expo: { ios: { bundleIdentifier: string } };
    };
    expect(IOS_BUNDLE_ID).toBe(app.expo.ios.bundleIdentifier);
    expect(APP_LINK_PATHS).toEqual([RESET_PATH]);
  });
});
