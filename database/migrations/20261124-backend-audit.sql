-- Apply once with psql as the schema owner, outside a transaction.
\set ON_ERROR_STOP on

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incydenty_page_order
	ON incydenty (data_zgloszenia DESC, godzina_zgloszenia DESC, id_zgloszenia DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incydenty_reporter_page_order
	ON incydenty (reporter_user_id, data_zgloszenia DESC, godzina_zgloszenia DESC, id_zgloszenia DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incydenty_service_page_order
	ON incydenty (service_key, data_zgloszenia DESC, godzina_zgloszenia DESC, id_zgloszenia DESC);

UPDATE incydenty
SET data_rozwiazania = NULL, godzina_rozwiazania = NULL, revision = revision + 1
WHERE status_incydentu <> 'resolved'
  AND (data_rozwiazania IS NOT NULL OR godzina_rozwiazania IS NOT NULL);
