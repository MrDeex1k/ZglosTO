import { Injectable } from '@nestjs/common';
import { badRequest } from '../../application-error.ts';
import { WhiteLabelConfigService } from '../white-label/white-label-config.service.ts';

@Injectable()
export class IncidentPolicyService {
  constructor(private readonly whiteLabel: WhiteLabelConfigService) {}

  fallbackServiceKey(): string {
    return this.whiteLabel.serviceCatalog.fallbackServiceKey;
  }

  requireEnabledServiceKey(value: string): string {
    try {
      return this.whiteLabel.serviceCatalog.requireEnabledServiceKey(value);
    } catch (error: unknown) {
      throw badRequest(error instanceof Error ? error.message : 'Invalid serviceKey');
    }
  }
}
