-- Trzeci skrypt inicjalizacyjny - tworzenie tabel dla Better Auth
-- Tworzy podstawowe tabele zgodne z aktualnymi wytycznymi Better Auth (v1.3.x)

-- Tabela użytkowników
CREATE TABLE IF NOT EXISTS users (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	name text,
	email text NOT NULL UNIQUE,
	email_verified boolean NOT NULL DEFAULT false,
	image text,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- Tabela sesji zgodna z Better Auth
CREATE TABLE IF NOT EXISTS sessions (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token text NOT NULL UNIQUE,
	expires_at timestamptz NOT NULL,
	ip_address text,
	user_agent text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela kont (np. lokalne hasła, providerzy zewnętrzni)
CREATE TABLE IF NOT EXISTS accounts (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at timestamptz NOT NULL,
	user_id uuid REFERENCES users(id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS set_timestamp ON users;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp ON sessions;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp ON accounts;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp ON verification;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON verification
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Informacja końcowa
COMMENT ON TABLE users IS 'Tabela użytkowników dla Better Auth';
COMMENT ON TABLE sessions IS 'Tabela sesji zgodna z Better Auth';
COMMENT ON TABLE accounts IS 'Tabela kont (lokalne i providerzy) zgodna z Better Auth';
COMMENT ON TABLE verification IS 'Tabela wartości weryfikacyjnych (reset hasła, potwierdzenie email)';