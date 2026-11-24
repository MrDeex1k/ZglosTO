import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  incidentQueryKeys,
  invalidateIncidentQueries,
  updateIncidentCache,
} from '../queries/incidents';
import {
  attachResolvedImageService,
  createIncident,
  updateIncidentService,
  updateIncidentStatus,
  updateIncidentStatusService,
  updateIncidentVerification,
  updateIncidentVerificationService,
  stageResolvedImageService,
} from '../services/api';
import type { IncidentStatusFormValues, ServiceIncidentFormValues } from '../forms/schemas';
import type { Incident, ServiceIncident } from '../types/incident';

interface IncidentServiceMutation {
  incidentId: string;
  service: string;
}

export function useCreateIncidentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIncident,
    onSuccess: () => invalidateIncidentQueries(queryClient),
  });
}

export async function saveServiceIncident(
  incident: ServiceIncident,
  { checked, adminStatus, resolvedImageFile }: ServiceIncidentFormValues,
): Promise<void> {
  const uploadId =
    resolvedImageFile === null
      ? null
      : await stageResolvedImageService(incident.id, resolvedImageFile);
  const revision =
    checked === incident.checked
      ? incident.revision
      : await updateIncidentVerificationService(incident.id, checked, incident.revision);
  if (adminStatus !== incident.adminStatus) {
    await updateIncidentStatusService(incident.id, adminStatus, revision);
  }
  if (uploadId !== null) {
    await attachResolvedImageService(incident.id, uploadId);
  }
}

export async function saveAdminIncidentStatus(
  incident: Incident,
  { checked, adminStatus }: IncidentStatusFormValues,
): Promise<void> {
  if (adminStatus !== incident.adminStatus) {
    await updateIncidentStatus(incident.id, adminStatus);
  }
  if (checked !== incident.checked) {
    await updateIncidentVerification(incident.id, checked);
  }
}

export function useServiceIncidentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      incident,
      values,
    }: {
      incident: ServiceIncident;
      values: ServiceIncidentFormValues;
    }) => saveServiceIncident(incident, values),
    onSettled: () => invalidateIncidentQueries(queryClient),
  });
}

export function useAdminIncidentStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ incident, values }: { incident: Incident; values: IncidentStatusFormValues }) =>
      saveAdminIncidentStatus(incident, values),
    onSettled: () => invalidateIncidentQueries(queryClient),
  });
}

export function useAdminIncidentServiceMutation(owner: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, service }: IncidentServiceMutation) => {
      await updateIncidentService(incidentId, service);
      return { incidentId, service };
    },
    onSuccess: ({ incidentId, service }) => {
      updateIncidentCache(queryClient, incidentQueryKeys.admin(owner), incidentId, (incident) => ({
        ...incident,
        service,
      }));
    },
    onSettled: () => invalidateIncidentQueries(queryClient),
  });
}
