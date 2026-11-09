import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token for an invite link. Only its hash is stored. */
export const newInviteToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();
