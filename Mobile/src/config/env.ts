const MOBILE_APP_ENVIRONMENTS = ['development', 'preview', 'production'] as const;

type MobileAppEnvironment = (typeof MOBILE_APP_ENVIRONMENTS)[number];

export interface MobileEnvironment {
  allowHttpOrigin: boolean;
  apiOrigin: string;
  appEnvironment: MobileAppEnvironment;
}

export class MobileEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileEnvironmentError';
  }
}

interface PublicEnvironmentInput {
  EXPO_PUBLIC_ALLOW_HTTP_ORIGIN?: string | undefined;
  EXPO_PUBLIC_API_ORIGIN?: string | undefined;
  EXPO_PUBLIC_APP_ENV?: string | undefined;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '10.0.2.2', 'localhost']);

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first = -1, second = -1] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new MobileEnvironmentError('EXPO_PUBLIC_ALLOW_HTTP_ORIGIN must be true or false.');
}

function parseAppEnvironment(value: string | undefined): MobileAppEnvironment {
  const candidate = value ?? 'development';
  if (MOBILE_APP_ENVIRONMENTS.some((environment) => environment === candidate)) {
    return candidate as MobileAppEnvironment;
  }
  throw new MobileEnvironmentError(
    `EXPO_PUBLIC_APP_ENV must be one of: ${MOBILE_APP_ENVIRONMENTS.join(', ')}.`,
  );
}

function parseApiOrigin(
  value: string | undefined,
  appEnvironment: MobileAppEnvironment,
  allowHttpOrigin: boolean,
): string {
  if (value === undefined || value.trim() === '') {
    throw new MobileEnvironmentError('EXPO_PUBLIC_API_ORIGIN is required.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MobileEnvironmentError('EXPO_PUBLIC_API_ORIGIN must be an absolute URL.');
  }

  if (url.username !== '' || url.password !== '') {
    throw new MobileEnvironmentError('EXPO_PUBLIC_API_ORIGIN must not contain credentials.');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new MobileEnvironmentError('EXPO_PUBLIC_API_ORIGIN must contain only an origin.');
  }

  const isAllowedDevelopmentHttp =
    appEnvironment === 'development' &&
    allowHttpOrigin &&
    url.protocol === 'http:' &&
    (LOOPBACK_HOSTS.has(url.hostname) || isPrivateIpv4(url.hostname));

  if (url.protocol !== 'https:' && !isAllowedDevelopmentHttp) {
    throw new MobileEnvironmentError(
      'EXPO_PUBLIC_API_ORIGIN must use HTTPS. HTTP is limited to explicitly allowed development hosts.',
    );
  }

  return url.origin;
}

export function parseMobileEnvironment(input: PublicEnvironmentInput): MobileEnvironment {
  const appEnvironment = parseAppEnvironment(input.EXPO_PUBLIC_APP_ENV);
  const allowHttpOrigin = parseBooleanFlag(input.EXPO_PUBLIC_ALLOW_HTTP_ORIGIN);
  const apiOrigin = parseApiOrigin(input.EXPO_PUBLIC_API_ORIGIN, appEnvironment, allowHttpOrigin);

  return { allowHttpOrigin, apiOrigin, appEnvironment };
}

export function readMobileEnvironment(): MobileEnvironment {
  return parseMobileEnvironment({
    EXPO_PUBLIC_ALLOW_HTTP_ORIGIN: process.env.EXPO_PUBLIC_ALLOW_HTTP_ORIGIN,
    EXPO_PUBLIC_API_ORIGIN: process.env.EXPO_PUBLIC_API_ORIGIN,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  });
}
