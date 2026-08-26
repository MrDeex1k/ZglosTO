BEGIN;

INSERT INTO incydenty (
  opis_zgloszenia,
  mail_zglaszajacego,
  adres_zgloszenia,
  latitude,
  longitude,
  service_key
) VALUES (
  'Poprawna lokalizacja testowa',
  'location-test@example.com',
  'ul. Testowa 9',
  54.352,
  18.6466,
  'other'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO incydenty (
      opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, latitude, longitude, service_key
    ) VALUES (
      'Niepełna lokalizacja', 'location-partial@example.com', 'ul. Testowa 10', 54.352, NULL, 'other'
    );
    RAISE EXCEPTION 'Partial coordinate pair was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO incydenty (
      opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, latitude, longitude, service_key
    ) VALUES (
      'Błędna szerokość', 'location-latitude@example.com', 'ul. Testowa 11', 90.01, 18.6466, 'other'
    );
    RAISE EXCEPTION 'Out-of-range latitude was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO incydenty (
      opis_zgloszenia, mail_zglaszajacego, adres_zgloszenia, latitude, longitude, service_key
    ) VALUES (
      'Błędna długość', 'location-longitude@example.com', 'ul. Testowa 12', 54.352, -180.01, 'other'
    );
    RAISE EXCEPTION 'Out-of-range longitude was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;

ROLLBACK;
