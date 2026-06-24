import crypto from 'crypto';

/** Hash opaque tokens (refresh / reset) before persisting. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
