const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const operationsPath = '/operacje';

export function operationsURL(origin: unknown, allowLocalHttp = false): URL {
  if (typeof origin !== 'string' || !URL.canParse(origin)) {
    throw new Error('Podaj adres instancji ZgłosTO w ZGLOSTO_DESKTOP_ORIGIN.');
  }

  const url = new URL(origin);
  const allowedProtocol =
    url.protocol === 'https:' ||
    (allowLocalHttp && url.protocol === 'http:' && loopbackHosts.has(url.hostname));
  if (
    !allowedProtocol ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Adres instancji musi wskazywać domenę HTTPS, bez ścieżki i danych logowania.');
  }
  return new URL(operationsPath, url);
}

export function isOperationsNavigation(value: string, entry: URL): boolean {
  if (!URL.canParse(value)) return false;
  const target = new URL(value);
  return (
    target.protocol === entry.protocol &&
    target.origin === entry.origin &&
    !target.username &&
    !target.password &&
    (target.pathname === operationsPath || target.pathname === `${operationsPath}/`)
  );
}
