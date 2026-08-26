import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IncidentStatusCode } from '@zglosto/contracts';

import { toIncidentDisplayStatus } from '../lib/incident-status';
import {
  incidentQueryKeys,
  invalidateIncidentQueries,
  updateIncidentCache,
} from '../queries/incidents';
import {
  createIncident,
  updateIncidentService,
  updateIncidentStatus,
  updateIncidentStatusService,
  updateIncidentVerification,
  updateIncidentVerificationService,
  uploadResolvedImageService,
} from '../services/api';

interface IncidentStatusMutation {
  incidentId: string;
  checked: boolean;
  adminStatus: IncidentStatusCode;
  resolvedImageFile: File | null;
}

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

export function useServiceIncidentMutation(owner: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      checked,
      adminStatus,
      resolvedImageFile,
    }: IncidentStatusMutation) => {
      await updateIncidentStatusService(incidentId, adminStatus);
      await updateIncidentVerificationService(incidentId, checked);
      if (resolvedImageFile !== null) {
        await uploadResolvedImageService(incidentId, resolvedImageFile);
      }
      return { incidentId, checked, adminStatus, resolvedImageFile };
    },
    onSuccess: ({ incidentId, checked, adminStatus }) => {
      updateIncidentCache(
        queryClient,
        incidentQueryKeys.service(owner),
        incidentId,
        (incident) => ({
          ...incident,
          checked,
          adminStatus,
          status: toIncidentDisplayStatus(adminStatus),
          resolvedImageUrl: incident.resolvedImageUrl,
        }),
      );
    },
    onSettled: () => invalidateIncidentQueries(queryClient),
  });
}

export function useAdminIncidentStatusMutation(owner: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, checked, adminStatus }: IncidentStatusMutation) => {
      await updateIncidentStatus(incidentId, adminStatus);
      await updateIncidentVerification(incidentId, checked);
      return { incidentId, checked, adminStatus };
    },
    onSuccess: ({ incidentId, checked, adminStatus }) => {
      updateIncidentCache(queryClient, incidentQueryKeys.admin(owner), incidentId, (incident) => ({
        ...incident,
        checked,
        adminStatus,
        status: toIncidentDisplayStatus(adminStatus),
      }));
    },
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
