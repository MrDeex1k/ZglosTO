-- Private model diagnostics: no public incident/API fields are added.
BEGIN;
ALTER TABLE public.incydenty
  ADD COLUMN IF NOT EXISTS llm_confidence_raw double precision,
  ADD COLUMN IF NOT EXISTS llm_p_emergency_raw double precision,
  ADD COLUMN IF NOT EXISTS llm_model_id varchar(256),
  ADD COLUMN IF NOT EXISTS llm_model_revision varchar(71),
  ADD COLUMN IF NOT EXISTS llm_prompt_version varchar(64),
  ADD COLUMN IF NOT EXISTS llm_latency_ms integer,
  ADD COLUMN IF NOT EXISTS llm_calibration_version varchar(64);

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_constraint
    WHERE conrelid = 'public.incydenty'::regclass AND conname = 'incydenty_llm_diagnostic_scores_valid') THEN
    ALTER TABLE public.incydenty ADD CONSTRAINT incydenty_llm_diagnostic_scores_valid CHECK (
      (llm_confidence_raw IS NULL AND llm_p_emergency_raw IS NULL)
    OR (llm_confidence_raw IS NOT NULL AND llm_p_emergency_raw IS NOT NULL
      AND llm_source = 'model' AND llm_model_id IS NOT NULL
      AND llm_confidence_raw BETWEEN 0 AND 1 AND llm_p_emergency_raw BETWEEN 0 AND 1
      AND abs(llm_confidence_raw - greatest(llm_p_emergency_raw, 1 - llm_p_emergency_raw)) <= 0.000000001)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_constraint
    WHERE conrelid = 'public.incydenty'::regclass AND conname = 'incydenty_llm_diagnostic_metadata_valid') THEN
    ALTER TABLE public.incydenty ADD CONSTRAINT incydenty_llm_diagnostic_metadata_valid CHECK (
      (llm_model_id IS NULL AND llm_model_revision IS NULL AND llm_prompt_version IS NULL
      AND llm_latency_ms IS NULL AND llm_calibration_version IS NULL)
    OR (llm_model_id IS NOT NULL AND length(btrim(llm_model_id)) BETWEEN 1 AND 256
      AND llm_prompt_version IS NOT NULL AND length(llm_prompt_version) BETWEEN 1 AND 64
      AND llm_prompt_version ~ '^[A-Za-z0-9._:-]+$'
      AND llm_latency_ms IS NOT NULL AND llm_latency_ms >= 0
      AND (llm_model_revision IS NULL OR llm_model_revision ~ '^sha256:[0-9a-f]{64}$')
      AND (llm_calibration_version IS NULL OR (length(llm_calibration_version) BETWEEN 1 AND 64
        AND llm_calibration_version ~ '^[A-Za-z0-9._:-]+$')))
    );
  END IF;
END $$;

COMMIT;
