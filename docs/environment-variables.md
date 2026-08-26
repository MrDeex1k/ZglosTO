# Zmienne środowiskowe

## Zasady

- `.env.example` jest wersjonowanym wzorcem konfiguracji; wartości `S3_*` wskazują lokalny
  override RustFS i muszą zostać zastąpione przy zewnętrznym providerze.
- Lokalny `.env` nie jest wersjonowany i nie może zawierać wartości produkcyjnych w repozytorium.
- Compose przekazuje każdej usłudze tylko potrzebne jej zmienne; cały `.env` nie jest wstrzykiwany globalnie.
- Sekrety produkcyjne trafiają do zewnętrznego menedżera sekretów, Compose secrets albo
  Kubernetes Secret/CSI, zależnie od profilu. Nie trafiają do obrazu, zwykłego
  produkcyjnego `.env`, ConfigMap ani White-Label YAML.
- Frontend otrzymuje wyłącznie publiczne wartości `VITE_*`. Sekretów nie wolno nazywać prefiksem `VITE_`.
- Backend i authorization przerywają start przy braku wymaganej zmiennej albo nieprawidłowym URL-u, porcie lub timeoutcie.

Start lokalny:

```bash
cp .env.example .env
# zastąp wszystkie wartości replace-with-... własnymi losowymi wartościami
docker compose config --quiet
docker compose up --build
```

Docelowe wdrożenia Compose, Kubernetes i K3s używają tego samego kontraktu nazw i walidacji
zmiennych. Różni się mechanizm dostarczenia: produkcyjny Compose montuje sekrety jako pliki
read-only albo pobiera je z menedżera sekretów, a profile klastrowe korzystają z
Secret/CSI lub zewnętrznego operatora. Instrukcja produkcyjna nie może polegać na kopiowaniu
lokalnego `.env` na serwer.

Produkcyjny Compose składa moduły przez cztery jawne zmienne:

| Zmienna               | Domyślna   | Dozwolone wartości              |
| --------------------- | ---------- | ------------------------------- |
| `OBJECT_STORAGE_MODE` | `local`    | `local`, `external`             |
| `REDIS_MODE`          | `disabled` | `disabled`, `local`, `external` |
| `OBSERVABILITY_MODE`  | `disabled` | `disabled`, `local`, `external` |
| `LLM_MODE`            | `disabled` | `disabled`, `local`, `external` |

Object Storage nie ma trybu `disabled`. Wartości obrazów ZgłosTO nie znajdują się
w produkcyjnym ENV: pochodzą wyłącznie z prywatnego `images.env` wygenerowanego przez
`pnpm build:production`. Szczegóły opisuje
[Faza 11 / krok 10](phase-11-step-10-production-compose-modules.md).

W Kubernetes/K3s publiczny runtime ENV jest źródłowo zapisany w
`k8s/base/config/runtime.env`, a Kustomize tworzy immutable ConfigMap z hashem treści.
Sekrety zachowują nazwy z tabel poniżej, ale są montowane jako pliki i wskazywane zmiennymi
`*_FILE`. Nazwy zasobów, klucze i odbiorców — bez wartości — określa
`deploy/cluster-secret-contract.json`. Brak wymaganego Secretu lub klucza blokuje start
workloadu; nie ma fallbacku do publicznej ConfigMap.

## Obserwowalność

Obserwowalność ma trzy wzajemnie wyłączne tryby. `both` jest celowo niedozwolony.

| Zmienna                            | Wymagana            | Sekret | Opis                                                           |
| ---------------------------------- | ------------------- | ------ | -------------------------------------------------------------- |
| `OBSERVABILITY_MODE`               | nie                 | nie    | `disabled`, `external` albo `local`; domyślnie `disabled`.     |
| `OTEL_DEPLOYMENT_ENVIRONMENT`      | włączona telemetria | nie    | Stabilna nazwa środowiska, np. `development` lub `production`. |
| `OTEL_SERVICE_VERSION`             | włączona telemetria | nie    | Niezmienna wersja wydania widoczna w zasobie OTel.             |
| `OTEL_EXTERNAL_ENDPOINT`           | tryb `external`     | nie    | Docelowy endpoint OTLP używany wyłącznie przez Collector.      |
| `OTEL_EXTERNAL_AUTH_HEADER_NAME`   | nie                 | nie    | Nazwa nagłówka autoryzacyjnego; domyślnie `Authorization`.     |
| `OTEL_EXTERNAL_AUTHORIZATION_FILE` | tryb `external`     | tak    | Plik z wartością nagłówka, montowany wyłącznie do Collectora.  |
| `GRAFANA_ADMIN_USER`               | nie                 | nie    | Lokalny administrator Grafany; domyślnie `admin`.              |
| `GRAFANA_ADMIN_PASSWORD_FILE`      | tryb `local`        | tak    | Plik z hasłem administratora Grafany.                          |
| `GRAFANA_PORT`                     | nie                 | nie    | Port loopback lokalnej Grafany Compose; domyślnie `3001`.      |

Aplikacje nie otrzymują poświadczeń zewnętrznego backendu. W trybach `external` i `local`
otrzymują tylko `OTEL_EXPORTER_OTLP_ENDPOINT` wskazujący prywatny Collector oraz własne,
stałe `OTEL_SERVICE_NAME`. Brak Collectora lub błąd eksportu nie może blokować ich startu,
requestu ani zadania RabbitMQ.

## Redis i rate limiting — Faza 10

