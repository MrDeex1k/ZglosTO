\set ON_ERROR_STOP on

DELETE FROM incydenty
WHERE opis_zgloszenia LIKE 'QUEUE-A-%' OR opis_zgloszenia LIKE 'QUEUE-B-%';

SELECT COUNT(*) AS remaining_phase5_acceptance
FROM incydenty
WHERE opis_zgloszenia LIKE 'QUEUE-A-%' OR opis_zgloszenia LIKE 'QUEUE-B-%';
