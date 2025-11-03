-- Drugi skrypt inicjalizacyjny - tworzenie tabel aplikacji

-- Typy enumeracyjne
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_incydentu_enum') THEN
		CREATE TYPE status_incydentu_enum AS ENUM ('ZGŁOSZONY', 'W TRAKCIE NAPRAWY', 'NAPRAWIONY');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'typ_sluzby_enum') THEN
		CREATE TYPE typ_sluzby_enum AS ENUM (
			'Miejskie Przedsiębiorstwo Komunikacyjne',
			'Zakład Gospodarki Komunalnej',
			'Pogotowie Kanalizacyjne',
			'Zarząd Dróg',
			'Inne'
		);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uprawnienia_enum') THEN
		CREATE TYPE uprawnienia_enum AS ENUM ('mieszkaniec', 'sluzby', 'admin');
	END IF;
END$$;

-- Tabela incydenty
CREATE TABLE IF NOT EXISTS incydenty (
	id_zgloszenia uuid PRIMARY KEY DEFAULT uuidv7(),
	opis_zgloszenia varchar(255) NOT NULL,
	mail_zglaszajacego varchar(50) NOT NULL,
	zdjecie_incydentu_zglaszanego bytea,
	zdjecie_incydentu_rozwiazanego bytea,
	sprawdzenie_incydentu boolean NOT NULL DEFAULT FALSE,
	status_incydentu status_incydentu_enum NOT NULL DEFAULT 'ZGŁOSZONY',
	typ_sluzby typ_sluzby_enum
);

-- Tabela uzytkownicy
CREATE TABLE IF NOT EXISTS uzytkownicy (
	id_uzytkownika uuid PRIMARY KEY DEFAULT uuidv7(),
	mail varchar(50) NOT NULL UNIQUE,
	haslo varchar(40) NOT NULL CHECK (char_length(haslo) >= 10 AND char_length(haslo) <= 40),
	uprawnienia uprawnienia_enum NOT NULL DEFAULT 'mieszkaniec'
);

CREATE INDEX IF NOT EXISTS idx_incydenty_mail_zglaszajacego ON incydenty (mail_zglaszajacego);
CREATE INDEX IF NOT EXISTS idx_incydenty_status ON incydenty (status_incydentu);
CREATE INDEX IF NOT EXISTS idx_incydenty_typ_sluzby ON incydenty (typ_sluzby);