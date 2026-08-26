BEGIN;

ALTER TABLE incydenty
  ADD COLUMN IF NOT EXISTS llm_classification text,
  ADD COLUMN IF NOT EXISTS llm_model_available boolean,
  ADD COLUMN IF NOT EXISTS llm_source text,
  ADD COLUMN IF NOT EXISTS llm_reason text;

UPDATE incydenty
SET llm_classification = CASE
      WHEN UPPER(COALESCE(llm_odpowiedz, '')) LIKE '%RATUNKOWE%' THEN 'emergency'
      ELSE 'unknown'
    END,
    llm_model_available = CASE
      WHEN UPPER(COALESCE(llm_odpowiedz, '')) LIKE '%RATUNKOWE%' THEN TRUE
      ELSE FALSE
    END,
    llm_source = CASE
      WHEN UPPER(COALESCE(llm_odpowiedz, '')) LIKE '%RATUNKOWE%' THEN 'model'
      ELSE 'fallback'
    END,
    llm_reason = CASE
      WHEN UPPER(COALESCE(llm_odpowiedz, '')) LIKE '%RATUNKOWE%' THEN NULL
      ELSE 'invalid_response'
    END
WHERE llm_classification IS NULL
   OR llm_model_available IS NULL
   OR llm_source IS NULL;

ALTER TABLE incydenty
  ALTER COLUMN llm_classification SET DEFAULT 'unknown',
  ALTER COLUMN llm_classification SET NOT NULL,
  ALTER COLUMN llm_model_available SET DEFAULT FALSE,
  ALTER COLUMN llm_model_available SET NOT NULL,
  ALTER COLUMN llm_source SET DEFAULT 'fallback',
  ALTER COLUMN llm_source SET NOT NULL,
  ALTER COLUMN llm_reason SET DEFAULT 'unavailable';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incydenty_llm_classification_valid'
      AND conrelid = 'incydenty'::regclass
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_llm_classification_valid
      CHECK (llm_classification IN ('municipal', 'emergency', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incydenty_llm_source_valid'
      AND conrelid = 'incydenty'::regclass
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_llm_source_valid
      CHECK (llm_source IN ('model', 'fallback'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incydenty_llm_reason_valid'
      AND conrelid = 'incydenty'::regclass
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_llm_reason_valid
      CHECK (llm_reason IS NULL OR llm_reason IN ('timeout', 'disabled', 'unavailable', 'invalid_response'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incydenty_llm_provenance_consistent'
      AND conrelid = 'incydenty'::regclass
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_llm_provenance_consistent
      CHECK (
        (llm_source = 'model' AND llm_model_available = TRUE AND llm_reason IS NULL AND llm_classification <> 'unknown')
        OR
        (llm_source = 'fallback' AND llm_model_available = FALSE AND llm_reason IS NOT NULL AND llm_classification = 'unknown')
      );
  END IF;
END
$$;

COMMIT;
