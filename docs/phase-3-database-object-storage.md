# Faza 3: PostgreSQL, PgBouncer i Object Storage

## Status

Zakres implementacyjny fazy zakończono 2026-07-18. Kroki 1-2 oraz 4-10 są wdrożone:
połączenia aplikacyjne i
operacyjne są rozdzielone, backend oraz authorization łączą się z PostgreSQL wyłącznie przez
PgBouncera, a backend korzysta z neutralnego adaptera S3. RustFS działa jako prywatny lokalny
provider, a zgłoszenia obsługują opcjonalną parę współrzędnych. Produkcyjne testy obciążeniowe
i końcowe strojenie limitów PgBouncera z kroku 3 są świadomie odroczone do Fazy 12. Należy je
wykonać dopiero na samym końcu, gdy wszystkie docelowe systemy, procesy, endpointy i zasoby
infrastruktury będą gotowe oraz stabilne. Zadanie to nie blokuje dalszych faz implementacji.
TLS 1.3 na ścieżce aplikacje -> PgBouncer -> PostgreSQL oraz szyfrowany
`DATABASE_DIRECT_URL` zostały wdrożone w krokach 11-12 Fazy 5. Produkcyjna automatyzacja
certyfikatów zostanie domknięta w Fazach 9 i 12.

## Granice architektury

### PostgreSQL

- `DATABASE_URL` jest jedynym adresem bazy dostępnym dla backendu i authorization.
- `DATABASE_URL` wskazuje PgBouncera na porcie `6432`.
- `DATABASE_DIRECT_URL` zawsze wskazuje PostgreSQL i służy wyłącznie migracjom,
  backup/restore oraz kontrolowanej administracji.
- Usługi aplikacyjne nie otrzymują `DATABASE_DIRECT_URL`.
- `DATABASE_DIRECT_URL` jest obowiązkowy i nie ma fallbacku do aplikacyjnego URL-u.
- PgBouncer korzysta z `DATABASE_DIRECT_URL` wyłącznie jako adresu upstream PostgreSQL.
- Backend i authorization zależą od healthchecka PgBouncera, nie bezpośrednio od kontenera
  bazy.
- Compose używa `pool_mode=transaction`, `auth_type=scram-sha-256` i obsługi protocol-level
  prepared statements.
- Oba odcinki `backend/authorization -> PgBouncer -> PostgreSQL` wymagają TLS 1.3 z
  pełną weryfikacją serwera. SCRAM pozostaje uwierzytelnianiem; nie wprowadzamy mTLS do bazy.

### Object Storage

Kod aplikacyjny i domenowy nie może zależeć od RustFS ani innego konkretnego providera.
Obowiązują nazwy:

- `ObjectStorage` — ogólny interfejs portu aplikacyjnego;
- `S3ObjectStorage` — adapter oparty na `@aws-sdk/client-s3`;
- RustFS — domyślny lokalny provider zgodny z S3, konfigurowany poza kodem.

Nie tworzymy klasy `RustFsStorage`, importów z nazwą RustFS w kodzie domenowym ani zmiennych
`RUSTFS_*` jako kontraktu aplikacji. Konfiguracja adaptera używa neutralnych zmiennych:

- `S3_ENDPOINT`;
- `S3_REGION`;
- `S3_BUCKET`;
- `S3_ACCESS_KEY_ID`;
- `S3_SECRET_ACCESS_KEY`;
- `S3_FORCE_PATH_STYLE`;
- `S3_OBJECT_PREFIX`.
- `S3_AUTO_CREATE_BUCKET` — wyłącznie kontrola inicjalizacji; `true` dla lokalnego Compose,
  `false` dla wcześniej utworzonego zewnętrznego bucketu.

Własny bucket miasta podłącza się przez zmianę `S3_*`, bez zmiany implementacji. Bazowy
Compose ma docelowo pozostać neutralny, a RustFS trafić do lokalnego pliku override/profilu.
Zmiana providera w pustej instalacji nie wymaga migracji. Po pojawieniu się danych przełączenie
bucketu będzie wymagało osobnej procedury kopiowania i weryfikacji checksum.

### Stan danych i przetwarzanie zdjęć

Obecna baza zawiera wyłącznie dane testowe poprzedniej wersji i może zostać wyczyszczona.
Nie projektujemy migracji istniejących zdjęć z `bytea`, dual-write, fallbacku odczytu ani
skryptu kopiującego dane. Wprowadzamy bezpośrednio docelowy schemat PostgreSQL przechowujący
referencje i metadane Object Storage. Nadal potrzebna jest migracja DDL zmieniająca schemat,
ale nie migracja danych użytkowników.

Docelowa obróbka obrazu nie działa w procesie HTTP backendu. W tym samym monorepo powstanie
mały proces `media_worker` w TypeScript, uruchamiany jako osobny kontener i korzystający ze
Sharp. Nie potrzebuje Hono ani własnego publicznego HTTP; przy docelowym backendzie może być
uruchamiany jako NestJS standalone application/microservice i współdzielić moduły oraz typy z
API. Osobny proces izoluje CPU, pamięć i natywny runtime Sharp od żądań użytkowników.