Kontrakt konfiguracji został wdrożony w kroku 1 Fazy 10, krok 2 podłączył lokalne
limitery, krok 3 dostarczył wspólną fabrykę i adapter oficjalnego klienta Redis, a kroki
4-5 podłączyły Better Auth i rozproszone limity publicznego zapisu. Cache publicznej listy
powstał w kroku 6, a krok 9 dostarczył profile wdrożeniowe. Authorization i backend
walidują ustawienia podczas startu.
`REDIS_MODE` ma
wzajemnie wyłączne tryby, zgodne dla Compose, Kubernetes i K3s:

| Zmienna                               | Wymagana                  | Sekret | Domyślna | Opis                                                                                         |
| ------------------------------------- | ------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `REDIS_MODE`                          | nie                       | nie    | disabled | `disabled`, `local` albo `external`. Wyłącza Redis, nigdy lokalny limiter.                   |
| `REDIS_URL_FILE`                      | `local` lub `external`    | tak    | —        | Plik z pełnym adresem i poświadczeniem; trafia wyłącznie do Authorization i backendu.        |
| `RATE_LIMIT_HMAC_KEY_FILE`            | `local` lub `external`    | tak    | —        | Wspólny dla replik losowy klucz min. 32 bajty do pseudonimizacji IP i identyfikatorów.       |
| `REDIS_TLS_CA_PATH`                   | szyfrowany endpoint Redis | nie    | —        | Ścieżka CA do pełnej weryfikacji serwera.                                                    |
| `REDIS_CONNECT_TIMEOUT_MS`            | nie                       | nie    | `1000`   | Limit zestawienia połączenia; błąd uruchomi bezpieczny fallback.                             |
| `REDIS_COMMAND_TIMEOUT_MS`            | nie                       | nie    | `500`    | Limit operacji cache/limiter; Redis nie może blokować requestu bez końca.                    |
| `REDIS_KEY_PREFIX`                    | nie                       | nie    | zglosto  | Prefix instalacji: małe litery, cyfry, `:`, `_`, `-`; bez danych osoby ani surowego e-maila. |
| `CLIENT_IP_TRUSTED_PROXY_HOPS`        | nie                       | nie    | `1`      | Zaufane proxy od prawej strony XFF; Compose `1`, Kubernetes/K3s `2`.                         |
| `HOMEPAGE_CACHE_TTL_SECONDS`          | nie                       | nie    | `900`    | TTL współdzielonego cache’u publicznej listy.                                                |
| `HOMEPAGE_NGINX_MICROCACHE_SECONDS`   | tryb Redis                | nie    | `30`     | Lokalny microcache każdej repliki Nginx.                                                     |
| `HOMEPAGE_NGINX_DISABLED_TTL_SECONDS` | `REDIS_MODE=disabled`     | nie    | `900`    | Cache publicznego endpointu w pojedynczym Compose.                                           |

Backend przekazuje wybraną wartość do exact-match cache Nginx przez wewnętrzny
`X-Accel-Expires`; nagłówek nie jest zwracany publicznemu klientowi. Kubernetes/K3s oraz
wieloreplikowy Compose wymagają `REDIS_MODE=local` albo `external`, więc każda replika
Nginx utrzymuje tylko 30-sekundowy microcache.

Jawne wartości startowe limiterów:

| Zmienna                                         | Domyślna | Znaczenie                                           |
| ----------------------------------------------- | -------- | --------------------------------------------------- |
| `AUTH_LOCAL_RATE_LIMIT_WINDOW_MS`               | `1000`   | Okno lokalnej ochrony burstu przed Better Auth.     |
| `AUTH_LOCAL_RATE_LIMIT_MAX_REQUESTS`            | `50`     | Maksymalna liczba żądań auth w lokalnym oknie.      |
| `AUTH_LOCAL_RATE_LIMIT_MAX_KEYS`                | `50000`  | Limit kluczy w pamięci procesu Authorization.       |
| `AUTH_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS`     | `60000`  | Interwał przyszłego sprzątania wygasłych liczników. |
| `INCIDENT_LOCAL_RATE_LIMIT_WINDOW_MS`           | `10000`  | Okno lokalnego burstu publicznego zapisu.           |
| `INCIDENT_LOCAL_RATE_LIMIT_MAX_REQUESTS`        | `5`      | Lokalny limit żądań w oknie.                        |
| `INCIDENT_LOCAL_RATE_LIMIT_MAX_KEYS`            | `50000`  | Limit kluczy w pamięci procesu backendu.            |
| `INCIDENT_LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS` | `60000`  | Interwał przyszłego sprzątania wygasłych liczników. |
| `INCIDENT_IP_RATE_LIMIT_WINDOW_MS`              | `900000` | Okno rozproszonego limitu IP.                       |
| `INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS`           | `10`     | Liczba zgłoszeń z IP w 15 minut.                    |
| `INCIDENT_USER_RATE_LIMIT_WINDOW_MS`            | `900000` | Okno rozproszonego limitu zalogowanego użytkownika. |
| `INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS`         | `20`     | Liczba zgłoszeń użytkownika w 15 minut.             |
| `INCIDENT_GLOBAL_RATE_LIMIT_WINDOW_MS`          | `60000`  | Okno bezpiecznika całej instalacji.                 |
| `INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS`       | `300`    | Liczba zgłoszeń całej instalacji na minutę.         |

