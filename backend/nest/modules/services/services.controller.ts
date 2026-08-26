import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  IncidentIdParamsSchema,
  IncidentMutationResponseSchema,
  InitiateImageUploadRequestSchema,
  InitiateImageUploadResponseSchema,
  ServiceIncidentStatisticsItemSchema,
  ServiceIncidentListItemSchema,
  ServiceIncidentMutationResponseSchema,
  UpdateIncidentServiceRequestSchema,
  UpdateIncidentStatusRequestSchema,
  UpdateIncidentVerificationRequestSchema,
  UploadResolvedImageRequestSchema,
  type ServiceIncidentListItemDto,
  type IncidentIdParams,
  type InitiateImageUploadRequest,
  type InitiateImageUploadResponse,
  type ServiceIncidentStatisticsItem,
  type UpdateIncidentServiceRequest,
  type UpdateIncidentStatusRequest,
  type UpdateIncidentVerificationRequest,
  type UploadResolvedImageRequest,
  parseIncidentRevisionEtag,
} from '@zglosto/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiContract } from '../../openapi/api-contract.decorator.ts';
import { RequireRoles } from '../auth-bridge/auth.decorators.ts';
import { AuthRequestContext } from '../auth-bridge/auth-request-context.ts';
import type {
  IncidentMutationResponse,
  VersionedIncidentMutationResponse,
} from '../incidents/incident-domain.port.ts';
import { badRequest } from '../../application-error.ts';
import { ServicesUseCases } from './services.use-cases.ts';
import { ImageUploadService } from '../media/image-upload.service.ts';

@ApiTags('services')
@RequireRoles('sluzby')
@Controller('sluzby')
export class ServicesController {
  constructor(
    private readonly useCases: ServicesUseCases,
    private readonly authContext: AuthRequestContext,
    private readonly uploads: ImageUploadService,
  ) {}

  @Get('incydenty')
  @ApiOperation({ summary: 'List incidents assigned to the authenticated service' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [401, 403, 500, 503],
    serializationSchema: ServiceIncidentListItemSchema,
    successSchema: z.array(ServiceIncidentListItemSchema),
  })
  list(@Req() request: Request): Promise<readonly ServiceIncidentListItemDto[]> {
    return this.useCases.list(this.authContext.requireServiceKey(request));
  }

  @Post('incydenty/:id/obrazy/uploads')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a short-lived direct upload for a resolution image' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 413, 500, 503],
    successSchema: InitiateImageUploadResponseSchema,
    successStatus: 201,
  })
  initiateResolutionUpload(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: InitiateImageUploadRequestSchema }) body: InitiateImageUploadRequest,
    @Req() request: Request,
  ): Promise<InitiateImageUploadResponse> {
    return this.uploads.initiateResolution(
      params.id,
      this.authContext.requireServiceKey(request),
      body,
    );
  }

  @Get('statystyki')
  @ApiOperation({ summary: 'List statistics for the authenticated service' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [401, 403, 500, 503],
    serializationSchema: ServiceIncidentStatisticsItemSchema,
    successSchema: z.array(ServiceIncidentStatisticsItemSchema),
  })
  statistics(@Req() request: Request): Promise<readonly ServiceIncidentStatisticsItem[]> {
    return this.useCases.statistics(this.authContext.requireServiceKey(request));
  }

  @Patch('incydenty/:id/status')
  @ApiOperation({ summary: 'Update status of an incident assigned to the service' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 409, 500, 503],
    successSchema: ServiceIncidentMutationResponseSchema,
  })
  updateStatus(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UpdateIncidentStatusRequestSchema }) body: UpdateIncidentStatusRequest,
    @Req() request: Request,
    @Headers('if-match') ifMatch?: string,
  ): Promise<VersionedIncidentMutationResponse> {
    return this.useCases.updateStatus(
      params.id,
      this.authContext.requireServiceKey(request),
      body,
      requiredIncidentRevision(ifMatch),
    );
  }

  @Patch('incydenty/:id/sprawdzenie')
  @ApiOperation({ summary: 'Update verification of an incident assigned to the service' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 409, 500, 503],
    successSchema: ServiceIncidentMutationResponseSchema,
  })
  updateVerification(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UpdateIncidentVerificationRequestSchema })
    body: UpdateIncidentVerificationRequest,
    @Req() request: Request,
    @Headers('if-match') ifMatch?: string,
  ): Promise<VersionedIncidentMutationResponse> {
    return this.useCases.updateVerification(
      params.id,
      this.authContext.requireServiceKey(request),
      body,
      requiredIncidentRevision(ifMatch),
    );
  }

  @Patch('incydenty/:id/typ')
  @ApiOperation({ summary: 'Transfer an incident assigned to the service' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 409, 500, 503],
    successSchema: ServiceIncidentMutationResponseSchema,
  })
  updateService(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UpdateIncidentServiceRequestSchema }) body: UpdateIncidentServiceRequest,
    @Req() request: Request,
    @Headers('if-match') ifMatch?: string,
  ): Promise<VersionedIncidentMutationResponse> {
    return this.useCases.updateService(
      params.id,
      this.authContext.requireServiceKey(request),
      body,
      requiredIncidentRevision(ifMatch),
    );
  }

  @Post('incydenty/:id/zdjecie_rozwiazane')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload the resolution image for an assigned incident' })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 404, 413, 500, 503],
    successSchema: IncidentMutationResponseSchema,
  })
  uploadResolutionImage(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Body({ schema: UploadResolvedImageRequestSchema }) body: UploadResolvedImageRequest,
    @Req() request: Request,
  ): Promise<IncidentMutationResponse> {
    return this.useCases.uploadResolutionImage(
      params.id,
      this.authContext.requireServiceKey(request),
      body,
    );
  }
}

function requiredIncidentRevision(value?: string): number {
  const revision = parseIncidentRevisionEtag(value);
  if (revision === null) {
    throw badRequest('If-Match must contain a current incident revision');
  }
  return revision;
}
