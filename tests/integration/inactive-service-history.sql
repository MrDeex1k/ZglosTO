BEGIN;

UPDATE service_types SET enabled = FALSE WHERE service_key = 'roads';

DO $$
DECLARE
  roads_incident_id uuid;
  other_incident_id uuid;
  resident_user_id text;
BEGIN
  SELECT id_zgloszenia INTO STRICT roads_incident_id
  FROM incydenty
  WHERE service_key = 'roads'
  LIMIT 1;

  SELECT id_zgloszenia INTO STRICT other_incident_id
  FROM incydenty
  WHERE service_key = 'other'
  LIMIT 1;

  SELECT id_uzytkownika INTO STRICT resident_user_id
  FROM uzytkownicy
  WHERE uprawnienia = 'mieszkaniec'
  LIMIT 1;

  UPDATE incydenty
  SET status_incydentu = status_incydentu
  WHERE id_zgloszenia = roads_incident_id;

  BEGIN
    INSERT INTO incydenty (
      opis_zgloszenia,
      mail_zglaszajacego,
      adres_zgloszenia,
      service_key
    ) VALUES (
      'Niedozwolone nowe zgłoszenie',
      'inactive-service@example.com',
      'ul. Testowa 8',
      'roads'
    );
    RAISE EXCEPTION 'Inactive service accepted a new incident';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE incydenty
    SET service_key = 'roads'
    WHERE id_zgloszenia = other_incident_id;
    RAISE EXCEPTION 'Inactive service accepted an incident reassignment';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE uzytkownicy
    SET uprawnienia = 'sluzby', service_key = 'roads'
    WHERE id_uzytkownika = resident_user_id;
    RAISE EXCEPTION 'Inactive service accepted a user assignment';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM service_types WHERE service_key = 'roads';
    RAISE EXCEPTION 'Service with historical data was deleted';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  UPDATE service_types SET enabled = TRUE WHERE service_key = 'roads';

  INSERT INTO incydenty (
    opis_zgloszenia,
    mail_zglaszajacego,
    adres_zgloszenia,
    service_key
  ) VALUES (
    'Dozwolone po ponownej aktywacji',
    'reactivated-service@example.com',
    'ul. Testowa 8',
    'roads'
  );
END
$$;

ROLLBACK;
