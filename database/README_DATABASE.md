# PostgreSQL 18 Database

Ten folder zawiera konfigurację bazy danych PostgreSQL 18 dla projektu ZglosTO.

## Struktura

```
database/
├── Dockerfile              # Obraz Docker dla PostgreSQL 18
├── init-scripts/          # Skrypty inicjalizacyjne SQL (wykonywane w kolejności alfabetycznej)
│   ├── 01-init.sql       # Główny skrypt inicjalizacyjny (rozszerzenia + rola + baza danych)
│   ├── 02-create-auth.sql       # Tworzenie tabel autoryzacji (Better Auth)
│   ├── 03-create-dbtables.sql  # Tworzenie tabel aplikacji (incydenty, użytkownicy rozszerzeni)
│   ├── 04-setup-backup.sql     # Tworzenie backupu bazy danych
└── README_DATABASE.md             # Ten plik
```

## Struktura bazy danych

Baza danych składa się z czterech głównych części inicjalizowanych w kolejności:

1. **Rozszerzenia i konfiguracja bazy** (`01-init.sql`) - rozszerzenia PostgreSQL, tworzenie roli administratora i bazy danych
2. **Tabele autoryzacji** (`02-create-auth.sql`) - tabele dla systemu Better Auth zgodnie z najnowszymi standardami
3. **Tabele aplikacji** (`03-create-dbtables.sql`) - tabele biznesowe (incydenty, użytkownicy rozszerzeni)
4. **Backup bazy danych** (`04-setup-backup.sql`) - backup bazy danych

Poniżej znajduje się opis struktury bazy (PostgreSQL 18) używanej przez aplikację.

### Typy ENUM
- `status_incydentu_enum` — wartości: `ZGŁOSZONY`, `W TRAKCIE NAPRAWY`, `NAPRAWIONY`
- `typ_sluzby_enum` — wartości: `Miejskie Przedsiębiorstwo Komunikacyjne`, `Zakład Gospodarki Komunalnej`, `Pogotowie Kanalizacyjne`, `Zarząd Dróg`, `Inne`
- `uprawnienia_enum` — wartości: `mieszkaniec`, `sluzby`, `admin`

### Tabele autoryzacji (Better Auth)

#### Tabela: "user"

Podstawowa tabela użytkowników dla systemu autoryzacji Better Auth.

Kolumny:
- `id` text PRIMARY KEY — unikalny identyfikator użytkownika
- `name` text — opcjonalne imię/nazwisko użytkownika
- `email` text NOT NULL UNIQUE — adres e-mail użytkownika
- `email_verified` boolean NOT NULL DEFAULT false — czy adres email został zweryfikowany
- `image` text — opcjonalne URL zdjęcia profilowego użytkownika
- `is_active` boolean NOT NULL DEFAULT true — czy konto jest aktywne
- `created_at` timestamptz NOT NULL DEFAULT now() — data utworzenia konta
- `updated_at` timestamptz NOT NULL DEFAULT now() — data ostatniej aktualizacji

Indeksy:
- `idx_user_email_lower` — indeks na LOWER(email) dla wyszukiwania bez uwzględniania wielkości liter

#### Tabela: session

Tabela przechowująca aktywne sesje użytkowników zgodna z Better Auth.

Kolumny:
- `id` text PRIMARY KEY — unikalny identyfikator sesji
- `user_id` text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE — referencja do użytkownika
- `token` text NOT NULL UNIQUE — unikalny token sesji
- `expires_at` timestamptz NOT NULL — data wygaśnięcia sesji
- `ip_address` text — adres IP użytkownika podczas logowania
- `user_agent` text — informacje o przeglądarce/użądzeniu użytkownika
- `created_at` timestamptz NOT NULL DEFAULT now() — data utworzenia sesji
- `updated_at` timestamptz NOT NULL DEFAULT now() — data ostatniej aktualizacji sesji

#### Tabela: account

Tabela przechowująca konta użytkowników (lokalne hasła i providerzy zewnętrzni) zgodna z Better Auth.

Kolumny:
- `id` text PRIMARY KEY — unikalny identyfikator konta
- `user_id` text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE — referencja do użytkownika
- `account_id` text NOT NULL — identyfikator konta (np. email dla lokalnego logowania)
- `provider_id` text NOT NULL — identyfikator providera (np. "email-password", "google", "github")
- `access_token` text — token dostępu od providera zewnętrznego
- `refresh_token` text — token odświeżania od providera zewnętrznego
- `id_token` text — ID token od providera zewnętrznego (np. JWT)
- `access_token_expires_at` timestamptz — data wygaśnięcia tokenu dostępu
- `refresh_token_expires_at` timestamptz — data wygaśnięcia tokenu odświeżania
- `scope` text — zakres uprawnień dla providera zewnętrznego
- `password` text — zahashowane hasło dla lokalnego logowania (konto email-password)
- `created_at` timestamptz NOT NULL DEFAULT now() — data utworzenia konta
- `updated_at` timestamptz NOT NULL DEFAULT now() — data ostatniej aktualizacji konta

