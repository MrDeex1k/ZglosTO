-- Also apply this file to existing databases as the database owner before deploying the API.
BEGIN;
CREATE TABLE IF NOT EXISTS public.incident_creation_receipts (
  scope text NOT NULL,
  key uuid NOT NULL,
  fingerprint text NOT NULL,
  incident_id uuid UNIQUE REFERENCES public.incydenty (id_zgloszenia) ON DELETE CASCADE,
  response jsonb,
  PRIMARY KEY (scope, key),
  CHECK ((incident_id IS NULL) = (response IS NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.incident_creation_receipts TO zglosto_backend;
COMMIT;
