import { Injectable } from '@nestjs/common';
import type {
  AdminIncidentStatisticsItem,
  AuthSessionUser,
  CurrentCreateIncidentResponse,
  CurrentDatabaseIncidentDto,
  CurrentIncidentListItemDto,
  CurrentResolvedIncidentDto,
  IncidentStatusCode,
  ServiceIncidentStatisticsItem,
  ServiceIncidentListItemDto,
  UpdatedUserPermissions,
  UserRole,
} from '@zglosto/contracts';
import { unavailable } from '../../application-error.ts';

export interface CreateIncidentCommand {
  address: string;
  description: string;
  imageUploadId: string | null;
  latitude: number | null;
  longitude: number | null;
  reporterEmail: string;
  reporterUserId: string | null;
  requestedServiceKey: string;
}

export interface UpdateUserPermissionsCommand {
  email: string;
  role: UserRole;
  serviceKey: string | null;
}

export interface IncidentMutationResponse {
  success: true;
  incydent: CurrentDatabaseIncidentDto;
}

export interface VersionedIncidentMutationResponse extends IncidentMutationResponse {
  revision: number;
}

interface VersionedIncidentMutation {
  incident: CurrentDatabaseIncidentDto;
  revision: number;
}

export type ServiceIncidentMutationResult =
  | { kind: 'conflict' }
  | { kind: 'not-found' }
  | { kind: 'updated'; value: VersionedIncidentMutation };

export abstract class IncidentDomainPort {
  abstract claimAnonymousIncidents(user: AuthSessionUser): Promise<void>;
  abstract createIncident(command: CreateIncidentCommand): Promise<CurrentCreateIncidentResponse>;
  abstract listAdminIncidents(): Promise<readonly CurrentIncidentListItemDto[]>;
  abstract listAdminStatistics(): Promise<readonly AdminIncidentStatisticsItem[]>;
  abstract listResidentIncidents(userId: string): Promise<readonly CurrentIncidentListItemDto[]>;
  abstract listResolvedIncidents(): Promise<readonly CurrentResolvedIncidentDto[]>;
  abstract listServiceIncidents(serviceKey: string): Promise<readonly ServiceIncidentListItemDto[]>;
  abstract listServiceStatistics(
    serviceKey: string,
  ): Promise<readonly ServiceIncidentStatisticsItem[]>;
  abstract updateAdminIncidentService(
    incidentId: string,
    serviceKey: string,
  ): Promise<CurrentDatabaseIncidentDto | null>;
  abstract updateAdminIncidentStatus(
    incidentId: string,
    status: IncidentStatusCode,
  ): Promise<CurrentDatabaseIncidentDto | null>;
  abstract updateAdminIncidentVerification(
    incidentId: string,
    verified: boolean,
  ): Promise<CurrentDatabaseIncidentDto | null>;
  abstract updateServiceIncidentService(
    incidentId: string,
    currentServiceKey: string,
    targetServiceKey: string,
    expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult>;
  abstract updateServiceIncidentStatus(
    incidentId: string,
    serviceKey: string,
    status: IncidentStatusCode,
    expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult>;
  abstract updateServiceIncidentVerification(
    incidentId: string,
    serviceKey: string,
    verified: boolean,
    expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult>;
  abstract updateUserPermissions(
    command: UpdateUserPermissionsCommand,
  ): Promise<UpdatedUserPermissions | null>;
  abstract uploadResolutionImage(
    incidentId: string,
    serviceKey: string,
    imageUploadId: string,
  ): Promise<CurrentDatabaseIncidentDto | null>;
}

@Injectable()
export class PendingIncidentInfrastructureAdapter extends IncidentDomainPort {
  private pending<Result>(): Promise<Result> {
    return Promise.reject(
      unavailable('NestJS domain infrastructure will be connected in Phase 6 step 8'),
    );
  }

  claimAnonymousIncidents(_user: AuthSessionUser): Promise<void> {
    return this.pending();
  }

  createIncident(_command: CreateIncidentCommand): Promise<CurrentCreateIncidentResponse> {
    return this.pending();
  }

  listAdminIncidents(): Promise<readonly CurrentIncidentListItemDto[]> {
    return this.pending();
  }

  listAdminStatistics(): Promise<readonly AdminIncidentStatisticsItem[]> {
    return this.pending();
  }

  listResidentIncidents(_userId: string): Promise<readonly CurrentIncidentListItemDto[]> {
    return this.pending();
  }

  listResolvedIncidents(): Promise<readonly CurrentResolvedIncidentDto[]> {
    return this.pending();
  }

  listServiceIncidents(_serviceKey: string): Promise<readonly ServiceIncidentListItemDto[]> {
    return this.pending();
  }

  listServiceStatistics(_serviceKey: string): Promise<readonly ServiceIncidentStatisticsItem[]> {
    return this.pending();
  }

  updateAdminIncidentService(
    _incidentId: string,
    _serviceKey: string,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    return this.pending();
  }

  updateAdminIncidentStatus(
    _incidentId: string,
    _status: IncidentStatusCode,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    return this.pending();
  }

  updateAdminIncidentVerification(
    _incidentId: string,
    _verified: boolean,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    return this.pending();
  }

  updateServiceIncidentService(
    _incidentId: string,
    _currentServiceKey: string,
    _targetServiceKey: string,
    _expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult> {
    return this.pending();
  }

  updateServiceIncidentStatus(
    _incidentId: string,
    _serviceKey: string,
    _status: IncidentStatusCode,
    _expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult> {
    return this.pending();
  }

  updateServiceIncidentVerification(
    _incidentId: string,
    _serviceKey: string,
    _verified: boolean,
    _expectedRevision: number,
  ): Promise<ServiceIncidentMutationResult> {
    return this.pending();
  }

  updateUserPermissions(
    _command: UpdateUserPermissionsCommand,
  ): Promise<UpdatedUserPermissions | null> {
    return this.pending();
  }

  uploadResolutionImage(
    _incidentId: string,
    _serviceKey: string,
    _imageUploadId: string,
  ): Promise<CurrentDatabaseIncidentDto | null> {
    return this.pending();
  }
}