Constraints:
- UNIQUE (provider_id, account_id) — unikalność kombinacji providera i identyfikatora konta

#### Tabela: verification

Tabela przechowująca wartości weryfikacyjne (reset hasła, potwierdzenie email itp.) zgodna z Better Auth.

Kolumny:
- `id` text PRIMARY KEY — unikalny identyfikator wartości weryfikacyjnej
- `identifier` text NOT NULL — identyfikator weryfikacji (np. email lub user ID)
- `value` text NOT NULL — wartość weryfikacyjna (token, kod itp.)
- `expires_at` timestamptz NOT NULL — data wygaśnięcia wartości weryfikacyjnej
- `user_id` text REFERENCES "user"(id) ON DELETE CASCADE — opcjonalna referencja do użytkownika
- `created_at` timestamptz NOT NULL DEFAULT now() — data utworzenia wartości weryfikacyjnej
- `updated_at` timestamptz NOT NULL DEFAULT now() — data ostatniej aktualizacji wartości weryfikacyjnej

### Tabele aplikacji

#### Tabela: incydenty

Tabela przechowująca zgłoszenia incydentów/ulicznych problemów.

Kolumny:
- `id_zgloszenia` uuid PRIMARY KEY DEFAULT uuidv7() — domyślnie generowane funkcją `uuidv7()`
- `opis_zgloszenia` varchar(255) NOT NULL — opis zgłoszenia (max 255 znaków)
- `mail_zglaszajacego` varchar(50) NOT NULL — adres mailowy zgłaszającego (max 50 znaków)
- `zdjecie_incydentu_zglaszanego` bytea — opcjonalne zdjęcie incydentu zgłoszonego przez mieszkańca
- `zdjecie_incydentu_rozwiazanego` bytea — opcjonalne zdjęcie po rozwiązaniu incydentu przez służby
- `sprawdzenie_incydentu` boolean NOT NULL DEFAULT FALSE — czy incydent został sprawdzony
- `status_incydentu` `status_incydentu_enum` NOT NULL DEFAULT 'ZGŁOSZONY'
- `typ_sluzby` `typ_sluzby_enum` — typ służby odpowiedzialnej (opcjonalne)
- `data_zgloszenia` date DEFAULT now() — data zgłoszenia domyślnie teraz
- `godzina_zgloszenia` time DEFAULT now() — godzina zgłoszenia domyślnie teraz
- `data_rozwiazania` date DEFAULT NULL — data rozwiązania domyślnie NULL
- `godzina_rozwiazania` time DEFAULT NULL — godzina rozwiązania domyślnie NULL

Indeksy:
- `idx_incydenty_mail_zglaszajacego` — indeks na adres email zgłaszającego
- `idx_incydenty_status` — indeks na status incydentu
- `idx_incydenty_typ_sluzby` — indeks na typ służby

#### Tabela: uzytkownicy

Rozszerzona tabela użytkowników zawierająca informacje o rolach i uprawnieniach w systemie ZglosTO. Jest powiązana z tabelą `"user"` przez klucz obcy.

Kolumny:
- `id_uzytkownika` text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE — referencja do tabeli "user" (ten sam identyfikator)
- `uprawnienia` `uprawnienia_enum` NOT NULL DEFAULT 'mieszkaniec' — poziom uprawnień użytkownika
- `typ_uprawnien` `typ_sluzby_enum` DEFAULT NULL — typ służby (tylko gdy uprawnienia = 'sluzby')

Constraints:
- CHECK (uprawnienia = 'sluzby' OR typ_uprawnien IS NULL) — typ uprawnień może być ustawiony tylko dla użytkowników z rolą 'sluzby'

## Inicjalizacja bazy danych

Skrypty w folderze `init-scripts/` są automatycznie wykonywane podczas pierwszego uruchomienia kontenera PostgreSQL. Pliki są wykonywane w **kolejności alfabetycznej**.

Obecnie dostępne skrypty:

1. **`01-init.sql`** - rozszerzenia PostgreSQL i konfiguracja bazy danych
   - Instaluje rozszerzenia: `uuid-ossp`, `pg_trgm`, `pgcrypto`
   - Tworzy rolę administratora `zglosto_admin`
   - Tworzy bazę danych `zglosto_db` z właścicielem `zglosto_admin`

2. **`02-create-auth.sql`** - tabele autoryzacji dla Better Auth zgodnie z najnowszymi standardami
   - Tworzy tabele: `"user"`, `session`, `account`, `verification`
   - Dodaje indeksy i triggery do automatycznej aktualizacji `updated_at`

3. **`03-create-dbtables.sql`** - tabele aplikacji biznesowej
   - Definiuje typy ENUM: `status_incydentu_enum`, `typ_sluzby_enum`, `uprawnienia_enum`
   - Tworzy tabele: `incydenty`, `uzytkownicy`
   - Dodaje indeksy optymalizacyjne