Lokalny limiter jest częścią kodu Authorization i backendu, pozostaje zawsze aktywny i nie
ma zmiennej `LOCAL_RATE_LIMIT_ENABLED`. Progi burstu, IP, użytkownika i globalnego ruchu
instalacji są jawnie nazwane, walidowane jako dodatnie liczby całkowite i testowane.
Powyższe wartości są konfiguracją startową; ich wartości końcowe zostaną dostrojone w
Fazie 12. E-mail nie jest samodzielnym twardym kluczem blokującym.

`CLIENT_IP_TRUSTED_PROXY_HOPS` musi być dodatnią liczbą całkowitą. W Compose aplikacja
pomija bezpośredni Nginx. W Kubernetes i K3s pomija Nginx oraz Ingress. Algorytm idzie od
prawej strony zwalidowanego łańcucha adresów, dlatego nie ufa automatycznie lewemu
elementowi dostarczonemu przez klienta. Zmiana topologii proxy wymaga równoczesnej zmiany
tej wartości i testu negatywnego spoofingu.

W `disabled` nie przekazujemy usługom adresu ani sekretów Redisa. W `local` profil dostarcza
Redis, a w `external` operator podaje adres przez Secret. Kod używa lokalnego limitera i
odpytuje PostgreSQL po cache miss podczas awarii Redis. Authorization i backend raportują
wtedy `200` + `status: degraded`; metryki i alerty rozróżniają usługę oraz tryb. Szczegółowy
kontrakt znajduje się w
[planie Fazy 10](phase-10-redis-cache-rate-limiting.md).
Procedury wdrożenia, diagnozy i odzyskania opisuje [runbook Redis](redis-operations.md).

Profile Compose używają osobnych override’ów:

- `docker-compose.redis.local.yml`: wymaga `REDIS_URL_SECRET_FILE`,
  `RATE_LIMIT_HMAC_KEY_SECRET_FILE` i `REDIS_ACL_FILE`;
- `docker-compose.redis.external.yml`: wymaga `REDIS_URL_SECRET_FILE`,
  `RATE_LIMIT_HMAC_KEY_SECRET_FILE` i `REDIS_TLS_CA_FILE`.

Lokalny URL wskazuje `redis://zglosto:<hasło>@redis:6379/0`, a odpowiadający mu ACL
ogranicza użytkownika do kluczy `<REDIS_KEY_PREFIX>:*`. Użytkownik `default` jest wyłączony,
a healthcheck Redis uwierzytelnia się adresem odczytanym z tego samego pliku Secret co
aplikacje. Profil zewnętrzny wymaga `rediss://`; połączenie weryfikuje
hostname, SNI i zamontowany CA. Hasło Redis oraz klucz HMAC muszą być niezależnymi,
losowymi sekretami.

Kubernetes/K3s oczekują od zewnętrznego mechanizmu sekretów:

| Profil     | Secret                      | Klucze                             |
| ---------- | --------------------------- | ---------------------------------- |
| oba        | `zglosto-redis-credentials` | `REDIS_URL`, `RATE_LIMIT_HMAC_KEY` |
| `local`    | `zglosto-redis-acl`         | `users.acl`                        |
| `external` | `zglosto-redis-external-ca` | `ca.crt`                           |

Kustomize nie renderuje wartości Secretów. Lokalny Redis nie ma PVC ani backupu, ponieważ
cache i liczniki są odtwarzalne; utrata poda powoduje jedynie kontrolowaną degradację.

## Wspólne i bazodanowe

| Zmienna                          | Wymagana | Sekret | Używana przez                                   | Opis                                                               |
| -------------------------------- | -------- | ------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                       | nie      | nie    | backend, authorization, media_worker            | `development`, `test` albo `production`; domyślnie `development`.  |
| `POSTGRES_USER`                  | tak      | nie    | database                                        | Użytkownik inicjalnej bazy.                                        |
| `POSTGRES_PASSWORD`              | tak      | tak    | database                                        | Hasło bazy; w produkcji z Secret.                                  |
| `POSTGRES_DB`                    | tak      | nie    | database                                        | Nazwa bazy, obecnie `zglosto_db`.                                  |
| `POSTGRES_PORT`                  | tak      | nie    | database/Compose                                | Port PostgreSQL wewnątrz kontenera i opcjonalne mapowanie lokalne. |
| `DATABASE_URL`                   | tak      | tak    | backend, authorization, media_worker, pgbouncer | Aplikacyjny URL bazy wskazujący PgBouncer.                         |
| `DATABASE_DIRECT_URL`            | tak      | tak    | pgbouncer, migracje, backup, administracja      | Bezpośredni URL PostgreSQL omijający pooler.                       |
| `DATABASE_TLS_CA_PATH`           | tak      | nie    | backend, authorization, media_worker            | Ścieżka Database CA używanego do weryfikacji DNS `pgbouncer`.      |
| `DATABASE_POOL_MAX`              | nie      | nie    | backend                                         | Maksymalna liczba połączeń stałej puli procesu; domyślnie `10`.    |
| `DATABASE_IDLE_TIMEOUT_MS`       | nie      | nie    | backend                                         | Zamknięcie bezczynnego połączenia; domyślnie `30000`.              |
| `DATABASE_CONNECTION_TIMEOUT_MS` | nie      | nie    | backend                                         | Limit zestawienia połączenia; domyślnie `5000`.                    |
| `PGBOUNCER_PORT`                 | nie      | nie    | pgbouncer, Compose                              | Port poolera w sieci wewnętrznej; domyślnie `6432`.                |

