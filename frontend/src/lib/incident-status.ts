import type { IncidentStatusCode } from '@zglosto/contracts';

import { i18n } from '../i18n';

export type { IncidentStatusCode };

export type IncidentDisplayStatus = 'pending' | 'in-progress' | 'resolved';

export function getIncidentStatusLabel(status: IncidentStatusCode): string {
  if (status === 'reported') return i18n.t(($) => $.incidents.status.reported);
  if (status === 'in_progress') return i18n.t(($) => $.incidents.status.inProgress);
  return i18n.t(($) => $.incidents.status.resolved);
}

export function toIncidentDisplayStatus(status: IncidentStatusCode): IncidentDisplayStatus {
  if (status === 'resolved') return 'resolved';
  if (status === 'in_progress') return 'in-progress';
  return 'pending';
}
