INSERT INTO incydenty (
  id_zgloszenia, opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, service_key
) VALUES (
  '019f67c6-ee5c-7270-afa1-cacee418a001',
  'Test retry media worker',
  'media-retry@example.com',
  'ul. Testowa 11',
  'roads'
);

INSERT INTO incident_images (
  id, incident_id, kind, revision, status, original_object_key, original_mime_type,
  original_size_bytes, original_checksum_sha256
) VALUES (
  '019f67c6-ee5c-7270-afa1-cacee418a002',
  '019f67c6-ee5c-7270-afa1-cacee418a001',
  'report',
  1,
  'pending',
  'missing/media-worker-retry.png',
  'image/png',
  68,
  repeat('c', 64)
);

INSERT INTO media_processing_jobs (
  id, image_id, image_revision, incident_id, status, original_object_key, max_attempts
) VALUES (
  '019f67c6-ee5c-7270-afa1-cacee418a003',
  '019f67c6-ee5c-7270-afa1-cacee418a002',
  1,
  '019f67c6-ee5c-7270-afa1-cacee418a001',
  'pending',
  'missing/media-worker-retry.png',
  2
);

INSERT INTO outbox_events (
  id, job_id, event_type, aggregate_type, aggregate_id, aggregate_revision,
  correlation_id, causation_id, payload
) VALUES (
  '019f67c6-ee5c-7270-afa1-cacee418a004',
  '019f67c6-ee5c-7270-afa1-cacee418a003',
  'media.image.process.requested',
  'incident_image',
  '019f67c6-ee5c-7270-afa1-cacee418a002',
  1,
  '019f67c6-ee5c-7270-afa1-cacee418a005',
  '019f67c6-ee5c-7270-afa1-cacee418a005',
  jsonb_build_object(
    'contractVersion', 1,
    'eventType', 'media.image.process.requested',
    'eventId', '019f67c6-ee5c-7270-afa1-cacee418a004',
    'jobId', '019f67c6-ee5c-7270-afa1-cacee418a003',
    'imageId', '019f67c6-ee5c-7270-afa1-cacee418a002',
    'imageRevision', 1,
    'incidentId', '019f67c6-ee5c-7270-afa1-cacee418a001',
    'imageKind', 'report',
    'original', jsonb_build_object(
      'objectKey', 'missing/media-worker-retry.png',
      'mimeType', 'image/png',
      'sizeBytes', 68,
      'checksumSha256', repeat('c', 64)
    ),
    'requestedAt', '2026-07-21T12:00:00.000Z',
    'attempt', 1,
    'maxAttempts', 2
  )
);
