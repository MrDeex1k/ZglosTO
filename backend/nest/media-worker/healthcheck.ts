import { isMediaWorkerHealthy } from './media-worker.health.ts';
import { parseMediaWorkerEnvironment } from './media-worker.environment.ts';

const environment = parseMediaWorkerEnvironment(process.env);
process.exitCode = isMediaWorkerHealthy(environment.healthFile, environment.healthStaleMs) ? 0 : 1;
