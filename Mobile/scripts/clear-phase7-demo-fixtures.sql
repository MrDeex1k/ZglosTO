\set ON_ERROR_STOP on

DELETE FROM incydenty
WHERE mail_zglaszajacego IN (
  'demo.resident@example.test',
  'demo.public@example.test'
);

DELETE FROM "user"
WHERE email IN (
  'demo.resident@example.test',
  'demo.service@example.test',
  'demo.admin@example.test'
);

SELECT COUNT(*)
FROM "user"
WHERE email IN (
  'demo.resident@example.test',
  'demo.service@example.test',
  'demo.admin@example.test'
);
