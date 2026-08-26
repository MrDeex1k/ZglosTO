import type {
  CurrentIncidentListItemDto,
  IncidentStatusCode,
  ServiceIncidentStatisticsItem,
} from '@zglosto/contracts';

import type { ServiceFilter } from './service-phase5-policy';

export type ServiceIncidentCounts = Record<IncidentStatusCode, number> & { all: number };

const EMPTY_COUNTS: ServiceIncidentCounts = {
  all: 0,
  in_progress: 0,
  reported: 0,
  resolved: 0,
};

export function filterServiceIncidents(
  incidents: ReadonlyArray<CurrentIncidentListItemDto>,
  filter: ServiceFilter,
): CurrentIncidentListItemDto[] {
  if (filter === 'all') return [...incidents];
  return incidents.filter((incident) => incident.status_incydentu === filter);
}

export function serviceIncidentCounts(
  incidents: ReadonlyArray<CurrentIncidentListItemDto>,
  statistics?: ReadonlyArray<ServiceIncidentStatisticsItem>,
): ServiceIncidentCounts {
  const counts = { ...EMPTY_COUNTS };
  if (statistics === undefined) {
    for (const incident of incidents) counts[incident.status_incydentu] += 1;
  } else {
    for (const item of statistics) counts[item.status_incydentu] = item.liczba;
  }
  counts.all = counts.reported + counts.in_progress + counts.resolved;
  return counts;
}
