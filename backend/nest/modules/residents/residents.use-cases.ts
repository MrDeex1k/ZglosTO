import type {
  AuthSessionUser,
  CurrentCreateIncidentRequest,
  CurrentCreateIncidentResponse,
  CurrentIncidentListItemDto,
  IncidentPage,
  CurrentResolvedIncidentDto,
} from '@zglosto/contracts';
import { isValidReporterEmail, normalizeReporterEmail } from '../../../lib/reporter-identity.ts';
import { badRequest, forbidden, notFound } from '../../application-error.ts';
import { IncidentDomainPort } from '../incidents/incident-domain.port.ts';
import type { IncidentPageRequest } from '../incidents/incident-pagination.ts';
import { IncidentPolicyService } from '../incidents/incident-policy.service.ts';
import { PublicResolvedIncidentCache } from '../incidents/public-resolved-incident-cache.ts';

export class ResidentsUseCases {
  constructor(
    private readonly incidents: IncidentDomainPort,
    private readonly policy: IncidentPolicyService,
    private readonly publicResolvedIncidentCache: PublicResolvedIncidentCache,
  ) {}

  async listOwn(
    user: AuthSessionUser,
    page: IncidentPageRequest | null = null,
  ): Promise<readonly CurrentIncidentListItemDto[] | IncidentPage<CurrentIncidentListItemDto>> {
    await this.incidents.claimAnonymousIncidents(user);
    return page === null
      ? this.incidents.listResidentIncidents(user.id)
      : this.incidents.pageResidentIncidents(user.id, page);
  }

  listResolved(): Promise<readonly CurrentResolvedIncidentDto[]> {
    return this.publicResolvedIncidentCache.list(() => this.incidents.listResolvedIncidents());
  }

  async getResolved(incidentId: string): Promise<CurrentResolvedIncidentDto> {
    const incident = await this.incidents.getResolvedIncident(incidentId);
    if (incident === null) throw notFound('Incident not found');
    return incident;
  }

  create(
    request: CurrentCreateIncidentRequest,
    user: AuthSessionUser | null,
    idempotencyKey?: string,
  ): Promise<CurrentCreateIncidentResponse> {
    const reporterEmail = normalizeReporterEmail(request.mail_zglaszajacego);
    if (!isValidReporterEmail(reporterEmail)) {
      throw badRequest('mail_zglaszajacego must be a valid email address');
    }
    if (user !== null && user.uprawnienia !== 'mieszkaniec') {
      throw forbidden('Only residents can create authenticated incidents');
    }
    if (user !== null && reporterEmail !== normalizeReporterEmail(user.email)) {
      throw badRequest('mail_zglaszajacego must match the authenticated user email');
    }
    const requestedServiceKey = this.policy.requireEnabledServiceKey(
      request.typ_sluzby ?? this.policy.fallbackServiceKey(),
    );
    return this.incidents.createIncident({
      address: request.adres_zgloszenia,
      description: request.opis_zgloszenia,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      imageUploadId: request.zdjecie_incydentu_zglaszanego_upload_id,
      latitude: request.latitude,
      longitude: request.longitude,
      reporterEmail,
      reporterUserId: user?.id ?? null,
      requestedServiceKey,
    });
  }
}
