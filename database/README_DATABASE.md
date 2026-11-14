# PostgreSQL 18 Database

Ten folder zawiera konfigurację bazy danych PostgreSQL 18 dla projektu ZglosTO.

Obraz bazowy jest przypięty do PostgreSQL `18.7`. Zgodnie z układem oficjalnego obrazu PostgreSQL 18 wolumen danych jest montowany w `/var/lib/postgresql`, a `PGDATA` i `pgBackRest` wskazują `/var/lib/postgresql/18/docker`.

## Struktura

```
database/
├── Dockerfile              # Obraz Docker dla PostgreSQL 18
├── init-scripts/          # Skrypty inicjalizacyjne SQL (wykonywane w kolejności alfabetycznej)
│   ├── 01-init.sql       # Główny skrypt inicjalizacyjny (rozszerzenia; bazę i admina tworzy entrypoint)
│   ├── 02-create-auth.sql       # Tworzenie tabel autoryzacji (Better Auth)
│   ├── 03-create-dbtables.sql  # Tworzenie tabel aplikacji (incydenty, użytkownicy rozszerzeni)
│   ├── 04-setup-backup.sql     # Tworzenie backupu bazy danych
├── migrations/           # Wersjonowane migracje 001-017 kontraktów bazy
└── README_DATABASE.md             # Ten plik
```

## Struktura bazy danych

Baza danych składa się z czterech głównych części inicjalizowanych w kolejności:

1. **Rozszerzenia i konfiguracja bazy** (`01-init.sql`) - rozszerzenia PostgreSQL; rolę administratora i bazę tworzy oficjalny entrypoint
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

## Atomowe tworzenie uprawnień użytkownika

Migracja `015-atomic-user-provisioning.sql` tworzy domyślną rolę mieszkańca w tej samej
transakcji co konto Better Auth. Błąd zapisu roli wycofuje też zapis konta. Migracja
uzupełnia brakujące role, zachowując istniejące uprawnienia i przypisania do służb.
Nowa baza uruchamia ją przez `init-scripts/05-user-provisioning.sql`.

Na istniejącej bazie zastosuj migrację 015 przez bezpośrednie połączenie PostgreSQL
**przed uruchomieniem nowej wersji Authorization**, zgodnie z procedurą migracji
wdrożenia. Sam restart kontenera z istniejącym wolumenem nie uruchamia init-scripts.
Migracja nie zmienia zasad weryfikacji e-mail.

`bun run test:auth-provisioning` sprawdza migrację i świeżą instalację na osobnym
PostgreSQL w Dockerze: bez sieci, opublikowanych portów i trwałego wolumenu. Test
obejmuje błąd zapisu roli, retry, rollback, idempotencję i zachowanie istniejących ról.

## Bezpieczeństwo migracji historycznych

Migracja `006-object-storage-images.sql` odmawia przejścia ze starego modelu `bytea`,
jeżeli tabela `incydenty` zawiera dane. Wymaga wtedy osobnego, jawnego eksportu i migracji
zdjęć; nie usuwa zgłoszeń przez `TRUNCATE CASCADE`. Nie obchodź tego warunku na bazie
produkcyjnej. Pusta baza historyczna oraz ponowne zastosowanie migracji są obsługiwane.

Regresję można sprawdzić przez `bun test database/tests/legacy-image-migration.test.ts`.
Test wymaga Dockera i lokalnego obrazu `postgres:18.7-alpine3.24`; tworzy wyłącznie osobny,
jednorazowy kontener bez sieci, opublikowanych portów i trwałych wolumenów.

## Role runtime i kontrolowana aktualizacja istniejącej instalacji

Od migracji 016 jedynym administratorem pozostaje bootstrapowy `POSTGRES_USER` (przykładowo
`zglosto_admin`), dostępny tylko w kontenerze database oraz operacjach migracji/backup/restore.
Runtime nie dostaje jego hasła ani bezpośredniego URL.