`DATABASE_URL` wskazuje `pgbouncer:6432`, natomiast `DATABASE_DIRECT_URL` wskazuje
`database:54325`. Oba adresy są obowiązkowe i nie mają wzajemnego fallbacku. Po aktualizacji
repozytorium trzeba ponownie zsynchronizować lokalny `.env` z `.env.example`.

Backend i authorization nie otrzymują `DATABASE_DIRECT_URL`. Migracje, backup/restore oraz
kontrolowana administracja nie używają `DATABASE_URL`, aby nie przechodzić przez transaction
pooling. Skrypty migracyjne repozytorium wykonują `psql` przez `DATABASE_DIRECT_URL` z
`PGSSLMODE=verify-full` i `PGSSLROOTCERT` wskazującym Database CA. Parametry `sslmode`,
`sslcert`, `sslkey` i `sslrootcert` w aplikacyjnym URL-u są zabronione, aby nie mogły nadpisać
zwalidowanej konfiguracji TLS klienta.

Backend NestJS utrzymuje jedną pulę `pg` na proces i zawsze łączy ją z `DATABASE_URL`, czyli
z PgBouncerem. Pula jest inicjalizowana leniwie, współdzielona przez healthchecki i operacje
domenowe oraz zamykana przez lifecycle aplikacji. Jej limit musi pozostać wyraźnie niższy od
limitów PgBouncera; końcowe wartości zostaną dobrane w zaplanowanych testach obciążeniowych.
`media_worker` ma osobną pulę z lokalnym limitem `MEDIA_WORKER_DATABASE_POOL_MAX=2`, dzięki
czemu nie współdzieli połączeń ani cyklu życia z procesem HTTP.

Startowe ustawienia poolera są jawne w `.env.example`:

| Zmienna                              | Domyślna | Znaczenie                                   |
| ------------------------------------ | -------- | ------------------------------------------- |
| `PGBOUNCER_MAX_CLIENT_CONN`          | `100`    | Maksymalna liczba klientów poolera.         |
| `PGBOUNCER_DEFAULT_POOL_SIZE`        | `20`     | Podstawowy limit połączeń upstream na pulę. |
| `PGBOUNCER_RESERVE_POOL_SIZE`        | `5`      | Awaryjne połączenia upstream dla kolejki.   |
| `PGBOUNCER_MAX_PREPARED_STATEMENTS`  | `200`    | Cache protocol-level prepared statements.   |
| `PGBACKREST_BACKUP_INTERVAL_SECONDS` | `86400`  | Odstęp między backupami scheduler sidecara. |

Wartości są bezpiecznym punktem startowym, ale nie są jeszcze wynikiem testu obciążeniowego.
Krok 3 Fazy 3 jest świadomie odroczony do końcowej bramki Fazy 12: testy kompletnego systemu,
strojenie tych wartości i ich relacji z `max_connections` PostgreSQL należy wykonać dopiero na
samym końcu prac, gdy wszystkie usługi i docelowa infrastruktura będą gotowe oraz stabilne.

W Kubernetes/K3s PostgreSQL działa jako StatefulSet. Sidecar pgBackRest wykonuje backup
różnicowy po każdym interwale, a w niedzielę pełny. Finalna retencja, restore drill oraz
potwierdzone RPO/RTO należą do Fazy 12. Zmienna interwału nie może zawierać sekretu.

## RabbitMQ i transactional outbox

RabbitMQ jest prywatnym brokerem zadań. Backend łączy się wyłącznie przez AMQPS/TLS 1.3,
weryfikuje certyfikat `rabbitmq` przez Service CA i nie ma fallbacku do plaintext AMQP.

| Zmienna                       | Wymagana | Sekret | Opis                                                                   |
| ----------------------------- | -------- | ------ | ---------------------------------------------------------------------- |
| `RABBITMQ_USER`               | tak      | nie    | Użytkownik tworzony lokalnie dla dedykowanego vhostu.                  |
| `RABBITMQ_PASSWORD`           | tak      | tak    | Hasło brokera; produkcyjnie pochodzi z menedżera sekretów.             |
| `RABBITMQ_VHOST`              | nie      | nie    | Izolowany vhost; domyślnie `zglosto`.                                  |
| `RABBITMQ_URL`                | tak      | tak    | Pełny URL `amqps://`; wariant `amqp://` jest odrzucany.                |
| `RABBITMQ_TLS_CA_PATH`        | tak      | nie    | Service CA używane do weryfikacji certyfikatu brokera.                 |
| `RABBITMQ_SERVER_NAME`        | tak      | nie    | Oczekiwany DNS SAN, lokalnie `rabbitmq`.                               |
| `RABBITMQ_HEARTBEAT_SECONDS`  | nie      | nie    | Heartbeat AMQP; domyślnie `30`.                                        |
| `RABBITMQ_RECONNECT_DELAY_MS` | nie      | nie    | Minimalne odroczenie kolejnej publikacji po awarii; domyślnie `1000`.  |
| `RABBITMQ_PUBLISHER_ENABLED`  | nie      | nie    | Pozwala wyłączyć pętlę publishera w izolowanym teście; domyślnie true. |
| `OUTBOX_POLL_INTERVAL_MS`     | nie      | nie    | Odstęp między pustymi próbami odczytu outboxa; domyślnie `1000`.       |
| `OUTBOX_BATCH_SIZE`           | nie      | nie    | Maksymalna partia blokowana przez `SKIP LOCKED`; domyślnie `25`.       |
| `OUTBOX_LOCK_TIMEOUT_MS`      | nie      | nie    | Czas odzyskania osieroconego stanu `publishing`; domyślnie `30000`.    |

