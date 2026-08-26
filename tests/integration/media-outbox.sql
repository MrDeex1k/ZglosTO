DO $$
DECLARE
	image_count integer;
	job_count integer;
	pending_job_count integer;
	superseded_job_count integer;
	outbox_count integer;
	pending_event_count integer;
	discarded_event_count integer;
BEGIN
	SELECT count(*) INTO image_count FROM incident_images;
	SELECT count(*) INTO job_count FROM media_processing_jobs;
	SELECT count(*) INTO pending_job_count FROM media_processing_jobs WHERE status = 'pending';
	SELECT count(*) INTO superseded_job_count FROM media_processing_jobs WHERE status = 'superseded';
	SELECT count(*) INTO outbox_count FROM outbox_events;
	SELECT count(*) INTO pending_event_count FROM outbox_events WHERE status = 'pending';
	SELECT count(*) INTO discarded_event_count FROM outbox_events WHERE status = 'discarded';

	IF image_count <> 6 THEN
		RAISE EXCEPTION 'Expected 6 current incident images, got %', image_count;
	END IF;
	IF job_count <> 7 OR pending_job_count <> 6 OR superseded_job_count <> 1 THEN
		RAISE EXCEPTION 'Unexpected media job states: total %, pending %, superseded %',
			job_count, pending_job_count, superseded_job_count;
	END IF;
	IF outbox_count <> 7 OR pending_event_count <> 6 OR discarded_event_count <> 1 THEN
		RAISE EXCEPTION 'Unexpected outbox states: total %, pending %, discarded %',
			outbox_count, pending_event_count, discarded_event_count;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM incident_images image
		LEFT JOIN media_processing_jobs job
			ON job.image_id = image.id
			AND job.image_revision = image.revision
			AND job.status = 'pending'
		WHERE job.id IS NULL
	) THEN
		RAISE EXCEPTION 'Every current image revision must have one pending media job';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM outbox_events event
		JOIN media_processing_jobs job ON job.id = event.job_id
		WHERE event.contract_version <> 1
			OR event.event_type <> 'media.image.process.requested'
			OR event.payload->>'eventId' <> event.id::text
			OR event.payload->>'jobId' <> job.id::text
			OR event.payload->>'imageId' <> job.image_id::text
			OR (event.payload->>'imageRevision')::integer <> job.image_revision
			OR event.payload->'original'->>'objectKey' <> job.original_object_key
			OR event.payload::text ~* '"(body|bytes|base64|imageBase64)"'
	) THEN
		RAISE EXCEPTION 'Outbox payload violates the media contract';
	END IF;
END$$;
