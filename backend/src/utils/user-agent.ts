export interface ParsedUserAgent {
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string;
}

export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  const ua = userAgent ?? '';
  if (!ua) {
    return { browser: null, operatingSystem: null, deviceType: 'unknown' };
  }

  let browser: string | null = null;
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let operatingSystem: string | null = null;
  if (ua.includes('Windows')) operatingSystem = 'Windows';
  else if (ua.includes('Mac OS X')) operatingSystem = 'macOS';
  else if (ua.includes('Android')) operatingSystem = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) operatingSystem = 'iOS';
  else if (ua.includes('Linux')) operatingSystem = 'Linux';

  let deviceType = 'desktop';
  if (ua.includes('Mobile') || ua.includes('Android')) deviceType = 'mobile';
  else if (ua.includes('iPad') || ua.includes('Tablet')) deviceType = 'tablet';

  return { browser, operatingSystem, deviceType };
}
