\set ON_ERROR_STOP on

DELETE FROM incydenty WHERE opis_zgloszenia LIKE 'LOAD-A-%';

SELECT COUNT(*) AS remaining_load_a
FROM incydenty
WHERE opis_zgloszenia LIKE 'LOAD-A-%';
