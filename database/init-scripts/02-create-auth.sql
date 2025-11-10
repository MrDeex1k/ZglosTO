-- Trzeci skrypt inicjalizacyjny - tworzenie tabel dla Better Auth

-- Tabela użytkowników
CREATE TABLE IF NOT EXISTS user (
	id text PRIMARY KEY,
	name text,
	email text NOT NULL UNIQUE,
	email_verified boolean NOT NULL DEFAULT false,
	image text,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_email_lower ON user (LOWER(email));

-- Tabela sesji zgodna z Better Auth
CREATE TABLE IF NOT EXISTS session (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
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
	user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
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
	user_id text REFERENCES user(id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS set_timestamp ON user;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON user
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

-- Informacja końcowa
COMMENT ON TABLE user IS 'Tabela użytkowników dla Better Auth';
COMMENT ON TABLE session IS 'Tabela sesji zgodna z Better Auth';
COMMENT ON TABLE account IS 'Tabela kont (lokalne i providerzy) zgodna z Better Auth';
COMMENT ON TABLE verification IS 'Tabela wartości weryfikacyjnych (reset hasła, potwierdzenie email)';