Zwykły Compose nie publikuje portu `5671` na hoście, a obraz RabbitMQ nie uruchamia pluginu
ani listenera management. Izolowana integracja wystawia tymczasowo wyłącznie AMQPS.
Backend nie zależy startowo od health brokera, ponieważ trwały PostgreSQL outbox ma
przyjąć zapis także podczas awarii RabbitMQ.

## Standalone `media_worker`

| Zmienna                           | Domyślna                         | Opis                                              |
| --------------------------------- | -------------------------------- | ------------------------------------------------- |
| `SERVICE_NAME`                    | `media_worker` w Compose         | Ustawia tożsamość usługi w strukturalnych logach. |
| `MEDIA_WORKER_DATABASE_POOL_MAX`  | `2`                              | Osobny limit puli procesu workera.                |
| `MEDIA_WORKER_HEALTH_FILE`        | `/tmp/zglosto-media-worker.json` | Prywatny artefakt readiness wewnątrz kontenera.   |
| `MEDIA_WORKER_HEALTH_INTERVAL_MS` | `5000`                           | Odstęp sond PostgreSQL i RabbitMQ.                |
| `MEDIA_WORKER_HEALTH_STALE_MS`    | `20000`                          | Maksymalny wiek poprawnego artefaktu health.      |
| `MEDIA_WORKER_PREFETCH`           | `1`                              | Maksymalna liczba niepotwierdzonych zadań.        |
| `MEDIA_MAX_INPUT_BYTES`           | `5242880`                        | Maksymalny rozmiar oryginału.                     |
| `MEDIA_MAX_INPUT_WIDTH`           | `8192`                           | Maksymalna szerokość po uwzględnieniu orientacji. |
| `MEDIA_MAX_INPUT_HEIGHT`          | `8192`                           | Maksymalna wysokość po uwzględnieniu orientacji.  |
| `MEDIA_MAX_INPUT_PIXELS`          | `32000000`                       | Limit pikseli dekodera i walidacji.               |
| `MEDIA_MAX_OUTPUT_DIMENSION`      | `2000`                           | Maksymalny dłuższy bok wynikowego WebP.           |
| `MEDIA_SHARP_CONCURRENCY`         | `1`                              | Współbieżność libvips w procesie workera.         |
| `MEDIA_WEBP_QUALITY`              | `85`                             | Jakość kodowania WebP.                            |
| `MEDIA_WEBP_EFFORT`               | `4`                              | Nakład CPU kodowania WebP w zakresie 0-6.         |

Worker nie wystawia portu HTTP. Docker uruchamia lokalny skrypt healthcheck, który waliduje
schemat i świeżość artefaktu oraz sprawdza, czy wskazany PID nadal istnieje. Compose przekazuje
mu `DATABASE_*`, `RABBITMQ_*`, neutralne `S3_*` i limity obrazu; nigdy nie otrzymuje zmiennych
Authorization ani provider-specific `RUSTFS_*`.

## Object Storage

Backend używa wyłącznie neutralnej konfiguracji S3-compatible. Nazwa lokalnego providera nie
jest częścią kontraktu aplikacji.

| Zmienna                    | Wymagana | Sekret | Opis                                                                 |
| -------------------------- | -------- | ------ | -------------------------------------------------------------------- |
| `S3_ENDPOINT`              | tak      | nie    | Endpoint aktywnego providera; lokalnie `http://rustfs:9000`.         |
| `S3_PUBLIC_ENDPOINT`       | tak      | nie    | Publiczny endpoint uploadu przez NGINX, używany do podpisywania PUT. |
| `S3_UPLOAD_EXPIRY_SECONDS` | nie      | nie    | Ważność presigned PUT; domyślnie `300`, zakres 60–3600 sekund.       |
| `S3_REGION`                | tak      | nie    | Region podpisu AWS Signature V4; lokalnie `eu-central-1`.            |
| `S3_BUCKET`                | tak      | nie    | Prywatny bucket jednej instalacji/miasta.                            |
| `S3_ACCESS_KEY_ID`         | tak      | tak    | Identyfikator klucza dostępowego przekazywany wyłącznie backendowi.  |
| `S3_SECRET_ACCESS_KEY`     | tak      | tak    | Sekretny klucz dostępu przekazywany wyłącznie backendowi.            |
| `S3_FORCE_PATH_STYLE`      | tak      | nie    | `true` dla RustFS; dla zewnętrznego providera zgodnie z jego API.    |
| `S3_OBJECT_PREFIX`         | nie      | nie    | Opcjonalny prefiks kluczy, lokalnie `incidents`.                     |
| `S3_AUTO_CREATE_BUCKET`    | nie      | nie    | `true` lokalnie; `false` dla provisionowanego zewnętrznego bucketu.  |

