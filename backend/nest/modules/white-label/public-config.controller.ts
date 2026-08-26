import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { publicCityConfigResponseSchema, type PublicCityConfigResponse } from '@zglosto/contracts';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ifNoneMatchMatches } from '../../../lib/public-config.ts';
import { PublicEndpoint } from '../auth-bridge/auth.decorators.ts';
import { WhiteLabelConfigService } from './white-label-config.service.ts';

@ApiTags('configuration')
@PublicEndpoint()
@Controller('config')
export class PublicConfigController {
  constructor(private readonly config: WhiteLabelConfigService) {}

  @Get('public')
  @ApiOperation({ summary: 'Public configuration for the active city' })
  @ApiOkResponse({
    description: 'Versioned public White-Label configuration',
    standardSchema: publicCityConfigResponseSchema,
  })
  @ApiResponse({ description: 'The client already has the active representation', status: 304 })
  getPublicConfig(@Req() request: Request, @Res() response: Response): void {
    response.setHeader('Cache-Control', this.config.cacheControl);
    response.setHeader('ETag', this.config.etag);

    if (ifNoneMatchMatches(request.get('If-None-Match') ?? null, this.config.etag)) {
      response.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    const payload: PublicCityConfigResponse = publicCityConfigResponseSchema.parse(
      this.config.publicResponse,
    );
    response.status(HttpStatus.OK).json(payload);
  }
}
