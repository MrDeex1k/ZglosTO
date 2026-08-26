\set ON_ERROR_STOP on

UPDATE uzytkownicy
SET uprawnienia = :'role',
    service_key = NULLIF(:'service_key', '')
WHERE id_uzytkownika = (
  SELECT id
  FROM "user"
  WHERE email = :'role_email'
    AND email LIKE 'phase6.role.%@example.test'
);

SELECT uprawnienia || ':' || COALESCE(service_key, '')
FROM uzytkownicy
WHERE id_uzytkownika = (
  SELECT id
  FROM "user"
  WHERE email = :'role_email'
);