RustFS otrzymuje provider-specific `RUSTFS_ACCESS_KEY` i `RUSTFS_SECRET_KEY` wyłącznie jako
mapowanie infrastrukturalne w `docker-compose.rustfs.yml`. Domyślny `docker-compose.yml`
składa pełny lokalny runtime z RustFS. Provider-neutralny `docker-compose.no-rustfs.yml` nie
definiuje usługi, wolumenu ani zależności od RustFS i wymaga jawnych `S3_ENDPOINT` oraz
`S3_PUBLIC_ENDPOINT`. Pierwszy jest adresem wewnętrznym usług, drugi adresem widocznym dla
przeglądarki i używanym wyłącznie do podpisywania krótkotrwałych PUT. Czas ważności określa
`S3_UPLOAD_EXPIRY_SECONDS` (domyślnie 300 sekund). Backend
nie otrzymuje żadnej zmiennej `RUSTFS_*`.
Zmiana na własny bucket wymaga podmiany `S3_*` oraz `S3_AUTO_CREATE_BUCKET=false`, ale nie
zmiany kodu. Istniejące obiekty nie przenoszą się automatycznie między bucketami.

Lokalny RustFS nie publikuje żadnego portu hosta i jest osiągalny tylko w `internal-net`.
Przeglądarka wysyła podpisany `PUT` przez jedyny publiczny punkt wejścia — osobny host NGINX
`uploads.*` (`http://uploads.localhost:1235` lokalnie). NGINX dopuszcza na tym hoście tylko
`PUT` i `OPTIONS`, zachowuje podpisaną ścieżkę, query string i nagłówek `Host`, po czym przekazuje
strumień do `rustfs:9000`. Produkcyjny certyfikat TLS musi obejmować zarówno domenę aplikacji,
jak i domenę uploadu, np. `zglosto.example.invalid` oraz `uploads.zglosto.example.invalid`.
Dla zewnętrznego S3/R2 `S3_PUBLIC_ENDPOINT` wskazuje bezpośrednio endpoint providera; należy
skonfigurować CORS dla originu frontendu, metody `PUT` oraz podpisanych nagłówków
`content-type` i `x-amz-meta-checksum-sha256`.

NestJS utrzymuje jeden provider-neutralny klient Object Storage na proces. Ten sam provider
obsługuje readiness, presigned upload oryginałów i odczyt przez `/api/images/:id`, a podczas shutdownu
zamyka transport AWS SDK. `incident_images` przechowuje wyłącznie metadane i object keys;
binaria nie trafiają do PostgreSQL ani RabbitMQ.

Lokalny wariant:

```bash
docker compose up -d --build
```

Zewnętrzny bucket bez uruchamiania RustFS:

```bash
docker compose -f docker-compose.no-rustfs.yml up -d --build
```

Readiness backendu nadal wykonuje `HeadBucket`; błędne poświadczenia, endpoint lub brak
bucketu powodują fail-fast/stan `503`, niezależnie od wybranego providera.

## White-Label

| Zmienna              | Wymagana | Sekret | Używana przez          | Opis                                                         |
| -------------------- | -------- | ------ | ---------------------- | ------------------------------------------------------------ |
| `WHITE_LABEL_CONFIG` | tak      | nie    | backend, authorization | Ścieżka do jednego, wersjonowanego pliku YAML danego miasta. |

Domyślna konfiguracja repozytorium znajduje się w
[`config/white-label/zglosto.yaml`](../config/white-label/zglosto.yaml). Compose montuje tylko
ten jeden plik jako `/app/config/city.yaml` w trybie read-only. Dla lokalnego procesu Node
można podać ścieżkę względną wobec katalogu uruchomienia, np.:

```bash
WHITE_LABEL_CONFIG=./config/white-label/zglosto.yaml pnpm dev:backend
```

YAML jest publiczną konfiguracją produktu, a nie miejscem na sekrety. Cała jego dozwolona
część może trafić do bundla przeglądarkowego lub `GET /api/config/public`. Loader odrzuca brak
pliku, błędny YAML, nieznane pola, nazwy pól przeznaczone na sekrety, materiał kluczy/tokenów,
URL-e z poświadczeniami oraz składnię interpolacji `${...}`. Komunikat walidacji podaje ścieżkę
i rodzaj naruszenia, ale nie wypisuje znalezionej wartości. Każdy wersjonowany plik
`config/white-label/*.yaml` jest automatycznie ładowany przez zestaw testów `pnpm check`. Pierwsza poprawna
konfiguracja jest cache'owana na czas życia procesu; zmiana miasta wymaga restartu/rolloutu.

W profilach Kubernetes/K3s `pnpm config:k8s:sync` synchronizuje to źródło do wejścia
generatora Kustomize. Powstaje immutable `ConfigMap/zglosto-white-label-<hash>`, montowana
read-only pod tą samą ścieżką `/app/config/city.yaml` w Authorization i backendzie.
`pnpm check` odrzuca rozbieżność źródła i kopii wdrożeniowej.

Sekrety należy przekazywać bezpośrednio tylko do usługi, która ich potrzebuje, przez ENV albo
produkcyjny menedżer sekretów/Kubernetes Secret. Nie należy umieszczać w YAML-u odwołań typu
`${SECRET}` — loader celowo nie wykonuje interpolacji.

## Authorization i sesja

