import type { IncidentStatusCode } from '@zglosto/contracts';
import type { IncidentDisplayStatus } from '../lib/incident-status';

export interface Incident {
  id: string;
  service: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  email: string;
  imageUrl: string | null;
  resolvedImageUrl: string | null;
  status: IncidentDisplayStatus;
  checked: boolean;
  adminStatus: IncidentStatusCode;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ServiceIncident extends Incident {
  revision: number;
}

export type NewIncidentDraft = Omit<Incident, 'id' | 'status' | 'createdAt' | 'resolvedAt'>;
