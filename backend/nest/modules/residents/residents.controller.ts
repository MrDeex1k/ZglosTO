import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  CurrentCreateIncidentRequestSchema,
  CurrentCreateIncidentResponseSchema,
  CurrentIncidentListItemSchema,
  CurrentIncidentPageSchema,
  IncidentListQuerySchema,
  type IncidentListQuery,
  type IncidentPage,
  CurrentResolvedIncidentSchema,
  InitiateImageUploadRequestSchema,
  InitiateImageUploadResponseSchema,
  type CurrentCreateIncidentRequest,
  type CurrentCreateIncidentResponse,
  type CurrentIncidentListItemDto,
  type CurrentResolvedIncidentDto,
  type InitiateImageUploadRequest,
  type InitiateImageUploadResponse,
} from '@zglosto/contracts';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../application-error.ts';
import { ApiContract } from '../../openapi/api-contract.decorator.ts';
import {
  RUNTIME_CONFIGURATION,
  type RuntimeConfiguration,
} from '../../platform/runtime-configuration.ts';
import { incidentPageRequest } from '../incidents/incident-pagination.ts';
import { OptionalSession, PublicEndpoint, RequireRoles } from '../auth-bridge/auth.decorators.ts';
import { AuthRequestContext } from '../auth-bridge/auth-request-context.ts';
import { ResidentsUseCases } from './residents.use-cases.ts';
import { DistributedIncidentRateLimitInterceptor } from './distributed-incident-rate-limit.interceptor.ts';
import { homepageNginxCacheTtlSeconds } from './homepage-nginx-cache.ts';
import { ImageUploadService } from '../media/image-upload.service.ts';

@ApiTags('residents')
@Controller('mieszkaniec')
export class ResidentsController {
  readonly #homepageNginxTtlSeconds: number;

  constructor(
    private readonly useCases: ResidentsUseCases,
    private readonly authContext: AuthRequestContext,
    private readonly uploads: ImageUploadService,
    @Inject(RUNTIME_CONFIGURATION) configuration: RuntimeConfiguration,
  ) {
    this.#homepageNginxTtlSeconds = homepageNginxCacheTtlSeconds(
      configuration.redis.mode,
      configuration.homepageCache,
    );
  }

  @Post('obrazy/uploads')
  @HttpCode(HttpStatus.CREATED)
  @OptionalSession()
  @UseInterceptors(DistributedIncidentRateLimitInterceptor)
  @ApiOperation({ summary: 'Create a short-lived direct upload for a report image' })
  @ApiContract({
    authenticated: false,
    errorStatuses: [400, 413, 429, 500, 503],
    successSchema: InitiateImageUploadResponseSchema,
    successStatus: 201,
  })
  initiateReportUpload(
    @Body({ schema: InitiateImageUploadRequestSchema }) body: InitiateImageUploadRequest,
  ): Promise<InitiateImageUploadResponse> {
    return this.uploads.initiateReport(body);
  }

  @Get('incydenty')
  @RequireRoles('mieszkaniec')
  @ApiOperation({ summary: 'List incidents belonging to the authenticated resident' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiContract({
    authenticated: true,
    errorStatuses: [400, 401, 403, 500, 503],
    serializationSchema: z.union([CurrentIncidentListItemSchema, CurrentIncidentPageSchema]),
    successSchema: z.union([z.array(CurrentIncidentListItemSchema), CurrentIncidentPageSchema]),
  })
  listOwn(
    @Req() request: Request,
    @Query({ schema: IncidentListQuerySchema }) query: IncidentListQuery,
  ): Promise<readonly CurrentIncidentListItemDto[] | IncidentPage<CurrentIncidentListItemDto>> {
    return this.useCases.listOwn(this.authContext.requireUser(request), incidentPageRequest(query));
  }

  @Get('incydenty/glowna')
  @PublicEndpoint()
  @ApiOperation({ summary: 'List public resolved incidents' })
  @ApiContract({
    authenticated: false,
    errorStatuses: [500],
    serializationSchema: CurrentResolvedIncidentSchema,
    successSchema: z.array(CurrentResolvedIncidentSchema),
  })
  async listResolved(
    @Res({ passthrough: true }) response: Response,
  ): Promise<readonly CurrentResolvedIncidentDto[]> {
    const incidents = await this.useCases.listResolved();
    response.setHeader('X-Accel-Expires', this.#homepageNginxTtlSeconds);
    return incidents;
  }

  @Get('incydenty/glowna/:id')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Get a public resolved incident by ID' })
  @ApiContract({
    authenticated: false,
    errorStatuses: [404, 500],
    successSchema: CurrentResolvedIncidentSchema,
  })
  getResolved(@Param('id') id: string): Promise<CurrentResolvedIncidentDto> {
    if (!z.guid().safeParse(id).success) throw notFound('Incident not found');
    return this.useCases.getResolved(id);
  }

  @Post('incydenty')
  @HttpCode(HttpStatus.CREATED)
  @OptionalSession()
  @UseInterceptors(DistributedIncidentRateLimitInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOperation({ summary: 'Create an incident with an optional verified resident session' })
  @ApiContract({
    authenticated: false,
    errorStatuses: [400, 401, 403, 409, 413, 429, 500, 503],
    successSchema: CurrentCreateIncidentResponseSchema,
    successStatus: 201,
  })
  create(
    @Body({ schema: CurrentCreateIncidentRequestSchema }) body: CurrentCreateIncidentRequest,
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CurrentCreateIncidentResponse> {
    if (idempotencyKey != null && !z.uuidv4().safeParse(idempotencyKey).success) {
      throw badRequest('Idempotency-Key must be a UUID v4');
    }
    return this.useCases.create(body, this.authContext.user(request), idempotencyKey);
  }
}