Backend zapisuje oryginał w prywatnym prefiksie tymczasowym i publikuje zadanie zawierające
wyłącznie identyfikator zdjęcia oraz object key. Worker waliduje zawartość i limity obrazu,
normalizuje orientację, usuwa zbędne metadane, konwertuje do WebP, zapisuje wynik oraz
aktualizuje stan `pending`/`processing`/`ready`/`failed`. Binarnych danych nie umieszczamy w
wiadomościach kolejki.

Docelowy minimalny port:

```ts
interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(objectKey: string): Promise<ObjectBody>;
  deleteObject(objectKey: string): Promise<void>;
  objectExists(objectKey: string): Promise<boolean>;
}
```

Szczegółowe typy nie używają `any` ani `undefined`. Nieobecne metadane są reprezentowane
przez `null` albo wariant unii dyskryminowanej.

## Kroki wykonawcze

1. **Wdrożone 2026-07-18 — kontrakt połączeń DB.**
   - dodać `DATABASE_DIRECT_URL` do wersjonowanego wzorca ENV;
   - wymagać `DATABASE_URL` w backendzie bez fallbacku do `DB_*`;
   - przekazywać bezpośredni URL tylko do kontenera operacyjnego bazy;
   - uruchamiać migracje przez `DATABASE_DIRECT_URL`;
   - zachować działający Compose przed dodaniem poolera.
2. **Wdrożone 2026-07-18 — dodać PgBouncer.**
   - przypięto `edoburu/pgbouncer:v1.25.2-p0` po 48-godzinnej kwarantannie;
   - dodano healthcheck wykonujący rzeczywiste `SELECT 1` przez pooler;
   - włączono SCRAM-SHA-256, `pool_mode=transaction` i śledzenie prepared statements;
   - backend i authorization używają wyłącznie `DATABASE_URL` wskazującego PgBouncera;
   - migracje i backupy pozostają na `DATABASE_DIRECT_URL`;
   - izolowany test integracyjny potwierdza działanie Better Auth, `node-postgres`, pełnych
     przepływów biznesowych i brak bezpośredniego URL-u w usługach aplikacyjnych;
   - wartości limitów są startowe i wymagają testów nasycenia w kroku 3.
3. **Odroczone do końcowej bramki Fazy 12 — zweryfikować limity połączeń.**
   - ustalić `max_client_conn`, `default_pool_size`, `reserve_pool_size` i
     `max_connections` PostgreSQL;
   - nie wykonywać finalnego strojenia w trakcie bieżącej Fazy 3;
   - testy obciążeniowe i nasycenia wykonać na samym końcu prac, dopiero gdy gotowe i stabilne
     będą wszystkie docelowe systemy, w tym NestJS, authorization, RabbitMQ, `media_worker`,
     `llm_gateway`, frontend oraz docelowy runtime infrastruktury;
   - testować kompletny ruch przez rzeczywiste endpointy i procesy asynchroniczne, zamiast
     opierać strojenie na historycznych pomiarach usuniętego backendu Express;
   - po pomiarach zapisać finalne limity dla konkretnego profilu zasobów produkcyjnych;
   - nie dawać `llm_gateway` dostępu do DB bez uzasadnionej funkcji.
4. **Wdrożone 2026-07-18 — neutralny port Object Storage.**
   - dodano `ObjectStorage` i pełne typy operacji bez `any`/`undefined`;
   - dodano `S3ObjectStorage` na przypiętym `@aws-sdk/client-s3@3.1088.0`;
   - dodano ścisłą walidację `S3_*`, bezpieczne klucze względne i readiness bucketu;
   - obiekty pozostają prywatne, a checksum SHA-256 jest zapisywany w metadanych.
5. **Wdrożone 2026-07-18 — RustFS jako lokalny provider.**
   - przypięto `rustfs/rustfs:1.0.0-rc.5`, prywatną sieć, trwały wolumen i healthcheck;
   - backend inicjalizuje bucket tylko przy `S3_AUTO_CREATE_BUCKET=true`;
   - kod aplikacyjny nie otrzymuje `RUSTFS_*` ani portów RustFS na hoście;
   - izolowana integracja wykonuje rzeczywiste `put/get/head/delete` przez ten sam adapter;
   - potwierdzenie z zewnętrznym testowym bucketem S3-compatible pozostaje testem
     przedprodukcyjnym, wymagającym poświadczeń do wybranego środowiska.
