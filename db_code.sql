-- PostgreSQL Initialization Script

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Tabela użytkowników
CREATE TABLE IF NOT EXISTS "user" (
	id text PRIMARY KEY,
	name text,
	email text NOT NULL UNIQUE,
	email_verified boolean NOT NULL DEFAULT false,
	image text,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_email_lower ON "user" (LOWER(email));

-- Tabela sesji zgodna z Better Auth
CREATE TABLE IF NOT EXISTS session (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
	token text NOT NULL UNIQUE,
	expires_at timestamptz NOT NULL,
	ip_address text,
	user_agent text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela kont (np. lokalne hasła, providerzy zewnętrzni)
CREATE TABLE IF NOT EXISTS account (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
	account_id text NOT NULL,
	provider_id text NOT NULL,
	access_token text,
	refresh_token text,
	id_token text,
	access_token_expires_at timestamptz,
	refresh_token_expires_at timestamptz,
	scope text,
	password text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (provider_id, account_id)
);

-- Tabela weryfikacji (zarówno hasła, jak i maila)
CREATE TABLE IF NOT EXISTS verification (
	id text PRIMARY KEY,
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at timestamptz NOT NULL,
	user_id text REFERENCES "user"(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger aktualizujący updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp ON "user";
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp ON session;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON session
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp ON account;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON account
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp ON verification;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON verification
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE "user" IS 'Tabela użytkowników dla Better Auth';
COMMENT ON TABLE session IS 'Tabela sesji zgodna z Better Auth';
COMMENT ON TABLE account IS 'Tabela kont (lokalne i providerzy) zgodna z Better Auth';
COMMENT ON TABLE verification IS 'Tabela wartości weryfikacyjnych (reset hasła, potwierdzenie email)';

-- Typy enumeracyjne
DROP TYPE IF EXISTS status_incydentu_enum;
CREATE TYPE status_incydentu_enum AS ENUM (
	'ZGŁOSZONY', 'W TRAKCIE NAPRAWY', 'NAPRAWIONY'
);

DROP TYPE IF EXISTS typ_sluzby_enum;
CREATE TYPE typ_sluzby_enum AS ENUM (
	'Miejskie Przedsiębiorstwo Komunikacyjne',
	'Zakład Gospodarki Komunalnej',
	'Pogotowie Kanalizacyjne',
	'Zarząd Dróg',
	'Inne'
);

DROP TYPE IF EXISTS uprawnienia_enum;
CREATE TYPE uprawnienia_enum AS ENUM ('mieszkaniec', 'sluzby', 'admin');

-- Tabela incydenty
CREATE TABLE IF NOT EXISTS incydenty (
	id_zgloszenia uuid PRIMARY KEY DEFAULT uuidv7(),
	opis_zgloszenia varchar(255) NOT NULL,
	mail_zglaszajacego varchar(50) NOT NULL,
	zdjecie_incydentu_zglaszanego bytea,
	zdjecie_incydentu_rozwiazanego bytea,
	sprawdzenie_incydentu boolean NOT NULL DEFAULT FALSE,
	status_incydentu status_incydentu_enum NOT NULL DEFAULT 'ZGŁOSZONY',
	typ_sluzby typ_sluzby_enum,
	data_zgloszenia date,
	godzina_zgloszenia time,
	data_rozwiazania date,
	godzina_rozwiazania time
);

-- Tabela uzytkownicy
CREATE TABLE IF NOT EXISTS uzytkownicy (
	id_uzytkownika text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
	uprawnienia uprawnienia_enum NOT NULL DEFAULT 'mieszkaniec',
	typ_uprawnien typ_sluzby_enum DEFAULT NULL,
	CHECK (uprawnienia = 'sluzby' OR typ_uprawnien IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_incydenty_mail_zglaszajacego ON incydenty (mail_zglaszajacego);
CREATE INDEX IF NOT EXISTS idx_incydenty_status ON incydenty (status_incydentu);
CREATE INDEX IF NOT EXISTS idx_incydenty_typ_sluzby ON incydenty (typ_sluzby);