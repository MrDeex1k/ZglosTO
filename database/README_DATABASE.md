# PostgreSQL 18 Database

Ten folder zawiera konfigurację bazy danych PostgreSQL 18 dla projektu ZglosTO.

Obraz bazowy jest przypięty do PostgreSQL `18.6`. Zgodnie z układem oficjalnego obrazu PostgreSQL 18 wolumen danych jest montowany w `/var/lib/postgresql`, a `PGDATA` i `pgBackRest` wskazują `/var/lib/postgresql/18/docker`.

## Struktura

```
database/
├── Dockerfile              # Obraz Docker dla PostgreSQL 18
├── init-scripts/          # Skrypty inicjalizacyjne SQL (wykonywane w kolejności alfabetycznej)
│   ├── 01-init.sql       # Główny skrypt inicjalizacyjny (rozszerzenia + rola + baza danych)
│   ├── 02-create-auth.sql       # Tworzenie tabel autoryzacji (Better Auth)
│   ├── 03-create-dbtables.sql  # Tworzenie tabel aplikacji (incydenty, użytkownicy rozszerzeni)
│   ├── 04-setup-backup.sql     # Tworzenie backupu bazy danych
├── migrations/           # Wersjonowane migracje 001-014 kontraktów bazy
└── README_DATABASE.md             # Ten plik
```

## Struktura bazy danych

Baza danych składa się z czterech głównych części inicjalizowanych w kolejności:

1. **Rozszerzenia i konfiguracja bazy** (`01-init.sql`) - rozszerzenia PostgreSQL, tworzenie roli administratora i bazy danych
2. **Tabele autoryzacji** (`02-create-auth.sql`) - tabele dla systemu Better Auth zgodnie z najnowszymi standardami
3. **Tabele aplikacji** (`03-create-dbtables.sql`) - tabele biznesowe (incydenty, użytkownicy rozszerzeni)
4. **Backup bazy danych** (`04-setup-backup.sql`) - automatyczne tworzenie kopii zapasowych

Poniżej znajduje się opis struktury bazy (PostgreSQL 18) używanej przez aplikację.

### Typy ENUM i katalog usług

- `status_incydentu_enum` — wartości: `reported`, `in_progress`, `resolved`
- `uprawnienia_enum` — wartości: `mieszkaniec`, `sluzby`, `admin`

Typy służb nie używają ENUM-u. Tabela `service_types` przechowuje stabilny `service_key`,
stan aktywności i kolejność. `incydenty.service_key` oraz `uzytkownicy.service_key` są
kluczami obcymi do tego katalogu. Nieaktywne rekordy pozostają dla danych historycznych,
a triggery blokują wyłącznie nowe lub zmieniane przypisania `service_key`.

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
- `mail_zglaszajacego` varchar(254) NOT NULL — znormalizowany adres mailowy zgłaszającego
- `reporter_user_id` text NULL REFERENCES "user"(id) — powiązane konto po potwierdzeniu e-maila
- `adres_zgloszenia` varchar(50) NOT NULL — adres miejsca zgłoszenia incydentu (max 50 znaków)
- `latitude` double precision NULL — opcjonalna szerokość geograficzna WGS84 od -90 do 90
- `longitude` double precision NULL — opcjonalna długość geograficzna WGS84 od -180 do 180
- `sprawdzenie_incydentu` boolean NOT NULL DEFAULT FALSE — czy incydent został sprawdzony
- `status_incydentu` `status_incydentu_enum` NOT NULL DEFAULT 'reported'
- `service_key` varchar(64) NOT NULL REFERENCES `service_types(service_key)` — służba odpowiedzialna
- `LLM_odpowiedz` text DEFAULT NULL — odpowiedź systemu LLM
- `data_zgloszenia` date DEFAULT now() — data zgłoszenia domyślnie teraz
- `godzina_zgloszenia` time DEFAULT now() — godzina zgłoszenia domyślnie teraz
- `data_rozwiazania` date DEFAULT NULL — data rozwiązania domyślnie NULL
- `godzina_rozwiazania` time DEFAULT NULL — godzina rozwiązania domyślnie NULL

