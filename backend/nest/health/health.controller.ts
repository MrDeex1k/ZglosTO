import { Controller, Get, HttpStatus, Res, SerializeOptions } from '@nestjs/common';
import {
  BackendLivenessResponseSchema,
  BackendReadinessAvailableResponseSchema,
  BackendReadinessFailureResponseSchema,
  BackendReadinessResponseSchema,
  type BackendLivenessResponse,
  type BackendReadinessResponse,
} from '@zglosto/contracts';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PublicEndpoint } from '../modules/auth-bridge/auth.decorators.ts';
import { HealthService } from './health.service.ts';

@ApiTags('health')
@PublicEndpoint()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Backend process liveness' })
  @ApiOkResponse({ standardSchema: BackendLivenessResponseSchema })
  @SerializeOptions({ schema: BackendLivenessResponseSchema })
  liveness(): BackendLivenessResponse {
    return this.health.liveness();
  }

  @Get()
  @ApiOperation({ summary: 'Backward-compatible backend dependency readiness' })
  @ApiOkResponse({ standardSchema: BackendReadinessAvailableResponseSchema })
  @ApiServiceUnavailableResponse({ standardSchema: BackendReadinessFailureResponseSchema })
  @SerializeOptions({ schema: BackendReadinessResponseSchema })
  readinessAlias(
    @Res({ passthrough: true }) response: Response,
  ): Promise<BackendReadinessResponse> {
    return this.readiness(response);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Backend dependency readiness' })
  @ApiOkResponse({ standardSchema: BackendReadinessAvailableResponseSchema })
  @ApiServiceUnavailableResponse({ standardSchema: BackendReadinessFailureResponseSchema })
  @SerializeOptions({ schema: BackendReadinessResponseSchema })
  async readiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<BackendReadinessResponse> {
    const readiness = await this.health.readiness();
    response.status(readiness.status === 'error' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return readiness;
  }
}
