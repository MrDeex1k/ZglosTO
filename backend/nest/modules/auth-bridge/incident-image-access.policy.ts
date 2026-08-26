import { Injectable } from '@nestjs/common';
import type { AuthSessionUser } from '@zglosto/contracts';
import {
  incidentImageAccess,
  type IncidentImageAccessDecision,
  type IncidentImageAccessResource,
} from '../../../lib/incident-image-access.ts';

@Injectable()
export class IncidentImageAccessPolicy {
  evaluate(
    user: AuthSessionUser | null,
    resource: IncidentImageAccessResource,
  ): IncidentImageAccessDecision {
    return incidentImageAccess(user, resource);
  }
}
