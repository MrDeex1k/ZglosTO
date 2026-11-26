import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  IncidentIdParamsSchema,
  AdminIncidentStatisticsItemSchema,
  CurrentIncidentListItemSchema,
  CurrentIncidentPageSchema,
  INCIDENT_STATUSES,
  IncidentListQuerySchema,
  type IncidentListQuery,
  type IncidentPage,
  IncidentMutationResponseSchema,
  UpdateIncidentServiceRequestSchema,
  UpdateIncidentStatusRequestSchema,
  UpdateIncidentVerificationRequestSchema,
  UpdateUserPermissionsRequestSchema,
  UpdateUserPermissionsResponseSchema,
  type AdminIncidentStatisticsItem,
  type CurrentIncidentListItemDto,
  type IncidentIdParams,
  type UpdateIncidentServiceRequest,
  type UpdateIncidentStatusRequest,
  type UpdateIncidentVerificationRequest,
  type UpdateUserPermissionsRequest,
  type UpdateUserPermissionsResponse,
} from '@zglosto/contracts';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiContract } from '../../openapi/api-contract.decorator.ts';
import { incidentPageRequest } from '../incidents/incident-pagination.ts';
import { RequireRoles } from '../auth-bridge/auth.decorators.ts';
import type { IncidentMutationResponse } from '../incidents/incident-domain.port.ts';
import { AdminUseCases } from './admin.use-cases.ts';

@ApiTags('admin')
@RequireRoles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly useCases: AdminUseCases) {}

  @Get('statystyki')
  @ApiOperation({ summary: 'List global incident statistics' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [401, 403, 500, 503],
    serializationSchema: AdminIncidentStatisticsItemSchema,
    successSchema: z.array(AdminIncidentStatisticsItemSchema),
  })
  statistics(): Promise<readonly AdminIncidentStatisticsItem[]> {
    return this.useCases.statistics();
  }

  @Get('incydenty')
  @ApiOperation({ summary: 'List all incidents' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: INCIDENT_STATUSES })
  @ApiQuery({ name: 'serviceKey', required: false, type: String })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 500, 503],
    serializationSchema: z.union([CurrentIncidentListItemSchema, CurrentIncidentPageSchema]),
    successSchema: z.union([z.array(CurrentIncidentListItemSchema), CurrentIncidentPageSchema]),
  })
  list(
    @Query({ schema: IncidentListQuerySchema }) query: IncidentListQuery,
  ): Promise<readonly CurrentIncidentListItemDto[] | IncidentPage<CurrentIncidentListItemDto>> {
    return this.useCases.list(incidentPageRequest(query));
  }

  @Patch('incydenty/:id/sprawdzenie')
  @ApiOperation({ summary: 'Update incident verification' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 500, 503],
    successSchema: IncidentMutationResponseSchema,
  })
  updateVerification(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UpdateIncidentVerificationRequestSchema })
    body: UpdateIncidentVerificationRequest,
  ): Promise<IncidentMutationResponse> {
    return this.useCases.updateVerification(params.id, body);
  }

  @Patch('incydenty/:id/typ')
  @ApiOperation({ summary: 'Assign an incident to a service' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 500, 503],
    successSchema: IncidentMutationResponseSchema,
  })
  updateService(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UpdateIncidentServiceRequestSchema }) body: UpdateIncidentServiceRequest,
  ): Promise<IncidentMutationResponse> {
    return this.useCases.updateService(params.id, body);
  }

  @Patch('incydenty/:id/status')
  @ApiOperation({ summary: 'Update incident status' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 500, 503],
    successSchema: IncidentMutationResponseSchema,
  })
  updateStatus(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UpdateIncidentStatusRequestSchema }) body: UpdateIncidentStatusRequest,
  ): Promise<IncidentMutationResponse> {
    return this.useCases.updateStatus(params.id, body);
  }

  @Patch('uzytkownicy/service-key')
  @ApiOperation({ summary: 'Update a user role and service assignment' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 500, 503],
    successSchema: UpdateUserPermissionsResponseSchema,
  })
  updateUserPermissions(
    @Body({ schema: UpdateUserPermissionsRequestSchema }) body: UpdateUserPermissionsRequest,
  ): Promise<UpdateUserPermissionsResponse> {
    return this.useCases.updateUserPermissions(body);
  }
}
