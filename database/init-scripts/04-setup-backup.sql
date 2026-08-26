CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO CURRENT_USER;

CREATE OR REPLACE FUNCTION perform_full_backup() RETURNS void AS $$
BEGIN
    COPY (SELECT '') TO PROGRAM '/usr/local/bin/run_pgbackrest_backup.sh full';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog;

CREATE OR REPLACE FUNCTION perform_differential_backup() RETURNS void AS $$
BEGIN
    COPY (SELECT '') TO PROGRAM '/usr/local/bin/run_pgbackrest_backup.sh diff';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog;

REVOKE ALL ON FUNCTION perform_full_backup() FROM PUBLIC;
REVOKE ALL ON FUNCTION perform_differential_backup() FROM PUBLIC;

SELECT cron.schedule('pgbackrest-daily-differential', '0 3 * * *', 'SELECT perform_differential_backup();');
SELECT cron.schedule('pgbackrest-weekly-full', '0 2 * * 0', 'SELECT perform_full_backup();');
