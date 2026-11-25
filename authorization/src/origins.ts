export function authorizationOrigins(frontendOrigin: string, nodeEnv: string): string[] {
  return [
    ...new Set([frontendOrigin, ...(nodeEnv === 'production' ? [] : ['http://localhost:5173'])]),
  ];
}

const DNS_HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function mobileAppLinkOrigin(value: string | null): string | null {
  if (value === null) return null;
  const host = value.toLowerCase();
  if (!DNS_HOSTNAME.test(host)) {
    throw new Error('MOBILE_APP_LINK_HOST must be a DNS hostname without a scheme, port or path.');
  }
  return `https://${host}`;
}

export function betterAuthTrustedOrigins(
  frontendOrigin: string,
  nodeEnv: string,
  appLinkOrigin: string | null,
): string[] {
  const origins = new Set([...authorizationOrigins(frontendOrigin, nodeEnv), 'zglosto://']);
  if (appLinkOrigin !== null) origins.add(appLinkOrigin);
  return [...origins];
}
