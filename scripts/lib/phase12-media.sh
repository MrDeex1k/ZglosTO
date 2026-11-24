#!/usr/bin/env bash

verify_phase12_media_jobs() {
  local report=$1 compose_command=$2
  local targets states waiting failed actual expected _attempt
  targets=$(bun -e '
    import { readFileSync } from "node:fs";
    const report = JSON.parse(readFileSync(process.argv[1], "utf8"));
    const { mediaTargets } = report;
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (report.scenario !== "incident-write" || report.passed !== true ||
        !Array.isArray(mediaTargets) || mediaTargets.length === 0 ||
        mediaTargets.length !== report.requests - report.failures ||
        new Set(mediaTargets.map(({ imageId }) => imageId)).size !== mediaTargets.length ||
        new Set(mediaTargets.map(({ incidentId }) => incidentId)).size !== mediaTargets.length ||
        !mediaTargets.every(({ incidentId, imageId }) =>
          typeof incidentId === "string" && uuid.test(incidentId) &&
          typeof imageId === "string" && uuid.test(imageId))) {
      throw new Error("Missing or invalid incident-write media targets");
    }
    process.stdout.write(JSON.stringify(mediaTargets.map(({ incidentId, imageId }) =>
      ({ incident_id: incidentId, image_id: imageId }))));
  ' "$report") || return

  local query
  query=$(cat <<SQL
WITH expected AS (
    SELECT * FROM jsonb_to_recordset('$targets'::jsonb) AS target(incident_id uuid, image_id uuid)
), states AS (
    SELECT CASE
        WHEN job.status IN ('pending', 'published', 'processing') THEN 'waiting'
        WHEN job.status = 'succeeded' AND image.status = 'ready'
          AND image.processed_object_key IS NOT NULL AND image.processed_mime_type = 'image/webp'
          THEN CASE WHEN image.original_deleted_at IS NULL THEN 'waiting' ELSE 'ready' END
        ELSE 'failed'
    END AS state
    FROM expected
    LEFT JOIN incident_images image ON image.id = expected.image_id
        AND image.incident_id = expected.incident_id AND image.kind = 'report' AND image.revision = 1
    LEFT JOIN media_processing_jobs job ON job.image_id = image.id
        AND job.incident_id = expected.incident_id AND job.image_revision = image.revision
)
SELECT count(*) FILTER (WHERE state = 'waiting'), count(*) FILTER (WHERE state = 'failed'),
       count(*) FILTER (WHERE state = 'ready'), count(*) FROM states;
SQL
  )

  for _attempt in $(seq 1 60); do
    "$compose_command" exec -T backend bun --input-type=module -e \
      "import { NestFactory } from '@nestjs/core'; import { AppModule } from './dist/nest/app.module.js'; import { OutboxPublisherService } from './dist/nest/modules/jobs/outbox-publisher.service.js'; const app = await NestFactory.createApplicationContext(AppModule, { logger: false }); try { await app.get(OutboxPublisherService).tickOnce(); } finally { await app.close(); }" || return

    states=$("$compose_command" exec -T database /usr/local/bin/load-container-secrets sh -c \
      'psql -X -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -At' <<< "$query") || return
    IFS='|' read -r waiting failed actual expected <<< "$states"
    if ! [[ "$states" =~ ^[0-9]+\|[0-9]+\|[0-9]+\|[1-9][0-9]*$ ]]; then
      printf 'Unexpected media job query result: %s\n' "$states" >&2
      return 1
    fi
    if [ "$failed" -gt 0 ]; then
      printf '%s of %s load-test media jobs failed or are missing.\n' "$failed" "$expected" >&2
      return 1
    fi
    if [ "$waiting" -eq 0 ] && [ "$actual" -eq "$expected" ]; then
      verify_phase12_media_objects "$compose_command" "$targets" "$actual" || return
      printf 'Verified %s load-test media jobs and their WebP results.\n' "$actual"
      return 0
    fi
    sleep 1
  done
  printf 'Load-test media jobs did not finish within 60 polling attempts.\n' >&2
  return 1
}

verify_phase12_media_objects() {
  local compose_command=$1 targets=$2 expected_count=$3 objects
  objects=$("$compose_command" exec -T database /usr/local/bin/load-container-secrets sh -c \
    'psql -X -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -At' <<SQL
SELECT COALESCE(json_agg(json_build_object(
  'originalKey', image.original_object_key,
  'processedKey', image.processed_object_key,
  'checksum', image.processed_checksum_sha256,
  'width', image.width,
  'height', image.height
)), '[]'::json)
FROM jsonb_to_recordset('$targets'::jsonb) AS target(incident_id uuid, image_id uuid)
JOIN incident_images image ON image.id = target.image_id AND image.incident_id = target.incident_id
WHERE image.kind = 'report' AND image.revision = 1 AND image.status = 'ready';
SQL
  ) || return

  "$compose_command" exec -T media_worker bun --input-type=module -e '
    import { createHash } from "node:crypto";
    import sharp from "sharp";
    import { validateObjectStorageEnvironment } from "./dist/config/env.js";
    import { S3ObjectStorage } from "./dist/storage/s3-object-storage.js";

    const objects = await Bun.stdin.json();
    if (!Array.isArray(objects) || objects.length !== Number(process.argv[1])) {
      throw new Error("Missing load-test media objects");
    }
    const storage = new S3ObjectStorage(validateObjectStorageEnvironment());
    try {
      await storage.initialize();
      for (const { originalKey, processedKey, checksum, width, height } of objects) {
        const object = await storage.getObject(processedKey);
        const metadata = await sharp(object.body).metadata();
        const digest = createHash("sha256").update(object.body).digest("hex");
        if (
          object.contentType !== "image/webp" || metadata.format !== "webp" ||
          digest !== checksum || object.checksumSha256 !== digest ||
          metadata.width !== width || metadata.height !== height
        ) {
          throw new Error("Unexpected load-test WebP format, checksum or dimensions");
        }
        if (await storage.objectExists(originalKey)) {
          throw new Error("Load-test image original was not deleted");
        }
      }
    } finally {
      await storage.close();
    }
  ' "$expected_count" <<< "$objects"
}
