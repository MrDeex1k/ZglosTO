\set ON_ERROR_STOP on

UPDATE uzytkownicy
SET uprawnienia = CASE
      WHEN "user".email = 'demo.service@example.test' THEN 'sluzby'
      WHEN "user".email = 'demo.admin@example.test' THEN 'admin'
      ELSE 'mieszkaniec'
    END::uprawnienia_enum,
    service_key = CASE
      WHEN "user".email = 'demo.service@example.test' THEN 'roads'
      ELSE NULL
    END
FROM "user"
WHERE uzytkownicy.id_uzytkownika = "user".id
  AND "user".email IN (
    'demo.resident@example.test',
    'demo.service@example.test',
    'demo.admin@example.test'
  );

UPDATE "user"
SET email_verified = TRUE
WHERE email IN (
  'demo.resident@example.test',
  'demo.service@example.test',
  'demo.admin@example.test'
);

WITH demo_resident AS (
  SELECT "user".id
  FROM "user"
  WHERE "user".email = 'demo.resident@example.test'
)
INSERT INTO incydenty (
  id_zgloszenia,
  opis_zgloszenia,
  mail_zglaszajacego,
  reporter_user_id,
  adres_zgloszenia,
  latitude,
  longitude,
  sprawdzenie_incydentu,
  status_incydentu,
  service_key,
  data_zgloszenia,
  godzina_zgloszenia,
  data_rozwiazania,
  godzina_rozwiazania
)
SELECT
  fixture.incident_id::uuid,
  fixture.description,
  'demo.resident@example.test',
  demo_resident.id,
  fixture.address,
  fixture.latitude,
  fixture.longitude,
  fixture.verified,
  fixture.status::status_incydentu_enum,
  fixture.service_key,
  CURRENT_DATE - fixture.reported_days_ago,
  fixture.reported_time,
  CASE WHEN fixture.status = 'resolved' THEN CURRENT_DATE - fixture.resolved_days_ago ELSE NULL END,
  CASE WHEN fixture.status = 'resolved' THEN fixture.resolved_time ELSE NULL END
FROM demo_resident
CROSS JOIN (
  VALUES
    (
      '00000000-0000-4000-8000-000000000071',
      'Głęboki ubytek w jezdni stwarza zagrożenie dla rowerzystów i kierowców.',
      'ul. Słoneczna 18', 52.22977::double precision, 21.01178::double precision,
      FALSE, 'reported', 'roads', 0, TIME '09:35', 0, TIME '00:00'
    ),
    (
      '00000000-0000-4000-8000-000000000072',
      'Latarnia przy przejściu dla pieszych nie działa po zmroku.',
      'al. Wolności 42', 52.23115::double precision, 21.00695::double precision,
      TRUE, 'in_progress', 'municipal_services', 1, TIME '18:20', 0, TIME '00:00'
    ),
    (
      '00000000-0000-4000-8000-000000000073',
      'Niedrożna studzienka powodowała gromadzenie się wody po opadach.',
      'ul. Ogrodowa 7', 52.23501::double precision, 21.00182::double precision,
      TRUE, 'resolved', 'sewer_emergency', 3, TIME '08:10', 1, TIME '14:45'
    )
) AS fixture(
  incident_id, description, address, latitude, longitude, verified, status, service_key,
  reported_days_ago, reported_time, resolved_days_ago, resolved_time
);

INSERT INTO incydenty (
  id_zgloszenia,
  opis_zgloszenia,
  mail_zglaszajacego,
  adres_zgloszenia,
  latitude,
  longitude,
  sprawdzenie_incydentu,
  status_incydentu,
  service_key,
  data_zgloszenia,
  godzina_zgloszenia,
  data_rozwiazania,
  godzina_rozwiazania
)
SELECT
  fixture.incident_id::uuid,
  fixture.description,
  'demo.public@example.test',
  fixture.address,
  fixture.latitude,
  fixture.longitude,
  fixture.verified,
  fixture.status::status_incydentu_enum,
  fixture.service_key,
  CURRENT_DATE - fixture.reported_days_ago,
  fixture.reported_time,
  CASE WHEN fixture.status = 'resolved' THEN CURRENT_DATE - fixture.resolved_days_ago ELSE NULL END,
  CASE WHEN fixture.status = 'resolved' THEN fixture.resolved_time ELSE NULL END
FROM (
  VALUES
    (
      '00000000-0000-4000-8000-000000000074',
      'Zwężenie jezdni utrudnia przejazd autobusom komunikacji miejskiej.',
      'ul. Przemysłowa 12', 52.22461::double precision, 21.01622::double precision,
      FALSE, 'reported', 'roads', 0, TIME '10:15', 0, TIME '00:00'
    ),
    (
      '00000000-0000-4000-8000-000000000075',
      'Zapadnięta nawierzchnia przy zatoce autobusowej wymaga pilnej naprawy.',
      'ul. Kolejowa 5', 52.22814::double precision, 21.01942::double precision,
      TRUE, 'in_progress', 'roads', 1, TIME '16:40', 0, TIME '00:00'
    ),
    (
      '00000000-0000-4000-8000-000000000076',
      'Uszkodzony znak przy przejściu dla pieszych został wymieniony.',
      'ul. Lipowa 24', 52.22611::double precision, 21.00428::double precision,
      TRUE, 'resolved', 'roads', 4, TIME '11:05', 0, TIME '15:30'
    ),
    (
      '00000000-0000-4000-8000-000000000077',
      'Rozbita szyba w wiacie przystankowej została bezpiecznie wymieniona.',
      'pl. Centralny 2', 52.23382::double precision, 21.01415::double precision,
      TRUE, 'resolved', 'public_transit', 5, TIME '13:25', 1, TIME '12:10'
    ),
    (
      '00000000-0000-4000-8000-000000000078',
      'Awaria oświetlenia alejki parkowej została usunięta.',
      'Park Miejski — wejście północne', 52.23724::double precision, 21.00951::double precision,
      TRUE, 'resolved', 'municipal_services', 6, TIME '19:05', 2, TIME '09:20'
    )
) AS fixture(
  incident_id, description, address, latitude, longitude, verified, status, service_key,
  reported_days_ago, reported_time, resolved_days_ago, resolved_time
);

SELECT COUNT(*)
FROM uzytkownicy
JOIN "user" ON "user".id = uzytkownicy.id_uzytkownika
WHERE "user".email IN (
  'demo.resident@example.test',
  'demo.service@example.test',
  'demo.admin@example.test'
);
