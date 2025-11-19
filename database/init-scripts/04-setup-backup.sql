CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION perform_backup() RETURNS void AS $$
BEGIN
    PERFORM pg_execute_server_program('pgbackrest --stanza=zglosto_db --type=full backup');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule('backup-every-48h', '48 hours', 'SELECT perform_backup();');