Współrzędne muszą wystąpić razem albo obie pozostać `NULL`. Tekstowy adres pozostaje
wymagany, a zapis zgłoszenia nie wykonuje i nie wymaga zewnętrznego geokodowania.

Indeksy:

- `idx_incydenty_mail_zglaszajacego` — indeks na adres email zgłaszającego
- `idx_incydenty_status` — indeks na status incydentu
- `idx_incydenty_service_key` — indeks na stabilny klucz służby
- `idx_incydenty_public_resolved_order` — częściowy indeks ostatnich rozwiązanych
  zgłoszeń, zgodny z filtrem i sortowaniem publicznej listy

#### Tabela: incident_images

Provider-neutralne metadane prywatnych obiektów zapisanych poza PostgreSQL. Ograniczenie
`UNIQUE (incident_id, kind)` pozwala przechowywać po jednym zdjęciu `report` i `resolution`.

- `status` — `pending`, `processing`, `ready` albo `failed`;
- `revision` — rosnąca wersja zawartości chroniąca przed wynikiem starego zadania;
- `original_object_key`, MIME, rozmiar i checksum SHA-256 — metadane oryginału;
- `processed_object_key`, MIME WebP, rozmiar i checksum — nullable metadane wyniku workera;
- `width`, `height` — nullable wymiary wyniku;
- `failure_code` — techniczny kod niepowodzenia dla stanu `failed`;
- klucz obcy do `incydenty` usuwa metadane kaskadowo.

Pliki binarne nie są przechowywane w bazie. Widok `incident_image_api_refs` buduje typowaną
referencję zwracaną przez API.

#### Tabela: media_processing_jobs

Trwały, idempotentny stan asynchronicznej obróbki. Para `image_id + image_revision` jest
unikalna. Rekord zawiera stabilny `jobId`, wersję kontraktu, object key oryginału, liczniki
prób, termin następnej próby i stan obejmujący również `dead_lettered` oraz `superseded`.

#### Tabela: outbox_events

Transactional outbox publishera RabbitMQ. Zdarzenie V1 jest zapisywane atomowo z
metadanymi zdjęcia i zadaniem. Ograniczenia bazy sprawdzają zgodność identyfikatorów, rewizji i
wersji payloadu oraz blokują pola binarne/base64 na najwyższym poziomie komunikatu.

#### Tabela: uzytkownicy

Rozszerzona tabela użytkowników zawierająca informacje o rolach i uprawnieniach w systemie ZglosTO. Jest powiązana z tabelą `"user"` przez klucz obcy.

Kolumny:

- `id_uzytkownika` text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE — referencja do tabeli "user" (ten sam identyfikator)
- `uprawnienia` `uprawnienia_enum` NOT NULL DEFAULT 'mieszkaniec' — poziom uprawnień użytkownika
- `service_key` varchar(64) DEFAULT NULL REFERENCES `service_types(service_key)` — przypisanie użytkownika służb

Constraints:

- CHECK (uprawnienia = 'sluzby' OR service_key IS NULL) — służba może być ustawiona tylko dla roli `sluzby`

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
   - Definiuje ENUM-y statusów i ról oraz relacyjny katalog `service_types`
   - Tworzy tabele: `incydenty`, `incident_images`, `media_processing_jobs`, `outbox_events`, `consumed_messages`,
     `uzytkownicy`
   - Dodaje indeksy optymalizacyjne

4. **`04-setup-backup.sql`** - automatyczne tworzenie kopii zapasowych
   - Instaluje rozszerzenie `pg_cron` dla harmonogramu zadań
   - Tworzy kontrolowane funkcje `perform_full_backup()` i `perform_differential_backup()`
   - Konfiguruje pełny backup w niedzielę o 02:00 i różnicowy codziennie o 03:00
   - Używa wrappera pgBackRest z dynamiczną rolą i portem PostgreSQL

#### Jak dodać nowy skrypt?

