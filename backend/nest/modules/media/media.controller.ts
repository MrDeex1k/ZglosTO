import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import {
  IncidentIdParamsSchema,
  StructuredApiErrorResponseSchema,
  type IncidentIdParams,
} from '@zglosto/contracts';
import {
  ApiCookieAuth,
  ApiNotModifiedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthRequestContext } from '../auth-bridge/auth-request-context.ts';
import { OptionalSession } from '../auth-bridge/auth.decorators.ts';
import { IncidentMediaService } from './incident-media.service.ts';

@ApiTags('images')
@Controller('images')
export class MediaController {
  constructor(
    private readonly media: IncidentMediaService,
    private readonly authContext: AuthRequestContext,
  ) {}

  @Get(':id')
  @OptionalSession()
  @ApiOperation({ summary: 'Read an incident image under the resource access policy' })
  @ApiCookieAuth('session')
  @ApiProduces('image/avif', 'image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({
    content: {
      'image/*': { schema: { format: 'binary', type: 'string' } },
    },
    description: 'Image bytes',
  })
  @ApiNotModifiedResponse({ description: 'The ETag matches the active representation' })
  @ApiResponse({ status: 401, standardSchema: StructuredApiErrorResponseSchema })
  @ApiResponse({ status: 403, standardSchema: StructuredApiErrorResponseSchema })
  @ApiResponse({ status: 404, standardSchema: StructuredApiErrorResponseSchema })
  @ApiResponse({ status: 500, standardSchema: StructuredApiErrorResponseSchema })
  @ApiResponse({ status: 503, standardSchema: StructuredApiErrorResponseSchema })
  async getImage(
    @Param({ schema: IncidentIdParamsSchema }) params: IncidentIdParams,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.media.authorizeForHttp(params.id, this.authContext.user(request));
    const etag = `"sha256-${image.checksumSha256}"`;
    response.setHeader('Cache-Control', image.cacheControl);
    response.setHeader('ETag', etag);
    if (request.headers['if-none-match'] === etag) {
      response.status(304).end();
      return;
    }
    const object = await this.media.loadBody(image);
    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Length', String(object.sizeBytes));
    response.send(Buffer.from(object.body));
  }
}