6. **Wdrożone 2026-07-18 — docelowy model danych zdjęć.**
   - migracja DDL usuwa oba pola `bytea`; jednorazowo czyści stare dane testowe, ale nie
     implementuje migracji danych, dual-write ani fallbacku;
   - tabela `incident_images` rozdziela zdjęcie zgłoszenia i rozwiązania, wymuszając jedno
     zdjęcie danego rodzaju na zgłoszenie;
   - przechowuje stan `pending`/`processing`/`ready`/`failed`, metadane oryginału i WebP,
     wymiary, MIME, rozmiar, checksum SHA-256 i kod błędu;
   - backend waliduje base64, limit 5 MiB oraz magic bytes JPEG/PNG/GIF/WebP i zapisuje plik
     wyłącznie przez `ObjectStorage`;
   - listy API zwracają typowaną neutralną referencję zamiast danych binarnych, a prywatny
     endpoint `/api/images/:id` egzekwuje dostęp mieszkańca, właściwej służby lub admina;
   - zdjęcie rozwiązania staje się publiczne dopiero dla zgłoszenia o statusie `resolved`.
7. **Wdrożone 2026-07-18 — osobne warianty pełny i NoRustFS.**
   - domyślny `docker-compose.yml` jest wygodnym pełnym runtime'em lokalnym i składa
     provider-neutralny rdzeń z lokalnym RustFS;
   - usługa, wolumen i zależność startowa RustFS znajdują się w
     `docker-compose.rustfs.yml`;
   - samodzielny `docker-compose.no-rustfs.yml` wymaga jawnego neutralnego `S3_ENDPOINT`,
     domyślnie nie tworzy bucketu i nie zawiera nazwy ani zmiennych RustFS;
   - AWS S3, Cloudflare R2 lub inny istniejący bucket działa przez wariant NoRustFS oraz `S3_*`;
   - fail-fast i readiness `HeadBucket` pozostają niezależne od providera;
   - test konfiguracji sprawdza brak usługi i zależności RustFS w wariancie NoRustFS, a
     integracja lokalna składa pełny zestaw i wykonuje rzeczywiste operacje S3.
8. **Wdrożone 2026-07-18 — kontrakt asynchronicznego przetwarzania mediów.**
   - `@zglosto/contracts` udostępnia V1 żądania, sukcesu i błędu bez `any`/`undefined`;
   - wiadomości zawierają identyfikatory, rewizję i metadane Object Storage, nigdy binarne
     zdjęcia ani base64;
   - zdefiniowano nazwy exchange, routing key, kolejki głównej, retry, DLQ, cztery próby i
     backoff 5 s / 30 s / 5 min;
   - `media_processing_jobs` zapewnia trwały stan i idempotencję `imageId + revision`, a
     `outbox_events` atomowo zapisuje zdarzenie z aktualizacją zdjęcia;
   - ponowny upload oznacza stare zadanie jako `superseded`, a nieopublikowany outbox jako
     `discarded`;
   - implementację publishera, RabbitMQ, `media_worker` i Sharp wykonamy razem z NestJS w
     Fazie 6 zgodnie z [kontraktem mediów](media-processing-contract.md).
9. **Wdrożone 2026-07-18 — dane lokalizacyjne pod mapy.**
   - tekstowy `adres_zgloszenia` pozostaje wymagany i czytelny dla użytkownika;
   - nullable `latitude` i `longitude` są częścią schematu, kontraktów wejścia i odpowiedzi;
   - współrzędne WGS84 muszą wystąpić jako para, z zakresami `-90..90` i `-180..180`
     pilnowanymi zarówno przez parser kontraktu, jak i PostgreSQL;
   - starszy klient bez pól współrzędnych jest normalizowany na parę `null`, bez `undefined` w
     logice domenowej;
   - zapis nie wywołuje geokodera i działa poprawnie bez współrzędnych.
10. **Wdrożone 2026-07-18 — lifecycle i backup/restore.**
    - wspólny backup składa się z logicznego dumpu PostgreSQL, archiwum aktywnego Object
      Storage, raportu audytu, metadanych i sum SHA-256;
    - backup i restore używają `DATABASE_DIRECT_URL` oraz neutralnego API S3, więc działają z
      RustFS i wariantem NoRustFS;
    - audyt wykrywa referencje bez obiektu oraz obiekty osierocone, ale nie usuwa ich
      automatycznie;
    - naprawiono uruchamianie pgBackRest, archiwizację WAL, pełny/różnicowy harmonogram i
      retencję;
    - izolowany test niszczy wiersze oraz obiekt, odtwarza oba magazyny i sprawdza ich
      końcową spójność;
    - runbook znajduje się w [backup-restore.md](backup-restore.md).

## Definicja ukończenia

- aplikacje łączą się z PostgreSQL przez PgBouncer;
- migracje i operacje administracyjne omijają pooler;
- zdjęcia nie są zapisywane w `bytea`;
- PostgreSQL przechowuje tylko referencje i metadane obiektów;
- wariant NoRustFS uruchamia się z zewnętrznym bucketem wskazanym przez `S3_*`;
- kod domenowy nie zna nazwy providera;
- kontrakt zadań mediów jest gotowy dla osobnego workera Fazy 6;
- backup i restore bazy oraz obiektów są przetestowane;
- pełna bramka `pnpm check` i izolowane testy Compose przechodzą.
