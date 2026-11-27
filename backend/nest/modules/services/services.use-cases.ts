import type {
  CurrentDatabaseIncidentDto,
  ServiceIncidentListItemDto,
  IncidentPage,
  ServiceIncidentStatisticsItem,
  UpdateIncidentServiceRequest,
  UpdateIncidentStatusRequest,
  UpdateIncidentVerificationRequest,
  UploadResolvedImageRequest,
} from '@zglosto/contracts';
import { conflict, notFound } from '../../application-error.ts';
import {
  IncidentDomainPort,
  type IncidentMutationResponse,
  type ServiceIncidentMutationResult,
  type VersionedIncidentMutationResponse,
} from '../incidents/incident-domain.port.ts';
import type { IncidentPageRequest } from '../incidents/incident-pagination.ts';
import { IncidentPolicyService } from '../incidents/incident-policy.service.ts';
import { PublicResolvedIncidentCache } from '../incidents/public-resolved-incident-cache.ts';

export class ServicesUseCases {
  constructor(
    private readonly incidents: IncidentDomainPort,
    private readonly policy: IncidentPolicyService,
    private readonly publicResolvedIncidentCache: PublicResolvedIncidentCache,
  ) {}

  list(
    serviceKey: string,
    page: IncidentPageRequest | null = null,
  ): Promise<readonly ServiceIncidentListItemDto[] | IncidentPage<ServiceIncidentListItemDto>> {
    return page === null
      ? this.incidents.listServiceIncidents(serviceKey)
      : this.incidents.pageServiceIncidents(serviceKey, page);
  }

  async get(serviceKey: string, incidentId: string): Promise<ServiceIncidentListItemDto> {
    const incident = await this.incidents.getServiceIncident(serviceKey, incidentId);
    if (incident === null) throw notFound('Incident not found');
    return incident;
  }

  statistics(serviceKey: string): Promise<readonly ServiceIncidentStatisticsItem[]> {
    return this.incidents.listServiceStatistics(serviceKey);
  }

  async updateStatus(
    incidentId: string,
    serviceKey: string,
    request: UpdateIncidentStatusRequest,
    expectedRevision: number,
  ): Promise<VersionedIncidentMutationResponse> {
    const response = this.versionedMutationResult(
      await this.incidents.updateServiceIncidentStatus(
        incidentId,
        serviceKey,
        request.status_incydentu,
        expectedRevision,
      ),
    );
    await this.publicResolvedIncidentCache.invalidate();
    return response;
  }

  async updateVerification(
    incidentId: string,
    serviceKey: string,
    request: UpdateIncidentVerificationRequest,
    expectedRevision: number,
  ): Promise<VersionedIncidentMutationResponse> {
    return this.versionedMutationResult(
      await this.incidents.updateServiceIncidentVerification(
        incidentId,
        serviceKey,
        request.sprawdzenie_incydentu,
        expectedRevision,
      ),
    );
  }

  async updateService(
    incidentId: string,
    currentServiceKey: string,
    request: UpdateIncidentServiceRequest,
    expectedRevision: number,
  ): Promise<VersionedIncidentMutationResponse> {
    const targetServiceKey = this.policy.requireEnabledServiceKey(request.typ_sluzby);
    const response = this.versionedMutationResult(
      await this.incidents.updateServiceIncidentService(
        incidentId,
        currentServiceKey,
        targetServiceKey,
        expectedRevision,
      ),
    );
    await this.publicResolvedIncidentCache.invalidate();
    return response;
  }

  async uploadResolutionImage(
    incidentId: string,
    serviceKey: string,
    request: UploadResolvedImageRequest,
  ): Promise<IncidentMutationResponse> {
    const response = this.mutationResult(
      await this.incidents.uploadResolutionImage(incidentId, serviceKey, request.uploadId),
    );
    await this.publicResolvedIncidentCache.invalidate();
    return response;
  }

  private mutationResult(incident: CurrentDatabaseIncidentDto | null): IncidentMutationResponse {
    if (incident === null) {
      throw notFound('incydent not found');
    }
    return { success: true, incydent: incident };
  }

  private versionedMutationResult(
    result: ServiceIncidentMutationResult,
  ): VersionedIncidentMutationResponse {
    if (result.kind === 'not-found') throw notFound('incydent not found');
    if (result.kind === 'conflict') {
      throw conflict('incydent changed; refresh before retrying');
    }
    return {
      success: true,
      incydent: result.value.incident,
      revision: result.value.revision,
    };
  }
}
