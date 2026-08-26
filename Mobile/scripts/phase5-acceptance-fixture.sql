\set ON_ERROR_STOP on

BEGIN;

DELETE FROM incydenty
WHERE opis_zgloszenia LIKE 'QUEUE-A-%' OR opis_zgloszenia LIKE 'QUEUE-B-%';

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
  'QUEUE-A-' || LPAD(series::text, 2, '0') || ' — test terenowy roads',
  'phase5.queue-a@example.test',
  'Droga Testowa ' || series,
  series % 2 = 0,
  CASE
    WHEN series <= 5 THEN 'reported'::status_incydentu_enum
    WHEN series <= 9 THEN 'in_progress'::status_incydentu_enum
    ELSE 'resolved'::status_incydentu_enum
  END,
  'roads',
  CURRENT_DATE,
  (TIME '14:00' - series * INTERVAL '1 minute')::time
FROM generate_series(1, 12) AS series;

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
  'QUEUE-B-' || LPAD(series::text, 2, '0') || ' — test izolacji other',
  'phase5.queue-b@example.test',
  'Inna Służba ' || series,
  FALSE,
  CASE series
    WHEN 1 THEN 'reported'::status_incydentu_enum
    WHEN 2 THEN 'in_progress'::status_incydentu_enum
    ELSE 'resolved'::status_incydentu_enum
  END,
  'other',
  CURRENT_DATE,
  (TIME '13:00' - series * INTERVAL '1 minute')::time
FROM generate_series(1, 3) AS series;

COMMIT;

SELECT service_key, status_incydentu, COUNT(*)
FROM incydenty
WHERE opis_zgloszenia LIKE 'QUEUE-A-%' OR opis_zgloszenia LIKE 'QUEUE-B-%'
GROUP BY service_key, status_incydentu
ORDER BY service_key, status_incydentu;
