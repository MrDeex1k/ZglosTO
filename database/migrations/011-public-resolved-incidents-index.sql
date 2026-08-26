-- Migration 011: public resolved incidents index.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_incydenty_public_resolved_order
  ON incydenty (
    data_rozwiazania DESC NULLS LAST,
    godzina_rozwiazania DESC NULLS LAST,
    id_zgloszenia DESC
  )
  WHERE status_incydentu = 'resolved';

COMMIT;