1. **Utwórz plik** w folderze `init-scripts/` z nazwą zaczynającą się od liczby (np. `03-moj-skrypt.sql`)
2. **Nazwa powinna być opisowa** i zaczynać się od kolejnego numeru
3. **Skrypt zostanie automatycznie wykonany** przy następnym uruchomieniu kontenera

⚠️ **WAŻNE**: Skrypty są wykonywane tylko przy **pierwszym uruchomieniu** kontenera. Migracje istniejącego wolumenu są przechowywane osobno w `database/migrations/`.

Migrację kodów statusów ADR-007 można bezpiecznie uruchomić wielokrotnie:

```bash
./scripts/migrate-incident-statuses.sh
```

W przypadku innych zmian trzeba:

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

### Dostęp administracyjny bez pgAdmin

PgAdmin nie jest częścią stosu. Do bieżącej diagnostyki używamy `psql` wewnątrz kontenera:

```bash
docker compose exec database psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Lokalny klient bazodanowy może łączyć się przez port PostgreSQL opublikowany wyłącznie dla środowiska developerskiego. W środowisku produkcyjnym należy używać kontrolowanego tunelu i konta read-only.

### Migracja wolumenu z wcześniejszego układu

Zmiana z `/var/lib/postgresql/data/pgdata` na `/var/lib/postgresql/18/docker` zmienia katalog danych. Projekt nie jest obecnie używany produkcyjnie, dlatego dopuszczony jest start na czystym wolumenie. Jeżeli lokalny wolumen zawiera dane do zachowania, przed aktualizacją należy wykonać `pg_dump`, a po uruchomieniu PostgreSQL 18.6 odtworzyć go przez `psql`. Nie należy kopiować surowego katalogu danych między układami bez testu restore.

### Backup i przywracanie

Przenośny backup PostgreSQL zawsze powstaje razem z archiwum aktywnego Object Storage:

```bash
./scripts/backup-compose.sh backups/manual
./scripts/restore-compose.sh backups/manual
```

Operacje bazodanowe używają bezpośrednio `DATABASE_DIRECT_URL`; PgBouncer jest omijany.
Szczegółowy runbook, format artefaktów, zasady spójności i restore drill opisuje
[docs/backup-restore.md](../docs/backup-restore.md).

pgBackRest zapewnia dodatkowo archiwizację WAL, pełny backup raz w tygodniu, różnicowy raz
dziennie oraz retencję czterech pełnych i czternastu różnicowych kopii. Repozytorium
`/var/lib/pgbackrest` musi być trwałe i produkcyjnie znajdować się w innym failure domain niż
podstawowy wolumen PostgreSQL.

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

Backend i authorization łączą się z bazą wyłącznie przez aplikacyjny `DATABASE_URL`, który
wskazuje `pgbouncer:6432`. PgBouncer używa transaction pooling oraz SCRAM-SHA-256. Usługi
aplikacyjne nie otrzymują `DATABASE_DIRECT_URL`.

Oba niezależne odcinki `backend/authorization -> PgBouncer -> PostgreSQL` używają
TLS z pełną weryfikacją serwera. Certyfikaty serwerów muszą zawierać odpowiednio SAN
`pgbouncer` i `database`. SCRAM-SHA-256 pozostaje wymagane; nie wdrażamy mTLS do bazy.
Migracje, backup/restore i kontrolowana administracja przez `DATABASE_DIRECT_URL` również
używają TLS 1.3, `verify-full`, Database CA oraz SAN `database`. Reguły `pg_hba.conf`
odrzucają zdalny plaintext. Szczegóły zawiera
[dokument bezpieczeństwa transportu](../docs/transport-security.md).

Migracje, backup/restore oraz kontrolowana administracja używają wyłącznie
`DATABASE_DIRECT_URL`, który zawsze wskazuje bezpośrednio PostgreSQL. Skrypty migracyjne
repozytorium egzekwują ten podział. Backend czeka na gotowość wymaganej infrastruktury dzięki
konfiguracji `depends_on`.

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