| Zmienna                                   | Wymagana | Sekret | Opis                                                                                                          |
| ----------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `AUTHORIZATION_MTLS_PORT`                 | tak      | nie    | Jedyny port Authorization, domyślnie `9956`; wymaga mTLS.                                                     |
| `AUTHORIZATION_MTLS_CA_PATH`              | tak      | nie    | Ścieżka zaufanego Service CA.                                                                                 |
| `AUTHORIZATION_MTLS_CERT_PATH`            | tak      | nie    | Ścieżka certyfikatu serwera Authorization.                                                                    |
| `AUTHORIZATION_MTLS_KEY_PATH`             | tak      | tak    | Ścieżka prywatnego klucza serwera; zawartość klucza nie trafia do ENV.                                        |
| `AUTHORIZATION_MTLS_BACKEND_IDENTITY`     | tak      | nie    | Oczekiwane URI SAN workloadu backendu.                                                                        |
| `AUTHORIZATION_MTLS_HEALTHCHECK_IDENTITY` | tak      | nie    | Oczekiwane URI SAN dedykowanego klienta readiness.                                                            |
| `AUTHORIZATION_MTLS_NGINX_IDENTITY`       | tak      | nie    | Oczekiwane URI SAN workloadu Nginx; wszystkie trzy tożsamości muszą być różne.                                |
| `AUTHORIZATION_HEALTHCHECK_CA_PATH`       | tak      | nie    | Service CA używane przez probe do weryfikacji serwera.                                                        |
| `AUTHORIZATION_HEALTHCHECK_CERT_PATH`     | tak      | nie    | Certyfikat klienta ograniczonego do endpointów health.                                                        |
| `AUTHORIZATION_HEALTHCHECK_KEY_PATH`      | tak      | tak    | Ścieżka prywatnego klucza klienta healthcheck.                                                                |
| `AUTHORIZATION_HEALTHCHECK_SERVER_NAME`   | tak      | nie    | Nazwa DNS weryfikowana przez probe; w Compose `authorization`.                                                |
| `BETTER_AUTH_SECRET`                      | tak      | tak    | Losowy sekret o długości co najmniej 32 znaków. Zmiana unieważnia istniejące sesje/tokeny.                    |
| `BETTER_AUTH_URL`                         | tak      | nie    | Publiczny origin Better Auth, np. `http://localhost:1235`; służy również do linków potwierdzających e-mail.   |
| `AUTH_SERVICE_URL`                        | tak      | nie    | Wewnętrzny URL backendu do Authorization; wymagane HTTPS, w Compose `https://authorization:9956`.             |
| `AUTH_SERVICE_CA_PATH`                    | tak      | nie    | Ścieżka Service CA używanego przez backend do weryfikacji serwera Authorization.                              |
| `AUTH_SERVICE_CERT_PATH`                  | tak      | nie    | Ścieżka certyfikatu klienta `backend-client`.                                                                 |
| `AUTH_SERVICE_KEY_PATH`                   | tak      | tak    | Ścieżka prywatnego klucza `backend-client`; zawartość klucza nie trafia do ENV.                               |
| `AUTH_SERVICE_SERVER_NAME`                | tak      | nie    | Nazwa DNS sprawdzana w SAN certyfikatu serwera; w Compose `authorization`.                                    |
| `AUTH_SERVICE_TIMEOUT_MS`                 | nie      | nie    | Dodatni timeout weryfikacji sesji; domyślnie `5000`.                                                          |
| `FRONTEND_ORIGIN`                         | tak      | nie    | Jedyny publiczny origin dopuszczony przez CORS/trusted origins (obok lokalnego Vite `http://localhost:5173`). |
| `EMAIL_DELIVERY_MODE`                     | nie      | nie    | `disabled` albo `test`. Tryb `test` działa wyłącznie przy `NODE_ENV=test` i nie jest adapterem produkcyjnym.  |

Faza 0 dostarcza testowy outbox pozwalający zweryfikować cały kontrakt potwierdzenia e-maila. Wybór i konfiguracja produkcyjnego providera poczty pozostają osobnym zadaniem wdrożeniowym; nie należy uruchamiać `EMAIL_DELIVERY_MODE=test` poza izolowanymi testami.

## Stan TLS/mTLS

`pnpm certs:dev` tworzy osobne Service CA i Database CA w ignorowanym `.certs/`. Compose
montuje certyfikaty read-only zgodnie z najmniejszymi uprawnieniami. Authorization udostępnia
wyłącznie `9956/mTLS`; backend, Nginx i healthcheck używają osobnych certyfikatów klienta.
Nginx weryfikuje upstream i DNS `authorization`, a probe healthchecka ma dostęp wyłącznie do
`/health*`. Port HTTP `9955` oraz przełącznik wyłączający mTLS zostały usunięte.

Database CA wystawia certyfikaty z SAN `database` i `pgbouncer`. PostgreSQL oraz PgBouncer
wymagają TLS 1.3 i odrzucają plaintext; aplikacje weryfikują pooler przez
`DATABASE_TLS_CA_PATH`, a narzędzia używające `DATABASE_DIRECT_URL` działają z
`PGSSLMODE=verify-full`. Ścieżki nie są sekretami, lecz zawartość wszystkich kluczy prywatnych
jest sekretem i nie może trafić do ENV, White-Label YAML, obrazu ani repozytorium.

## LLM

