import type {
  AdminIncidentStatisticsItem,
  CurrentDatabaseIncidentDto,
  CurrentIncidentListItemDto,
  UpdateIncidentServiceRequest,
  UpdateIncidentStatusRequest,
  UpdateIncidentVerificationRequest,
  UpdateUserPermissionsRequest,
  UpdateUserPermissionsResponse,
} from '@zglosto/contracts';
import { notFound } from '../../application-error.ts';
import {
  IncidentDomainPort,
  type IncidentMutationResponse,
} from '../incidents/incident-domain.port.ts';
import { IncidentPolicyService } from '../incidents/incident-policy.service.ts';
import { PublicResolvedIncidentCache } from '../incidents/public-resolved-incident-cache.ts';

export class AdminUseCases {
  constructor(
    private readonly incidents: IncidentDomainPort,
    private readonly policy: IncidentPolicyService,
    private readonly publicResolvedIncidentCache: PublicResolvedIncidentCache,
  ) {}

  list(): Promise<readonly CurrentIncidentListItemDto[]> {
    return this.incidents.listAdminIncidents();
  }

  statistics(): Promise<readonly AdminIncidentStatisticsItem[]> {
    return this.incidents.listAdminStatistics();
  }

  async updateStatus(
    incidentId: string,
    request: UpdateIncidentStatusRequest,
  ): Promise<IncidentMutationResponse> {
    const response = this.mutationResult(
      await this.incidents.updateAdminIncidentStatus(incidentId, request.status_incydentu),
    );
    await this.publicResolvedIncidentCache.invalidate();
    return response;
  }

  async updateVerification(
    incidentId: string,
    request: UpdateIncidentVerificationRequest,
  ): Promise<IncidentMutationResponse> {
    return this.mutationResult(
      await this.incidents.updateAdminIncidentVerification(
        incidentId,
        request.sprawdzenie_incydentu,
      ),
    );
  }

  async updateService(
    incidentId: string,
    request: UpdateIncidentServiceRequest,
  ): Promise<IncidentMutationResponse> {
    const serviceKey = this.policy.requireEnabledServiceKey(request.typ_sluzby);
    const response = this.mutationResult(
      await this.incidents.updateAdminIncidentService(incidentId, serviceKey),
    );
    await this.publicResolvedIncidentCache.invalidate();
    return response;
  }

  async updateUserPermissions(
    request: UpdateUserPermissionsRequest,
  ): Promise<UpdateUserPermissionsResponse> {
    const serviceKey =
      request.serviceKey === null ? null : this.policy.requireEnabledServiceKey(request.serviceKey);
    const updated = await this.incidents.updateUserPermissions({
      email: request.email,
      role: request.uprawnienia,
      serviceKey,
    });
    if (updated === null) {
      throw notFound('User not found');
    }
    return { success: true, updated };
  }

  private mutationResult(incident: CurrentDatabaseIncidentDto | null): IncidentMutationResponse {
    if (incident === null) {
      throw notFound('incydent not found');
    }
    return { success: true, incydent: incident };
  }
}