| Rola                   | Uprawnienia aplikacyjne                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zglosto_auth`         | CRUD user/session/account/verification; odczyt ról i katalogu usług; aktualizacja przypisania zgłaszającego i aplikacyjnych ról.                       |
| `zglosto_backend`      | CRUD zgłoszeń, zdjęć, uploadów, zadań i outbox; katalog usług; role; wyłącznie kolumny id/email/email_verified tabeli user. Bez sesji, kont i tokenów. |
| `zglosto_media_worker` | SELECT/UPDATE obrazów i zadań; SELECT/DELETE uploadów; SELECT/INSERT ledgeru konsumenta. Bez danych użytkowników, zgłoszeń i outboxa.                  |

Wszystkie trzy role są `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT`.
Nie mają CREATE w schemacie ani TEMP w bazie. Obiekty pozostają własnością administratora.
Trigger `provision_application_user` używa SECURITY DEFINER z ustalonym search_path i zawsze
nadaje wyłącznie `mieszkaniec`; jego bezpośrednie EXECUTE jest odebrane runtime/PUBLIC.
Granty nie otwierają automatycznie przyszłych tabel ani funkcji. Nowe migracje muszą przyznać
wymagane uprawnienia jawnie. PgBouncer nie zawiera `user=` ani hasła w wpisie upstream;
łączy się z PostgreSQL jako uwierzytelniona rola klienta. Trzy hasła są w prywatnym pliku
userlist na tmpfs w produkcji/Kubernetes, potrzebnym do SCRAM obu odcinków.

Świeża baza wykonuje `06-runtime-roles.sh` po schemacie i triggerze. Ręczne ponowne
uruchomienie kontenera z istniejącym wolumenem **nie** migruje poświadczeń ani grantów.
Kontrolowana aktualizacja wymaga okna utrzymaniowego:

1. Zrób backup; zatrzymaj ingress i wszystkie procesy zapisujące, w tym authorization,
   backend, worker oraz PgBouncer. Nie usuwaj istniejących wolumenów.
2. Dostarcz trzy różne hasła runtime (minimum 24 znaki, różne od hasła admina), trzy URL
   zakodowane zgodnie z URI i pasujące do tych haseł, przez pliki z kontraktu wdrożenia.
   Zachowaj osobny `DATABASE_DIRECT_URL` obecnego administratora. Nowe role mają stałe nazwy.
3. Użyj nowego obrazu database i odtwórz tylko jego kontener z nowymi mountami sekretów.
   Zastosuj wymagane migracje schematu jako admin. Migracja 016 tworzy brakujące role
   początkowo NOLOGIN, odbiera nadmiarowe granty/członkostwa i nadaje jawny zestaw uprawnień.
4. Jawnie uruchom `database/apply-runtime-roles.sh --apply-runtime-role-separation`
   z opcjami `docker compose` właściwej instalacji (np. `--env-file ... --file ...`).
   Wrapper wewnątrz obrazu wymaga flagi, używa admin URL i pobiera nowe hasła z plików.
   Można go powtarzać. Nie uruchamia się automatycznie na istniejących danych.
   W Kubernetes/K3s równoważne wywołanie to `kubectl exec ... -- sh
   /docker-entrypoint-initdb.d/apply-runtime-roles.txt --apply-runtime-role-separation`.
5. Odtwórz PgBouncera i runtime z nowymi URL; potwierdź tożsamości oraz logowanie/CRUD.
   Stary bootstrapowy administrator pozostaje wyłącznie kontem operacyjnym. Jeśli miał
   inną nazwę, nie zmieniaj jej automatycznie — dopasuj pliki admina do istniejącej bazy.

Skrypt odmawia obsługi roli runtime będącej właścicielem obiektów. Taką niestandardową
instalację trzeba najpierw kontrolowanie przepisać na właściciela administracyjnego.
Zmiana przykładowego `POSTGRES_USER` nie przemianowuje kont w istniejącym wolumenie.
Nie uruchamiaj starego runtime po migracji z poświadczeniami administratora.

Produkcyjny wrapper wdrożenia stosuje provisioning jako jawny krok po migracjach.
Restore dumpa z `--no-privileges` ponownie nakłada granty przed uruchomieniem aplikacji.
Test `bun test database/tests/runtime-roles.test.ts` używa osobnego PG18.7/PgBouncera,
dedykowanej sieci, efemerycznych certyfikatów i losowego portu wyłącznie localhost; weryfikuje loginy,
CRUD/provisioning, idempotencję, jawny wrapper oraz odmowy operacji administracyjnych.

Pliki źródłowe sekretów w produkcyjnym Compose muszą być czytelne dla odpowiedniego UID/GID:
trzy pliki haseł runtime dla PgBouncera (GID 70, np. root:70 i 0440), a każdy plik URL dla
właściwej aplikacji (GID 10001, np. root:10001 i 0440). Katalog źródłowy pozostaje prywatny
dla administratora; kontener widzi wyłącznie wybrane mounty. Nie polegaj na `uid/gid/mode`
w krótkiej deklaracji Compose secrets — bind mount zachowuje uprawnienia pliku hosta.
Kubernetes stosuje kontrakt 0440 i fsGroup odpowiedniego workloadu.

## Prywatna diagnostyka klasyfikacji LLM

Migracja `017-private-llm-diagnostics.sql` dodaje do `incydenty` pola diagnostyczne.
Należy zastosować ją jako administrator przez bezpośrednie połączenie PostgreSQL
przed uruchomieniem nowego backendu na istniejącym wolumenie. Świeża instalacja ma
te same kolumny i ograniczenia w `03-create-dbtables.sql`. Dotychczasowe rekordy
zachowują `NULL`; migracja nie wylicza historycznych wyników ponownie.

| Kolumna                   | Znaczenie                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `llm_confidence_raw`      | Surowy wynik wybranej klasy po ograniczeniu rozkładu do A/B; liczba 0–1, bez kalibracji na danych mieszkańców                 |
| `llm_p_emergency_raw`     | Surowy wynik opcji `emergency`, niezależnie od wybranej klasy                                                                 |
| `llm_model_id`            | Referencja modelu żądanego przez gateway                                                                                      |
| `llm_model_revision`      | Dokładny digest OCI modelu faktycznie zwróconego przez DMR (`sha256:…`), jeżeli runtime go ujawnił; nie jest sumą samego GGUF |
| `llm_prompt_version`      | Wersja pytania i definicji opcji                                                                                              |
| `llm_latency_ms`          | Zmierzony czas wywołania runtime'u przez gateway, razem z odczytem odpowiedzi                                                 |
| `llm_calibration_version` | Identyfikator zastosowanej kalibracji; w pierwszym etapie `NULL`                                                              |

Dla fallbacku obie wartości surowe pozostają `NULL`. Gateway może zachować znaną
referencję modelu, prompt i czas nieudanej próby; przy błędzie transportu backendu
cała diagnostyka może być niedostępna. Ograniczenia bazy kontrolują zakres i parę
wyników, zgodność confidence z większym wynikiem A/B oraz kompletność metadanych.
Istniejący grant backendu na tabelę obejmuje nowe kolumny; role innych usług nie
otrzymują dodatkowego dostępu.

Dane te nie należą do publicznych DTO ani odpowiedzi list/create dla użytkownika,
operatora czy administratora w aplikacji. Backend rozdziela wynik publiczny od
metadanych prywatnych i przekazuje je tylko do zapisu SQL. Nie zmieniają klasy,
wybranej służby ani progów działania aplikacji.

Przykładowy przegląd diagnostyki przez uprawnione połączenie administracyjne:

```sql
SELECT llm_model_id, llm_model_revision, llm_prompt_version,
       count(*) AS samples,
       avg(llm_confidence_raw) AS mean_raw_score,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY llm_latency_ms) AS p95_latency_ms
FROM incydenty
WHERE llm_source = 'model' AND llm_confidence_raw IS NOT NULL
GROUP BY llm_model_id, llm_model_revision, llm_prompt_version;

SELECT id_zgloszenia, llm_classification, llm_confidence_raw, llm_p_emergency_raw
FROM incydenty
WHERE llm_source = 'model' AND llm_confidence_raw < 0.7
ORDER BY llm_confidence_raw
LIMIT 50;
```

Druga kwerenda jest wyłącznie przykładowym filtrem do ręcznego przeglądu, nie progiem
produkcyjnej decyzji. Surowy score nie mierzy trafności: jej ocenę umożliwi dopiero
osobno przygotowany zbiór zgłoszeń z potwierdzoną prawidłową klasą. W tym etapie nie
powstaje workflow etykietowania ani API do ręcznej oceny.

Test migracji i świeżego schematu:
`bun test database/tests/llm-diagnostics.test.ts --timeout 30000`.
Uruchamia osobny, jednorazowy PostgreSQL bez sieci i portów hosta; wymaga lokalnie
obrazu `postgres:18.7-alpine3.24` (test nie pobiera go automatycznie).