| Zmienna                                      | Wymagana | Sekret | Używana przez | Opis                                                                        |
| -------------------------------------------- | -------- | ------ | ------------- | --------------------------------------------------------------------------- |
| `LLM_GATEWAY_URL`                            | tak      | nie    | backend       | Wewnętrzny endpoint HTTPS bramki lub szyfrowanego proxy KEDA.               |
| `LLM_GATEWAY_CA_PATH`                        | tak      | nie    | backend       | CA używana do weryfikacji certyfikatu bramki/KEDA.                          |
| `LLM_GATEWAY_CERT_PATH`                      | tak      | tak    | backend       | Certyfikat klienta backendu używany przy bezpośrednim mTLS.                 |
| `LLM_GATEWAY_KEY_PATH`                       | tak      | tak    | backend       | Klucz prywatny certyfikatu klienta backendu.                                |
| `LLM_GATEWAY_SERVER_NAME`                    | tak      | nie    | backend       | Oczekiwana nazwa DNS certyfikatu serwera.                                   |
| `LLM_GATEWAY_HMAC_KEY_FILE`                  | tak      | tak    | oba           | Wspólny klucz HMAC (co najmniej 256 bitów, base64url).                      |
| `LLM_GATEWAY_HMAC_KEY_ID`                    | tak      | nie    | oba           | Identyfikator aktywnej wersji klucza HMAC.                                  |
| `LLM_GATEWAY_AUTH_CLOCK_SKEW_SECONDS`        | nie      | nie    | llm_gateway   | Maksymalne odchylenie czasu podpisu, domyślnie `30`.                        |
| `LLM_GATEWAY_AUTH_REPLAY_MAX_ENTRIES`        | nie      | nie    | llm_gateway   | Pojemność lokalnego cache nonce, domyślnie `10000`.                         |
| `LLM_GATEWAY_MAX_BODY_BYTES`                 | nie      | nie    | llm_gateway   | Maksymalny rozmiar body przed parsowaniem, domyślnie `32768`.               |
| `LLM_GATEWAY_MAX_CONCURRENT_CLASSIFICATIONS` | nie      | nie    | llm_gateway   | Limit równoległych klasyfikacji na replikę, domyślnie `4`.                  |
| `LLM_TIMEOUT_MS`                             | nie      | nie    | backend       | Krańcowy timeout wywołania gatewaya, domyślnie `7000`.                      |
| `LLM_MODE`                                   | nie      | nie    | selektor      | `disabled`, `local` albo `external`; domyślnie `disabled`.                  |
| `LLM_RUNTIME`                                | nie      | nie    | llm_gateway   | Wynik selektora: `disabled`, `docker-model-runner` lub `openai-compatible`. |
| `LLM_UPSTREAM_TIMEOUT_MS`                    | nie      | nie    | llm_gateway   | Timeout adaptera DMR, domyślnie `5000`.                                     |
| `DOCKER_MODEL_RUNNER_URL`                    | dla DMR  | nie    | llm_gateway   | OpenAI-compatible URL wstrzykiwany przez Compose `models`.                  |
| `DOCKER_MODEL_RUNNER_MODEL`                  | dla DMR  | nie    | llm_gateway   | `ai/gemma3-qat:1B-Q4_K_M`; backend go nie zna.                              |
| `DOCKER_MODEL_RUNNER_ENGINE`                 | dla DMR  | nie    | llm_gateway   | Silnik ścieżki OpenAI-compatible, domyślnie `llama.cpp`.                    |
| `DOCKER_MODEL_RUNNER_TEMPERATURE`            | dla DMR  | nie    | llm_gateway   | Temperatura inferencji, domyślnie `0.1`.                                    |
| `DOCKER_MODEL_RUNNER_MAX_TOKENS`             | dla DMR  | nie    | llm_gateway   | Limit tokenów odpowiedzi klasyfikatora, domyślnie `64`.                     |
| `LLM_EXTERNAL_URL`                           | external | nie    | selektor      | Bazowy URL API zgodnego z OpenAI, zawierający właściwą ścieżkę `/v1`.       |
| `LLM_EXTERNAL_MODEL`                         | external | nie    | selektor      | Dokładny identyfikator modelu zewnętrznego providera.                       |
| `LLM_EXTERNAL_API_KEY_FILE`                  | external | tak    | Compose       | Hostowy plik klucza montowany wyłącznie do `llm_gateway`.                   |
| `LLM_EXTERNAL_TEMPERATURE`                   | nie      | nie    | llm_gateway   | Temperatura zewnętrznego modelu; domyślnie `0.1`.                           |
| `LLM_EXTERNAL_MAX_TOKENS`                    | nie      | nie    | llm_gateway   | Limit odpowiedzi zewnętrznego modelu; domyślnie `64`.                       |

Kontekst `4096` i cache KV `K=q4_0`, `V=q4_0` są parametrami runtime'u w
`docker-compose.llm.yml`, nie zmiennymi backendu. Plik bazowy pozostawia model wyłączony.
Nakładka `docker-compose.llm.external.yml` mapuje konfigurację providera na
`OPENAI_COMPATIBLE_*` wewnątrz gatewaya i montuje klucz pod
`/run/secrets/llm/api-key`; klucz nigdy nie trafia do zwykłego ENV.

## Frontend

Publiczne ścieżki są zapisane w `frontend/.env.production`:

```dotenv
VITE_API_BASE_URL=/api
VITE_LLM_BASE_URL=/llm
```

Są to ścieżki same-origin, a nie adresy usług wewnętrznych. Każda zmienna `VITE_*` staje się częścią publicznego bundla przeglądarkowego.

## Izolowane testy

`tests/integration/integration.env` zawiera wyłącznie deterministyczne, nieprodukcyjne wartości dla jednorazowej bazy w `tmpfs`. Skrypt `scripts/test-phase0-integration.sh` nadpisuje nimi konfigurację usług, uruchamia testy i usuwa kontenery. Tych wartości nie wolno używać poza środowiskiem testowym.