4. **`05-insert-example-users.sql`** - przykładowe dane użytkowników (opcjonalne)
   - Wstawia 10 przykładowych użytkowników z różnymi rolami do tabeli `users`
   - Tworzy odpowiadające im konta w tabeli `accounts` z zahashowanymi hasłami
   - Używane tylko do celów testowych/demo

5. **`06-insert-example-uzytkownicy.sql`** - rozszerzone dane użytkowników (opcjonalne)
   - Wstawia rozszerzone informacje o użytkownikach z uprawnieniami
   - Powiązane z tabelą `users`

6. **`07-insert-example-incydenty.sql`** - przykładowe zgłoszenia incydentów (opcjonalne)
   - Wstawia 13 przykładowych zgłoszeń w różnych statusach
   - Zawiera realistyczne dane testowe

7. **`08-insert-example-sessions-tokens.sql`** - przykładowe sesje i wartości weryfikacyjne (opcjonalne)
   - Wstawia sesje użytkowników i wartości weryfikacyjne (reset hasła, weryfikacja email)
   - Różne stany wartości weryfikacyjnych (aktywne, wygasłe)

#### Jak dodać nowy skrypt?

1. **Utwórz plik** w folderze `init-scripts/` z nazwą zaczynającą się od liczby (np. `03-moj-skrypt.sql`)
2. **Nazwa powinna być opisowa** i zaczynać się od kolejnego numeru
3. **Skrypt zostanie automatycznie wykonany** przy następnym uruchomieniu kontenera

⚠️ **WAŻNE**: Skrypty są wykonywane tylko przy **pierwszym uruchomieniu** kontenera. Jeśli chcesz wykonać dodatkowy skrypt później, musisz:
- Zrestartować kontener z nową nazwą wolumenu
- Lub wykonać skrypt ręcznie przez `docker-compose exec database psql -U user -d db -f /path/to/script.sql`

## Uruchomienie

### Uruchomienie całego stosu aplikacji

```bash
docker-compose up -d
```

### Uruchomienie tylko bazy danych

```bash
docker-compose up -d database
```

### Sprawdzenie statusu

```bash
docker-compose ps
```

### Sprawdzenie logów

```bash
docker-compose logs database
```

## Zarządzanie danymi

### Backup bazy danych

```bash
docker-compose exec database pg_dump -U zglosto_user zglosto_db > backup.sql
```

### Przywracanie z backupu

```bash
docker-compose exec -T database psql -U zglosto_user -d zglosto_db < backup.sql
```

### Czyszczenie danych

⚠️ **UWAGA**: To usunie wszystkie dane!

```bash
docker-compose down -v
```

## Health Check

Kontener PostgreSQL ma skonfigurowany health check, który sprawdza:
- Czy baza danych jest gotowa do przyjmowania połączeń
- Test wykonywany co 4 sekund
- Timeout 4 sekund
- 5 prób przed uznaniem za unhealthy

## Wolumeny

Dane PostgreSQL są przechowywane w wolumenie Docker `postgres-data`, co zapewnia:
- Trwałość danych między restartami kontenerów
- Izolację danych
- Łatwe zarządzanie i backup

## Połączenie z backendem

Backend automatycznie łączy się z bazą danych używając zmiennej środowiskowej `DATABASE_URL`.
Backend czeka na to, aż baza danych będzie "healthy" dzięki konfiguracji `depends_on`.

## Rozwiązywanie problemów

### Nie można połączyć się z bazą danych

1. Sprawdź czy kontener działa: `docker-compose ps`
2. Sprawdź logi: `docker-compose logs database`
3. Sprawdź health check: `docker inspect zglosto-postgres`

### Reset bazy danych

```bash
docker-compose down
docker volume rm zglosto_postgres-data
docker-compose up -d database
```

## Wersja PostgreSQL

Ten projekt używa **PostgreSQL 18** - najnowszej wersji z ulepszoną wydajnością i nowymi funkcjami.

### Uwaga o init-scripts
Pliki znajdujące się w `database/init-scripts/` są wykonywane tylko przy **pierwszym** tworzeniu wolumenu danych (np. `postgres-data`). Jeśli chcesz, aby zmiany w skryptach zostały zastosowane automatycznie, uruchom destrukcyjny reinit (ostrzegamy: utracisz wszystkie dane):

```bash
docker compose down
docker compose down -v   # usuwa wolumeny, w tym postgres-data — DESTRUKCYJNE
docker compose up --build -d
```

### Weryfikacja
Po uruchomieniu świeżej instancji możesz sprawdzić, czy rola istnieje:

```bash
docker compose exec -e PGPASSWORD=admin_zglosto database psql -U zglosto_admin -d postgres -c "SELECT rolname FROM pg_roles WHERE rolname='zglosto_admin';"
```
