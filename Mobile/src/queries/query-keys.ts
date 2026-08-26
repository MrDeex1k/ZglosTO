export const queryKeys = {
  private: (userId: string, role: string) => ['private', role, userId] as const,
  publicConfig: (origin: string) => ['public', 'config', origin] as const,
  publicIncidents: (origin: string) => ['public', 'incidents', 'resolved', origin] as const,
  residentIncidents: (origin: string, userId: string) =>
    ['private', 'resident', userId, 'incidents', origin] as const,
  privateImage: (origin: string, userId: string, imageId: string, checksum: string) =>
    ['private', 'image', userId, imageId, checksum, origin] as const,
  serviceIncidents: (origin: string, userId: string, serviceKey: string) =>
    ['private', 'service', userId, serviceKey, 'incidents', origin] as const,
  serviceStatistics: (origin: string, userId: string, serviceKey: string) =>
    ['private', 'service', userId, serviceKey, 'statistics', origin] as const,
} as const;
