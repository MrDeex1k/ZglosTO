import { INCIDENT_STATUSES, type IncidentStatusCode } from './incidents.js';
import { z } from 'zod';

export const ServiceIncidentStatisticsItemSchema = z
  .object({
    status_incydentu: z.enum(INCIDENT_STATUSES),
    liczba: z.number(),
  })
  .strict();

export const AdminIncidentStatisticsItemSchema = ServiceIncidentStatisticsItemSchema.extend({
  typ_sluzby: z.string(),
}).strict();

export interface ServiceIncidentStatisticsItem {
  status_incydentu: IncidentStatusCode;
  liczba: number;
}

export interface AdminIncidentStatisticsItem extends ServiceIncidentStatisticsItem {
  typ_sluzby: string;
}
