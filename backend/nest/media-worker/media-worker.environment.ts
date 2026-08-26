import { z } from 'zod';

const MediaWorkerEnvironmentSchema = z
  .object({
    MEDIA_WORKER_HEALTH_FILE: z.string().trim().min(1).default('/tmp/zglosto-media-worker.json'),
    MEDIA_WORKER_HEALTH_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
    MEDIA_WORKER_HEALTH_STALE_MS: z.coerce.number().int().min(3_000).default(20_000),
    MEDIA_WORKER_PREFETCH: z.coerce.number().int().min(1).max(16).default(1),
    MEDIA_MAX_INPUT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(5 * 1024 * 1024),
    MEDIA_MAX_INPUT_HEIGHT: z.coerce.number().int().min(1).default(8_192),
    MEDIA_MAX_INPUT_PIXELS: z.coerce.number().int().min(1).default(32_000_000),
    MEDIA_MAX_INPUT_WIDTH: z.coerce.number().int().min(1).default(8_192),
    MEDIA_MAX_OUTPUT_DIMENSION: z.coerce.number().int().min(1).default(2_000),
    MEDIA_SHARP_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
    MEDIA_WEBP_EFFORT: z.coerce.number().int().min(0).max(6).default(4),
    MEDIA_WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(85),
  })
  .superRefine((environment, context) => {
    if (
      environment.MEDIA_WORKER_HEALTH_STALE_MS <
      environment.MEDIA_WORKER_HEALTH_INTERVAL_MS * 2
    ) {
      context.addIssue({
        code: 'custom',
        message: 'MEDIA_WORKER_HEALTH_STALE_MS must be at least twice the probe interval',
        path: ['MEDIA_WORKER_HEALTH_STALE_MS'],
      });
    }
  })
  .transform((environment) => ({
    healthFile: environment.MEDIA_WORKER_HEALTH_FILE,
    healthIntervalMs: environment.MEDIA_WORKER_HEALTH_INTERVAL_MS,
    healthStaleMs: environment.MEDIA_WORKER_HEALTH_STALE_MS,
    maxInputBytes: environment.MEDIA_MAX_INPUT_BYTES,
    maxInputHeight: environment.MEDIA_MAX_INPUT_HEIGHT,
    maxInputPixels: environment.MEDIA_MAX_INPUT_PIXELS,
    maxInputWidth: environment.MEDIA_MAX_INPUT_WIDTH,
    maxOutputDimension: environment.MEDIA_MAX_OUTPUT_DIMENSION,
    prefetch: environment.MEDIA_WORKER_PREFETCH,
    sharpConcurrency: environment.MEDIA_SHARP_CONCURRENCY,
    webpEffort: environment.MEDIA_WEBP_EFFORT,
    webpQuality: environment.MEDIA_WEBP_QUALITY,
  }));

export type MediaWorkerEnvironment = z.infer<typeof MediaWorkerEnvironmentSchema>;

export function parseMediaWorkerEnvironment(
  environment: NodeJS.ProcessEnv,
): MediaWorkerEnvironment {
  return MediaWorkerEnvironmentSchema.parse(environment);
}
