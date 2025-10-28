-- PostgreSQL Initialization Script

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zglosto_admin') THEN
		CREATE ROLE zglosto_admin WITH LOGIN;
	END IF;

	IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'zglosto_db') THEN
		PERFORM dblink_connect('dbname=postgres');
		EXECUTE 'CREATE DATABASE zglosto_db OWNER zglosto_admin';
	ELSE
		EXECUTE 'ALTER DATABASE zglosto_db OWNER TO zglosto_admin';
	END IF;
EXCEPTION WHEN undefined_function THEN
	IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'zglosto_db') THEN
		EXECUTE 'CREATE DATABASE zglosto_db OWNER zglosto_admin';
	ELSE
		EXECUTE 'ALTER DATABASE zglosto_db OWNER TO zglosto_admin';
	END IF;
END$$;