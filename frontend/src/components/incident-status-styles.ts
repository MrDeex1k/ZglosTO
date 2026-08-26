import type { IncidentStatusCode } from '@zglosto/contracts';

export type IncidentStatusFilter = 'ALL' | IncidentStatusCode;

export const INCIDENT_STATUS_BADGE_CLASS_NAMES: Record<IncidentStatusCode, string> = {
  reported: 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary',
  in_progress: 'border-warning/30 bg-warning/10 text-warning-foreground',
  resolved: 'border-success/30 bg-success/10 text-success',
};

export const INCIDENT_STATUS_CARD_CLASS_NAMES: Record<IncidentStatusCode, string> = {
  reported: 'border-l-4 border-l-brand-primary',
  in_progress: 'border-l-4 border-l-warning',
  resolved: 'border-l-4 border-l-success',
};

const ACTIVE_FILTER_CLASS_NAMES: Record<IncidentStatusFilter, string> = {
  ALL: 'border-border bg-muted text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50',
  reported:
    'border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary focus-visible:border-brand-primary focus-visible:ring-brand-primary/50',
  in_progress:
    'border-warning/30 bg-warning/10 text-warning-foreground hover:bg-warning/10 hover:text-warning-foreground focus-visible:border-warning focus-visible:ring-warning/50',
  resolved:
    'border-success/30 bg-success/10 text-success hover:bg-success/10 hover:text-success focus-visible:border-success focus-visible:ring-success/50',
};

export function getIncidentStatusFilterClassName(
  filter: IncidentStatusFilter,
  isActive: boolean,
): string | undefined {
  return isActive ? ACTIVE_FILTER_CLASS_NAMES[filter] : undefined;
}
