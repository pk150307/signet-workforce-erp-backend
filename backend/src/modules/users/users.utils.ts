import crypto from 'crypto';
import { validatePasswordPolicy } from '../../utils/password-policy';

export function generateCompliantPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];

  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  const all = upper + lower + digits + special;
  while (chars.length < length) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const password = chars.join('');
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) {
    return `Signet@${crypto.randomBytes(6).toString('hex')}1A!`;
  }
  return password;
}

export function deriveUsername(email: string, firstName: string, lastName: string): string {
  const local = email.split('@')[0]?.replace(/[^a-z0-9._-]/gi, '') || '';
  if (local.length >= 3) {
    return local.toLowerCase().slice(0, 100);
  }
  const fromName = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return (fromName || `user${Date.now()}`).slice(0, 100);
}
