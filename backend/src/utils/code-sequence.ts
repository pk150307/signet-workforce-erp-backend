/**
 * Builds the next code in a PREFIX-NNN sequence, preserving the prefix
 * and zero-padding width from existing codes when present.
 */
export function buildNextSequentialCode(
  existingCodes: string[],
  defaultPrefix: string,
  padLength = 3,
): string {
  const normalizedDefault = defaultPrefix.endsWith('-')
    ? defaultPrefix
    : `${defaultPrefix}-`;

  let maxNum = 0;
  let prefix = normalizedDefault;
  let pad = padLength;

  for (const raw of existingCodes) {
    const code = raw.trim();
    const match = code.match(/^(.+?-)(\d+)$/i);
    if (!match) continue;

    const num = parseInt(match[2], 10);
    if (Number.isNaN(num)) continue;

    if (num >= maxNum) {
      maxNum = num;
      prefix = match[1];
      pad = Math.max(padLength, match[2].length);
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(pad, '0')}`;
}
