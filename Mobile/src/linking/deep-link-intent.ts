import type { Href } from 'expo-router';

import {
  canAccessPublicIncidents,
  publicRouteRedirectForSession,
  type MobileSessionState,
} from '@/auth/route-access';
import { routeForSession } from '@/auth/session-model';

export type IncidentLinkTarget = 'public' | 'resident' | 'service';

export interface IncidentLinkIntent {
  incidentId: string;
  target: Exclude<IncidentLinkTarget, 'public'>;
}

const INCIDENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseIncidentId(value: string | string[] | undefined): string | null {
  const candidate = firstString(value);
  return candidate !== undefined && INCIDENT_ID_PATTERN.test(candidate) ? candidate : null;
}

export function parseIncidentLinkTarget(
  value: string | string[] | undefined,
): IncidentLinkTarget | null {
  const candidate = firstString(value);
  return candidate === 'public' || candidate === 'resident' || candidate === 'service'
    ? candidate
    : null;
}

export function serializeLoginIntent(intent: IncidentLinkIntent): string {
  return `${intent.target}:${intent.incidentId}`;
}

export function parseLoginIntent(value: string | string[] | undefined): IncidentLinkIntent | null {
  const candidate = firstString(value);
  if (candidate === undefined) return null;
  const separator = candidate.indexOf(':');
  if (separator === -1) return null;
  const target = candidate.slice(0, separator);
  const incidentId = candidate.slice(separator + 1);
  if ((target !== 'resident' && target !== 'service') || !INCIDENT_ID_PATTERN.test(incidentId)) {
    return null;
  }
  return { incidentId, target };
}

export function privateIncidentRoute(intent: IncidentLinkIntent): Href {
  return `/${intent.target}/incidents/${intent.incidentId}` as Href;
}

export function resolvePublicIncidentRoute(
  session: MobileSessionState,
  incidentId: string,
): Href | null {
  if (session.status === 'unknown' || session.status === 'stale') return null;
  const redirect = publicRouteRedirectForSession(session);
  if (redirect !== null) return redirect;
  return canAccessPublicIncidents(session) ? (`/incidents/${incidentId}` as Href) : '/';
}

export function resolveAuthenticatedIntent(
  session: MobileSessionState,
  intent: IncidentLinkIntent | null,
): Href | null {
  if (session.status !== 'authenticated') return null;
  if (intent !== null && session.role === intent.target) return privateIncidentRoute(intent);
  return (routeForSession(session) ?? '/') as Href;
}
