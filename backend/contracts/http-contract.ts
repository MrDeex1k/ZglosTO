export type BackendHttpMethod = 'GET' | 'POST' | 'PATCH';

export type BackendHttpAccess =
  | 'public'
  | 'optional-session'
  | 'resource-policy'
  | 'mieszkaniec'
  | 'sluzby'
  | 'admin';

export type BackendHttpCategory = 'health' | 'config' | 'images' | 'incidents';

export interface BackendAnonymousProbe {
  path: string;
  expectedStatus: number;
  body: Readonly<Record<string, unknown>> | null;
}

export interface BackendHttpContractEntry {
  id: string;
  category: BackendHttpCategory;
  internalPath: string;
  publicPath: string;
  method: BackendHttpMethod;
  access: BackendHttpAccess;
  requestContract: string | null;
  successStatuses: readonly number[];
  errorStatuses: readonly number[];
  responseContract: string;
  anonymousProbe: BackendAnonymousProbe;
}

function route(entry: Omit<BackendHttpContractEntry, 'publicPath'>): BackendHttpContractEntry {
  return {
    ...entry,
    publicPath: `/api${entry.internalPath}`,
  };
}

export const BACKEND_HTTP_CONTRACT: readonly BackendHttpContractEntry[] = [
  route({
    id: 'health-live',
    category: 'health',
    internalPath: '/health/live',
    method: 'GET',
    access: 'public',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [],
    responseContract: '{ status: "ok", service: "backend" }',
    anonymousProbe: { path: '/api/health/live', expectedStatus: 200, body: null },
  }),
  route({
    id: 'health-ready-alias',
    category: 'health',
    internalPath: '/health',
    method: 'GET',
    access: 'public',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [503],
    responseContract: 'BackendReadinessResponse',
    anonymousProbe: { path: '/api/health', expectedStatus: 200, body: null },
  }),
  route({
    id: 'health-ready',
    category: 'health',
    internalPath: '/health/ready',
    method: 'GET',
    access: 'public',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [503],
    responseContract: 'BackendReadinessResponse',
    anonymousProbe: { path: '/api/health/ready', expectedStatus: 200, body: null },
  }),
  route({
    id: 'config-public',
    category: 'config',
    internalPath: '/config/public',
    method: 'GET',
    access: 'public',
    requestContract: null,
    successStatuses: [200, 304],
    errorStatuses: [],
    responseContract: 'PublicCityConfigResponse | empty 304',
    anonymousProbe: { path: '/api/config/public', expectedStatus: 200, body: null },
  }),
  route({
    id: 'image-get',
    category: 'images',
    internalPath: '/images/:id',
    method: 'GET',
    access: 'resource-policy',
    requestContract: null,
    successStatuses: [200, 304],
    errorStatuses: [401, 403, 404, 500, 503],
    responseContract: 'binary image body | empty 304 | JsonError',
    anonymousProbe: { path: '/api/images/not-a-uuid', expectedStatus: 404, body: null },
  }),
  route({
    id: 'resident-incidents-list',
    category: 'incidents',
    internalPath: '/mieszkaniec/incydenty',
    method: 'GET',
    access: 'mieszkaniec',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [401, 403, 500, 503],
    responseContract: 'IncidentListItem[]',
    anonymousProbe: { path: '/api/mieszkaniec/incydenty', expectedStatus: 401, body: null },
  }),
  route({
    id: 'resident-incidents-public-list',
    category: 'incidents',
    internalPath: '/mieszkaniec/incydenty/glowna',
    method: 'GET',
    access: 'public',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [500],
    responseContract: 'ResolvedIncidentListItem[]',
    anonymousProbe: {
      path: '/api/mieszkaniec/incydenty/glowna',
      expectedStatus: 200,
      body: null,
    },
  }),
  route({
    id: 'resident-incidents-create',
    category: 'incidents',
    internalPath: '/mieszkaniec/incydenty',
    method: 'POST',
    access: 'optional-session',
    requestContract: 'CurrentCreateIncidentRequest',
    successStatuses: [201],
    errorStatuses: [400, 401, 403, 500, 503],
    responseContract: 'CreateIncidentResponse',
    anonymousProbe: {
      path: '/api/mieszkaniec/incydenty',
      expectedStatus: 400,
      body: {},
    },
  }),
  route({
    id: 'resident-image-upload-initiate',
    category: 'images',
    internalPath: '/mieszkaniec/obrazy/uploads',
    method: 'POST',
    access: 'optional-session',
    requestContract: 'InitiateImageUploadRequest',
    successStatuses: [201],
    errorStatuses: [400, 413, 429, 500, 503],
    responseContract: 'InitiateImageUploadResponse',
    anonymousProbe: {
      path: '/api/mieszkaniec/obrazy/uploads',
      expectedStatus: 400,
      body: {},
    },
  }),
  route({
    id: 'service-incidents-list',
    category: 'incidents',
    internalPath: '/sluzby/incydenty',
    method: 'GET',
    access: 'sluzby',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [401, 403, 500, 503],
    responseContract: 'IncidentListItem[]',
    anonymousProbe: { path: '/api/sluzby/incydenty', expectedStatus: 401, body: null },
  }),
  route({
    id: 'service-statistics',
    category: 'incidents',
    internalPath: '/sluzby/statystyki',
    method: 'GET',
    access: 'sluzby',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [401, 403, 500, 503],
    responseContract: 'ServiceStatistic[]',
    anonymousProbe: { path: '/api/sluzby/statystyki', expectedStatus: 401, body: null },
  }),
  route({
    id: 'service-incident-status',
    category: 'incidents',
    internalPath: '/sluzby/incydenty/:id/status',
    method: 'PATCH',
    access: 'sluzby',
    requestContract: 'UpdateIncidentStatusRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/sluzby/incydenty/contract-probe/status',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'service-incident-verification',
    category: 'incidents',
    internalPath: '/sluzby/incydenty/:id/sprawdzenie',
    method: 'PATCH',
    access: 'sluzby',
    requestContract: 'UpdateIncidentVerificationRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/sluzby/incydenty/contract-probe/sprawdzenie',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'service-incident-service',
    category: 'incidents',
    internalPath: '/sluzby/incydenty/:id/typ',
    method: 'PATCH',
    access: 'sluzby',
    requestContract: 'UpdateIncidentServiceRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/sluzby/incydenty/contract-probe/typ',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'service-incident-resolution-image',
    category: 'images',
    internalPath: '/sluzby/incydenty/:id/zdjecie_rozwiazane',
    method: 'POST',
    access: 'sluzby',
    requestContract: 'UploadResolvedImageRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/sluzby/incydenty/contract-probe/zdjecie_rozwiazane',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'service-resolution-image-upload-initiate',
    category: 'images',
    internalPath: '/sluzby/incydenty/:id/obrazy/uploads',
    method: 'POST',
    access: 'sluzby',
    requestContract: 'InitiateImageUploadRequest',
    successStatuses: [201],
    errorStatuses: [400, 401, 403, 404, 413, 500, 503],
    responseContract: 'InitiateImageUploadResponse',
    anonymousProbe: {
      path: '/api/sluzby/incydenty/contract-probe/obrazy/uploads',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'admin-statistics',
    category: 'incidents',
    internalPath: '/admin/statystyki',
    method: 'GET',
    access: 'admin',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [401, 403, 500, 503],
    responseContract: 'AdminStatistic[]',
    anonymousProbe: { path: '/api/admin/statystyki', expectedStatus: 401, body: null },
  }),
  route({
    id: 'admin-incidents-list',
    category: 'incidents',
    internalPath: '/admin/incydenty',
    method: 'GET',
    access: 'admin',
    requestContract: null,
    successStatuses: [200],
    errorStatuses: [401, 403, 500, 503],
    responseContract: 'IncidentListItem[]',
    anonymousProbe: { path: '/api/admin/incydenty', expectedStatus: 401, body: null },
  }),
  route({
    id: 'admin-incident-verification',
    category: 'incidents',
    internalPath: '/admin/incydenty/:id/sprawdzenie',
    method: 'PATCH',
    access: 'admin',
    requestContract: 'UpdateIncidentVerificationRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/admin/incydenty/contract-probe/sprawdzenie',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'admin-incident-service',
    category: 'incidents',
    internalPath: '/admin/incydenty/:id/typ',
    method: 'PATCH',
    access: 'admin',
    requestContract: 'UpdateIncidentServiceRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/admin/incydenty/contract-probe/typ',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'admin-incident-status',
    category: 'incidents',
    internalPath: '/admin/incydenty/:id/status',
    method: 'PATCH',
    access: 'admin',
    requestContract: 'UpdateIncidentStatusRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'IncidentMutationResponse',
    anonymousProbe: {
      path: '/api/admin/incydenty/contract-probe/status',
      expectedStatus: 401,
      body: null,
    },
  }),
  route({
    id: 'admin-user-permissions',
    category: 'incidents',
    internalPath: '/admin/uzytkownicy/service-key',
    method: 'PATCH',
    access: 'admin',
    requestContract: 'UpdateUserPermissionsRequest',
    successStatuses: [200],
    errorStatuses: [400, 401, 403, 404, 500, 503],
    responseContract: 'UpdateUserPermissionsResponse',
    anonymousProbe: {
      path: '/api/admin/uzytkownicy/service-key',
      expectedStatus: 401,
      body: null,
    },
  }),
];
