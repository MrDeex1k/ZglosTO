export function authorizationOrigins(frontendOrigin: string, nodeEnv: string): string[] {
  return [
    ...new Set([frontendOrigin, ...(nodeEnv === 'production' ? [] : ['http://localhost:5173'])]),
  ];
}
