\set ON_ERROR_STOP on

DELETE FROM "user"
WHERE email = :'role_email'
  AND email LIKE 'phase6.role.%@example.test';

SELECT COUNT(*)
FROM "user"
WHERE email = :'role_email';
