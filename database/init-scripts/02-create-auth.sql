-- Trzeci skrypt inicjalizacyjny - tworzenie tabel dla autoryzacji
-- Tworzy podstawowe tabele wymagane do obsługi autoryzacji email+password

-- Tabela użytkowników
CREATE TABLE IF NOT EXISTS users (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	name text,
	email text NOT NULL UNIQUE,
	email_verified boolean NOT NULL DEFAULT false,
	password_hash text,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- Tabela sesji (prosty mechanizm sesji / tokenów)
CREATE TABLE IF NOT EXISTS sessions (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token text NOT NULL UNIQUE,
	expires_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela tokenów do resetu hasła
CREATE TABLE IF NOT EXISTS password_reset_tokens (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token text NOT NULL UNIQUE,
	expires_at timestamptz NOT NULL,
	used boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela tokenów do weryfikacji email (opcjonalnie)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token text NOT NULL UNIQUE,
	expires_at timestamptz NOT NULL,
	used boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
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

-- Informacja końcowa
COMMENT ON TABLE users IS 'Tabela użytkowników (email+password) dla Better Auth';