\set ON_ERROR_STOP on

BEGIN;

DELETE FROM incydenty WHERE opis_zgloszenia LIKE 'LOAD-A-%';

INSERT INTO incydenty (
  opis_zgloszenia,
  mail_zglaszajacego,
  adres_zgloszenia,
  sprawdzenie_incydentu,
  status_incydentu,
  service_key,
  data_zgloszenia,
  godzina_zgloszenia
)
SELECT
  'LOAD-A-' || LPAD(series::text, 3, '0') || ' — pomiar kolejki służby',
  'phase5.load-a@example.test',
  'Ulica Testowa ' || series,
  series % 3 = 0,
  CASE
    WHEN series <= 100 THEN 'reported'::status_incydentu_enum
    WHEN series <= 160 THEN 'in_progress'::status_incydentu_enum
    ELSE 'resolved'::status_incydentu_enum
  END,
  'roads',
  CURRENT_DATE - ((series - 1) / 24),
  (TIME '12:00' - ((series - 1) % 24) * INTERVAL '1 minute')::time
FROM generate_series(1, 200) AS series;

COMMIT;

SELECT status_incydentu, COUNT(*)
FROM incydenty
WHERE opis_zgloszenia LIKE 'LOAD-A-%'
GROUP BY status_incydentu
ORDER BY status_incydentu;
