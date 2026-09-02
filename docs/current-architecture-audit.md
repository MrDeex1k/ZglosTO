# Audyt stanu obecnego ZglosTO

## Cel dokumentu

Ten dokument opisuje aktualny stan architektury, kontraktów i zależności systemu ZglosTO po
zamknięciu Faz 0-11 z [planu modernizacji](release.md). Aktywnym
backendem jest NestJS z `@nestjs/platform-express`; migracja na `@nestjs/platform-fastify`
nie jest planowana.

Uwaga: ten dokument jest źródłem prawdy o stanie obecnym repozytorium. Kontrakty API i sesji
są zamrożone w [baseline kontraktów API](api-contracts-baseline.md), docelowy kierunek opisuje
[architektura White-Label](target-white-label-architecture.md), kolejność prac definiuje
[plan modernizacji](release.md), historyczny wspólny kontrakt profili oraz ich aktualne
priorytety opisuje
[plan modernizacji wdrożeń](k8s-k3s-modernization.md), a status ustaleń zbiera
[rejestr decyzji](architecture-decisions.md).

Zakres audytu:

- lokalny runtime Docker Compose;
- manifesty Kubernetes obecne w repo;
- kontrakty frontend <-> backend <-> auth <-> LLM;
- model danych PostgreSQL;
- role, sesja i przepływ autoryzacji;
- zmienne środowiskowe;
- zauważone niespójności i ryzyka startowe.

Data audytu: 2026-06-02. Stan zsynchronizowano 2026-07-18 po zamknięciu Fazy 5 i
inwentaryzacji HTTP Fazy 6. Model routingu zaktualizowano 2026-07-16 po realizacji ADR-003,
runtime, package manager, obrazy kontenerowe oraz końcowy stan Fazy 0 zaktualizowano
2026-07-17, a White-Label i ścieżkę PgBouncer zaktualizowano 2026-07-18.
Model Object Storage, lokalizację, backup/restore, decyzję o TLS/mTLS oraz migrację
Authorization do Hono zaktualizowano 2026-07-18. NestJS i Docker Model Runner
zaktualizowano 2026-07-21 po zamknięciu Faz 6 i 7. TanStack Start, warstwę danych i
formularzy, Base UI, mapę, komunikat 112 oraz zerową liczbę ostrzeżeń OxLint zsynchronizowano
2026-07-24 po zamknięciu Fazy 8. Fazę 9 zakończono 2026-07-24: krok 1 ustanowił maszynową
macierz profili, wspólną bazę Kustomize i overlaye Kubernetes/K3s, krok 2 dodał
produkcyjnego kandydata Compose z obrazami po digestach, plikowymi sekretami, HTTPS i
procedurami hostowymi, krok 3 rozdzielił neutralną bazę od decyzji ingress/storage
Kubernetes i K3s, krok 4 wdrożył immutable ConfigMapy, wspólny White-Label oraz
zewnętrzny kontrakt sekretów montowanych jako pliki read-only, a krok 5 dodał StatefulSety
PostgreSQL/RabbitMQ, PgBouncera, retencję PVC, scheduler pgBackRest i opcjonalne overlaye
RustFS. Krok 6 uzupełnił workload `media-worker`, probes, PDB oraz routing same-origin, a
krok 7 dodał cert-manager, oddzielne Service/Database CA, rotację certyfikatów przez
Reloader i default-deny NetworkPolicy z allowlistami. Krok 8 wdrożył wspólny pakiet
OpenTelemetry, strukturalne logi, podstawowe metryki, propagację trace context oraz tryby
obserwowalności `disabled`, `external` i `local` dla Compose, Kubernetes i K3s. Krok 9
dodał szyfrowany trigger RabbitMQ i dokładne skalowanie KEDA `media_worker` w zakresie
`1-4`; krok 10 wybrał KEDA HTTP Add-on, skierował ruch backendu przez `InterceptorRoute`
i dodał scale-to-zero `llm_gateway` w zakresie `0-4`. Krok 11 dodał testy Compose,
Kind/Kubernetes i K3d/K3s, walidację schematów oraz polityki workloadów. Compose pozostaje
statyczny. Końcowa certyfikacja konkretnej infrastruktury pozostaje Fazą 12.

Decyzję Fazy 10 podjęto 2026-07-25: docelowym magazynem krótkotrwałym jest Redis z trybami
`disabled`, `local` i `external`. Krok 1 wdrożył wspólny, typowany kontrakt konfiguracji
Redis, cache’u i jawnych progów limiterów w Authorization i backendzie. Krok 2 podłączył
zawsze aktywny limiter procesowy do `/api/auth/*` oraz publicznego zapisu zgłoszenia, z
ograniczoną pamięcią, HMAC identyfikatorów, `429` i `Retry-After`. Krok 3 dodał
`@zglosto/transient-store`: neutralny port oraz adapter oficjalnego klienta Redis z
atomowym licznikiem TTL, dzierżawą, timeoutami i TLS. Kroki 4-5 podłączyły atomowy
`rateLimit.customStorage` Better Auth oraz globalne, IP i użytkownikowe liczniki publicznego
zapisu zgłoszenia. Globalne Better Auth `secondaryStorage` nie jest używane, więc sesje
pozostają w PostgreSQL. Krok 6 wdrożył walidowany cache-aside publicznej listy z TTL
`900 s`, wersjonowaną invalidacją, single-flight, dzierżawą i fallbackiem do PostgreSQL.
Krok 7 dodał częściowy indeks publicznego zapytania, a krok 8 exact-match cache Nginx:
`900 s` w pojedynczym Compose bez Redisa oraz `30 s` jako microcache w trybach Redis.
Krok 9 dostarczył profile `local` i `external` dla Compose, Kubernetes oraz K3s. Krok 10
dodał jawny stan `degraded`, metryki, alerty, dashboard i automatyczny test
`ok -> degraded -> ok`. Krok 11 zsynchronizował dokumentację oraz dodał
[runbook operatorski Redis](redis-operations.md). Faza 10 jest zakończona; `disabled`
oznacza brak Redisa, nie brak lokalnego rate limitingu.

Faza 11 rozpoczęła się 2026-07-26. Krok 1 z 14 zakończył
[audyt obrazów i kontekstów builda](phase-11-image-audit.md): zmierzono wszystkie lokalne
obrazy, warstwy i zawartość runtime, sprawdzono użytkowników, entrypointy, healthchecki,
`.dockerignore`, hardening Compose oraz pipeline. Największy kontrolowalny narzut mają
obrazy Node, które nadal zawierają źródła i część narzędzi buildowych oraz uruchamiają
procesy aplikacyjne jako root. W finalnych obrazach nie znaleziono sekretów.
Krok 2 ustanowił [produkcyjny kontrakt obrazów](phase-11-step-2-image-contract.md),
budżety rozmiaru i cold/warm buildów oraz bramki `baseline` i `target`. Statyczna walidacja
jest częścią `pnpm check:source`, a sprawdzenie lokalnych obrazów potwierdziło brak regresji
większej niż 5% i brak ścieżek sekretów. Kroki 3–8 wdrożyły
[minimalne obrazy runtime](phase-11-steps-3-8-runtime-images.md), użytkowników nie-root,
healthchecki, porty nieuprzywilejowane i hardening workloadów. Metadane wydania zapisuje
manifest lokalnego builda, a etykiety obrazów są odroczone do rzeczywistego CI/CD. Docelowa bramka
ośmiu obrazów oraz pełny test integracyjny przeszły.
Krok 9 historycznie dodał natywny, lokalny build ze źródeł dla `amd64` i `arm64`,
Trivy 0.72.0, CycloneDX, raport sekretów, niezmienne lokalne tagi oraz manifest kandydata.
Decyzją właściciela z 2026-08-26 Trivy i SBOM zostały wycofane z bieżącego zakresu; aktywny
pipeline ma zachować manifest, skan repozytorium, kontrakt obrazów i testy runtime bez tych
dwóch elementów. Pełny test
`linux/arm64` przeszedł dla wszystkich ośmiu artefaktów. Krok 10 podłączył `images.env`
i manifest do produkcyjnego Compose, ustawił RustFS jako domyślny oraz dodał 54
walidowane kombinacje Object Storage, Redis, observability i LLM. Kroki 11–12 domknęły
hardening modułów i hosta, nftables, systemd oraz workflow
`validate -> backup -> migrate -> wait -> smoke -> promote` z odzyskaniem bieżącego
wydania po błędzie kandydata. Kroki 13–14 dodały lokalne bramki wydania, testy negatywne,
runbook Compose, handoff do K3s i maszynowy kontrakt zamknięcia. Faza 11 jest zakończona
14/14; następna Faza 12 wykonuje mierzoną certyfikację na środowisku docelowym.

## Snapshot architektury

### Usługi i odpowiedzialności

| Usługa              | Katalog           | Runtime / obraz                            | Port                | Rola                                                  |
| ------------------- | ----------------- | ------------------------------------------ | ------------------- | ----------------------------------------------------- |
| `frontend`          | `frontend/`       | Node 26.8.1 build + Nginx 1.31.4           | `8080` w kontenerze | SPA React dla mieszkańca, służb i admina              |
| `backend`           | `backend/`        | Node 26.8.1 + NestJS 12 stable + Express 5 | `3000`              | API incydentów, statystyk i administracji             |
| `authorization`     | `authorization/`  | Node 26.8.1 + Hono 4 + Better Auth         | `9956` mTLS         | logowanie, rejestracja, sesja, role z `uzytkownicy`   |
| `llm_gateway`       | `llm_gateway/`    | Node 26.8.1 + Hono 4 + TypeScript          | `8130`              | stabilna granica backendu do wymiennego runtime'u LLM |
| Docker Model Runner | poza repozytorium | llama.cpp + Gemma 3 1B QAT                 | API hosta DMR       | opcjonalna inferencja za gatewayem                    |
| `database`          | `database/`       | PostgreSQL 18.6 + `pg_cron` + `pgbackrest` | `${POSTGRES_PORT}`  | dane domenowe i tabele Better Auth                    |
| `pgbouncer`         | obraz zewnętrzny  | PgBouncer 1.25.2                           | `6432`              | transaction pooling dla backendu i authorization      |
| `rustfs`            | obraz zewnętrzny  | RustFS 1.0.0-rc.5                          | `9000` wewnętrznie  | domyślny lokalny provider Object Storage zgodny z S3  |
| `redis`             | obraz zewnętrzny  | Redis 8.10.1                               | `6379` wewnętrznie  | opcjonalny cache i współdzielony rate limiting        |
| `nginx`             | `nginx/`          | Nginx 1.31.4                               | `1235`              | reverse proxy dla frontendu, auth, backendu i LLM     |

### Sieci i uruchomienie lokalne

Docker Compose definiuje trzy sieci:

- `internal-net` (`internal: true`): `database`, `pgbouncer`, `authorization`, `backend`,
  `llm_gateway`, `rustfs`, `nginx`
- `external-net`: `frontend`, `nginx`
- `llm-runtime-net`: granica sieciowa gatewaya; backend nie ma bezpośredniej ścieżki do API
  runtime'u modelu. W wariancie `models` endpoint DMR wstrzykuje Docker Compose.

Stan obecny:

- lokalny runtime jest zorientowany na `docker compose`;
- `database`, `pgbouncer`, `authorization`, `backend`, `frontend`, `llm_gateway`, `rustfs` i `nginx`
  maja healthchecki Compose;
- backend i authorization rozrozniaja liveness procesu od readiness zależnego od PostgreSQL;
- bazowy Compose uruchamia `llm_gateway` z `LLM_RUNTIME=disabled`, więc brak modelu nie
  blokuje aplikacji;
- `docker-compose.llm.yml` jest wariantem opt-in korzystającym z top-level `models`.

### Produkcyjny kandydat Compose

Faza 9 dostarczyła osobny `docker-compose.production.yml`, plikowe sekrety, HTTPS, limity,
rotację logów oraz automatyzację hostową. Faza 11 zastąpiła obrazy z registry lokalnymi,
zweryfikowanymi artefaktami z builda źródłowego. Produkcyjny selektor domyślnie dodaje
RustFS, a warianty Redis, observability i LLM są wzajemnie wyłączne i niezależne. Bieżący
Compose pozostaje podstawą testów integracyjnych, a profil produkcyjny kandydatem do
certyfikacji w Fazie 12.

Faza 11 odchudziła i utwardziła obrazy, dodała natywny produkcyjny build ze źródeł na
serwerze instalacji oraz domknęła hardening, automatyzację i testy wariantów produkcyjnego
Compose. Bieżący proces zachowuje statyczny skan repozytorium, kontrolę sekretów, kontrakt
obrazów i testy runtime, ale nie generuje SBOM ani nie uruchamia Trivy. Centralne registry i
GitHub-hosted runners nie należą do bieżącej ścieżki. Compose jest priorytetem, K3s
pozostaje opcjonalnym następnym profilem, a rozbudowany Kubernetes jest zamrożony. Faza 12
ma certyfikować najpierw Compose, w tym hostowy firewall, rotację certyfikatów, DR oraz
SLA/RTO/RPO uwzględniające brak HA pojedynczego hosta.

## Przepływ ruchu

### Wejście przez Nginx

Nginx udostępnia jeden serwer `:1235` dla aplikacji.

Routing na `:1235`:

- `/` -> `frontend:8080`
- `/api/auth/` -> `https://authorization:9956/api/auth/` z certyfikatem `nginx-client`
- `/api/` -> `backend:3000/` z usunieciem publicznego prefiksu `/api`
- wyłącznie `/llm/health` -> `llm_gateway:8130/health`; endpoint klasyfikacji jest wewnętrzny

### Faktyczny model wywołań z frontendu

Frontend korzysta z jednego modelu same-origin:

- `VITE_API_BASE_URL=/api`
- Better Auth używa domyślnego `/api/auth`
- `VITE_LLM_BASE_URL=/llm`

W Compose jedynym publicznym wejściem aplikacji jest Nginx. Porty `3000` i `9956` pozostają
wewnętrzne, a Authorization wymaga mTLS. Docelowy K8s zostanie dostosowany w jego fazie
modernizacji. W development Vite udostępnia te same prefiksy i proxy do lokalnych procesów:

- `/api/auth` -> lokalne authorization `https://localhost:9956`, z certyfikatem
  `nginx-client` i bez zmiany ścieżki;
- `/api` -> lokalny backend `:3000`, z usunięciem prefiksu;
- `/llm` -> lokalny LLM `:8123`, z usunięciem prefiksu.

## Frontend

### Stack

- React `19.2.8`
- Vite `8.2.2`
- TypeScript `7.0.2` (natywny kompilator Go udostepniany jako `tsc`)
- Tailwind `4.3.3`
- shadcn/ui `base-nova` na Base UI
- Better Auth client

Jedynym package managerem JavaScript/TypeScript jest PNPM `11.25.0`, z jednym `pnpm-lock.yaml` w katalogu głównym i workspace obejmującym `frontend`, `backend`, `authorization`, `llm_gateway`, `Mobile` oraz `packages/*`. Wspólny toolchain używa Oxlint `1.80.0`, Oxfmt `0.65.0` oraz skryptów root `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` i `pnpm test`. Oxlint działa obecnie bez trybu type-aware; pełny typecheck wykonuje osobno TypeScript 7. `oxlint-tsgolint` nie jest zainstalowany. Bezpośrednie zależności są przypięte dokładnie, PNPM odrzuca publikacje młodsze niż 24 godziny, a operacje na zależnościach JavaScript są chronione przez lokalny Socket Firewall (`sfw`) i skrypty `pnpm deps:*`.

Migracja lokalnych wrapperów z Radix UI do shadcn/ui `base-nova` na Base UI została
zakończona w [Fazie 8A](frontend-ui-migration.md). Radix nie występuje już w zależnościach
ani źródłach, a [kontrakt design systemu](phase-8-design-system.md) i `pnpm check:source`
chronią tę granicę przed regresją.

### Struktura aplikacji

Frontend jest aplikacją TanStack Start działającą jako SPA z routingiem plikowym TanStack
Router. Publiczne trasy obejmują stronę główną, logowanie i rejestrację. Trasa nadrzędna
`/dashboard` wymaga zweryfikowanej sesji, a trasy dashboardów egzekwują role:

- `/dashboard/admin` — `admin`;
- `/dashboard/sluzby` — `sluzby`;
- `/dashboard/mieszkaniec` — `mieszkaniec`.

Loadery tras przygotowują cache TanStack Query przed renderem. Komponenty odczytują te same
dane przez `useQuery`; frontend nie utrzymuje drugiej kopii stanu serwerowego.

### Dostępność panelu administratora w WEB

Pełny Panel Administratora WEB jest obecnie przeznaczony dla komputerów. Administrator
otwierający `/dashboard/admin` na rozpoznanym telefonie lub tablecie widzi informację, że do
zarządzania systemem wymagany jest komputer, zamiast właściwego panelu.

Blokada działa przed pobraniem prywatnych danych administratora: loader trasy nie wykonuje
`ensureQueryData`, a globalne zapytanie administratora pozostaje wyłączone. Detekcja korzysta
z UA Client Hints, identyfikatorów mobilnych w `User-Agent` oraz osobnego przypadku iPada
używającego desktopowego identyfikatora platformy.

Jest to ograniczenie UX i deklaracja aktualnie wspieranego interfejsu, a nie granica
bezpieczeństwa. Tryb desktopowy lub zmiana sygnałów przeglądarki może ominąć detekcję.
Backend nadal niezależnie uwierzytelnia sesję i wymaga roli `admin` dla wszystkich endpointów
`/api/admin/*`. Aplikacja Mobile ma osobny, bardziej restrykcyjny kontrakt roli administratora
opisany w [granicach ról Mobile 1.0](../Mobile/PHASE_6_0_ROLE_BOUNDARIES.md).

### Kontrakty używane przez frontend

Frontend wywołuje następujące endpointy:

| Cel                                            | Metoda  | Ścieżka                                    |
| ---------------------------------------------- | ------- | ------------------------------------------ |
| lista naprawionych zgłoszeń na stronie głównej | `GET`   | `/mieszkaniec/incydenty/glowna`            |
| prywatne zgłoszenia mieszkańca                 | `GET`   | `/mieszkaniec/incydenty`                   |
| dodanie zgłoszenia                             | `POST`  | `/mieszkaniec/incydenty`                   |
| lista zgłoszeń służb                           | `GET`   | `/sluzby/incydenty`                        |
| zmiana statusu przez służby                    | `PATCH` | `/sluzby/incydenty/:id/status`             |
| zmiana flagi sprawdzenia przez służby          | `PATCH` | `/sluzby/incydenty/:id/sprawdzenie`        |
| dodanie zdjęcia rozwiązania                    | `POST`  | `/sluzby/incydenty/:id/zdjecie_rozwiazane` |
| lista wszystkich zgłoszeń dla admina           | `GET`   | `/admin/incydenty`                         |
| zmiana statusu przez admina                    | `PATCH` | `/admin/incydenty/:id/status`              |
| zmiana przypisania służby przez admina         | `PATCH` | `/admin/incydenty/:id/typ`                 |
| zmiana flagi sprawdzenia przez admina          | `PATCH` | `/admin/incydenty/:id/sprawdzenie`         |
| zmiana roli / przypisania usługi użytkownika   | `PATCH` | `/admin/uzytkownicy/service-key`           |
| health LLM                                     | `GET`   | `/health` na bazie `VITE_LLM_BASE_URL`     |

### Model danych po stronie UI

UI mapuje stan backendu na lokalny model `Incident`:

- status biznesowy backendu: `reported`, `in_progress`, `resolved`
- status uproszczony w UI: `pending`, `in-progress`, `resolved`

Mapowanie statusu biznesowego oraz polskich etykiet UI znajduje się w
`frontend/src/lib/incident-status.ts`; transformacje odpowiedzi API są wykonywane w
`frontend/src/queries/incidents.ts`.

## Authorization

### Stack

- Better Auth `1.6.27`
- Hono `4.13.2` z `@hono/node-server` `2.1.0`
- Node 26.8.1; TypeScript jest kompilowany przez `pnpm build` do JavaScript w `dist`
- PostgreSQL przez `pg`

Authorization nie ma już zależności od Express, `cors`, `@types/express` ani `@types/cors`.
CORS realizuje `hono/cors`, a polityka źródeł pozostaje objęta zamrożonym kontraktem
integracyjnym. Kontrola źródeł blokuje ponowne dodanie starych pakietów do tego serwisu.

### Endpointy potwierdzone w kodzie

Serwis `authorization` wystawia:

- `GET/POST /api/auth/*` przez natywny Fetch handler Better Auth
- `GET /health/live`, `GET /health/ready` i zgodnościowy `GET /health`
- `GET /api/verify-session`

Serwis używa Better Auth jako głównego kontraktu auth. Repo nie trzyma lokalnej, ręcznie napisanej implementacji logowania; logika sesji i kont użytkowników jest delegowana do Better Auth.

### Model sesji i ról

Źródła danych auth:

- tabele Better Auth: `"user"`, `session`, `account`, `verification`
- tabela domenowa `uzytkownicy`

Role są dokładane do sesji przez plugin `customSession`:

- `uprawnienia`: `mieszkaniec` | `sluzby` | `admin`
- `serviceKey`: stabilny klucz aktywnej służby albo `null`

Po rejestracji hook auth tworzy wpis w `uzytkownicy` z domyślną rolą:

- `uprawnienia='mieszkaniec'`
- `service_key=NULL`

### CORS i originy

Auth dopuszcza:

- `process.env.FRONTEND_ORIGIN`
- `http://localhost:5173`

Serwis działa na `PORT` z `.env`.

## Backend

### Stack

- NestJS 12.0.1 z `@nestjs/platform-express` i Express 5 jako adapterem HTTP
- Node 26.8.1 jako runtime startowy
- TypeScript 7/TSGO, Zod/Standard Schema i OpenAPI
- `pg` przez PgBouncer/TLS, provider-neutralny S3 i RabbitMQ/AMQPS

### Routing

Backend wystawia kontrolery:

- `/health/*`
- `/config/public`
- `/images/:id`
- `/mieszkaniec`
- `/sluzby`
- `/admin`

Diagnostyczne `GET /protected` nie istnieje w aktywnym NestJS. Surowe OpenAPI jest dostępne
przez Nginx jako `GET /api/openapi.json`; Swagger UI jest wyłączony.

Backend nie serwuje frontendu i nie ma catch-all SPA.

### Autoryzacja backendu

Autoryzacja dla `/sluzby` i `/admin` działa przez middleware `requireAuth(...)`.

Mechanizm:

1. backend przekazuje pełny nagłówek `Cookie`;
2. backend woła `GET ${AUTH_SERVICE_URL}/api/verify-session`;
3. jeśli sesja jest poprawna, user jest dokładany do `req.user`;
4. backend porównuje `user.uprawnienia` z listą dozwolonych ról.

Konsekwencje:

- backend jest ciasno sprzężony z kształtem sesji Better Auth;
- ścieżka do walidacji sesji jest kontraktem technicznym krytycznym dla backendu;
- role aplikacyjne nie są walidowane lokalnie w bazie backendu, tylko przez sesję zwróconą przez auth.

### Endpointy domenowe

#### Mieszkaniec

| Metoda | Ścieżka                         | Auth          | Uwagi                                                      |
| ------ | ------------------------------- | ------------- | ---------------------------------------------------------- |
| `GET`  | `/mieszkaniec/incydenty`        | `mieszkaniec` | prywatna lista po `reporter_user_id`                       |
| `GET`  | `/mieszkaniec/incydenty/glowna` | brak          | 15 ostatnich naprawionych zgłoszeń                         |
| `POST` | `/mieszkaniec/incydenty`        | opcjonalna    | anonimowy/sesyjny zapis, Object Storage i klasyfikacja LLM |

#### Służby

| Metoda  | Ścieżka                                    | Auth     | Uwagi                                           |
| ------- | ------------------------------------------ | -------- | ----------------------------------------------- |
| `GET`   | `/sluzby/incydenty`                        | `sluzby` | filtr po `req.user.serviceKey`                  |
| `GET`   | `/sluzby/statystyki`                       | `sluzby` | statystyki per status                           |
| `PATCH` | `/sluzby/incydenty/:id/status`             | `sluzby` | ustawia status i datę rozwiązania               |
| `PATCH` | `/sluzby/incydenty/:id/sprawdzenie`        | `sluzby` | ustawia flagę sprawdzenia                       |
| `PATCH` | `/sluzby/incydenty/:id/typ`                | `sluzby` | zmienia typ służby                              |
| `POST`  | `/sluzby/incydenty/:id/zdjecie_rozwiazane` | `sluzby` | zapisuje zdjęcie przez neutralny Object Storage |

#### Admin

| Metoda  | Ścieżka                            | Auth    | Uwagi                                              |
| ------- | ---------------------------------- | ------- | -------------------------------------------------- |
| `GET`   | `/admin/statystyki`                | `admin` | statystyki globalne                                |
| `GET`   | `/admin/incydenty`                 | `admin` | pełna lista zgłoszeń                               |
| `PATCH` | `/admin/incydenty/:id/sprawdzenie` | `admin` | zmiana flagi                                       |
| `PATCH` | `/admin/incydenty/:id/typ`         | `admin` | zmiana przypisania                                 |
| `PATCH` | `/admin/incydenty/:id/status`      | `admin` | dowolna zmiana statusu                             |
| `PATCH` | `/admin/uzytkownicy/service-key`   | `admin` | przypisanie `uprawnienia` i `serviceKey` po emailu |

### Format obrazów

Frontend przesyła zdjęcie binarnie przez krótko ważny presigned PUT, a JSON zgłoszenia zawiera
tylko jednorazowy `uploadId`. Dla lokalnego RustFS publiczny URL wskazuje host `uploads.*`
na Nginx, który strumieniuje wyłącznie `PUT`/`OPTIONS` do prywatnego `rustfs:9000`; dla
zewnętrznego S3/R2 URL wskazuje providera bezpośrednio. Backend
weryfikuje `HEAD`, a Sharp ponownie waliduje faktyczne bajty. PostgreSQL przechowuje w
`incident_images` wyłącznie klucze obiektów,
checksumy, MIME, rozmiary, status przetwarzania i przyszłe metadane WebP. Listy incydentów
zwracają referencje do kontrolowanych endpointów obrazów, nigdy base64 ani `Buffer`. Po
zatwierdzeniu WebP oryginał jest usuwany przez idempotentny cleanup workera.

Domyślny Compose używa prywatnego RustFS. Wariant `docker-compose.no-rustfs.yml` pozwala
podłączyć AWS S3, Cloudflare R2 lub innego providera zgodnego z S3 wyłącznie przez `S3_*`.

## LLM gateway i Docker Model Runner

### Stack

- `llm_gateway`: Hono + Node 26 + TypeScript;
- runtime: Docker Model Runner 1.2.6 z llama.cpp;
- model: `ai/gemma3-qat:1B-Q4_K_M`, digest
  `sha256:9f84c113e1f1085bddaffad1acb07c90e59487f0c7e25028f1811e71efba9599`;
- kontekst `4096`, cache KV `q4_0/q4_0`, temperatura `0.1`;
- timeout DMR `5000 ms`, krańcowy timeout backendu `7000 ms`.

### Kontrakt

| Metoda  | Ścieżka              | Body                             | Odpowiedź                                                         |
| ------- | -------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `GET`   | `/health`            | brak                             | `{ status, service, model, enabled, loaded, error? }`             |
| `QUERY` | `/classify-incident` | `{ description, address, city }` | `{ classification, serviceKey, confidence, source, reason, ... }` |

Zachowanie biznesowe:

- backend przesyła treść zapytania metodą `QUERY` zgodną z RFC 10008; przejściowy handler
  `POST` w gatewayu służy wyłącznie zgodnemu rolloutowi i nie jest używany przez bieżący backend;
- gateway wymaga JSON, zwraca `Accept-Query: application/json` i blokuje przechowywanie
  odpowiedzi przez `Cache-Control: no-store`;
- mTLS nadal ogranicza dostęp do workloadu backendu, a HMAC wiąże metodę, ścieżkę i body;
- gateway normalizuje wynik do `municipal`, `emergency` albo `unknown`;
- backend odpytuje wyłącznie `llm_gateway`;
- brak modelu nie blokuje zapisu zgloszenia.

DMR nie jest domyślnie uruchamiany ani pobierany. Aktywuje go `docker-compose.llm.yml` bez
zmiany kontraktu backendu. Python, UV, FastAPI i cache Hugging Face nie są już częścią repo.

## Baza danych

### Stack i runtime

- PostgreSQL `18.6`
- `pg_cron`
- `pgbackrest`
- wolumeny: `postgres-data`, `pgbackrest-data`

### Tabele auth

Better Auth używa tabel:

- `"user"`
- `session`
- `account`
- `verification`

### Tabele domenowe

#### `incydenty`

Kluczowe pola:

- `id_zgloszenia uuid PRIMARY KEY DEFAULT uuidv7()`
- `opis_zgloszenia varchar(255)`
- `mail_zglaszajacego varchar(254)`
- `adres_zgloszenia varchar(50)`
- `latitude double precision NULL`
- `longitude double precision NULL`
- `sprawdzenie_incydentu boolean`
- `status_incydentu status_incydentu_enum`
- `service_key varchar(64) -> service_types(service_key)`
- `LLM_odpowiedz text`
- pola daty i czasu zgłoszenia oraz rozwiązania

Enumy:

- `status_incydentu_enum`: `reported`, `in_progress`, `resolved`
- `service_types` materializuje stabilne klucze katalogu White Label, aktywność i kolejność;
  brak wpisu w nowym YAML-u dezaktywuje rekord, a triggery blokują nowe przypisania bez
  naruszania historii.

#### `incident_images`

Tabela przechowuje po jednym zdjęciu rodzaju `report` i `resolution` dla incydentu. Zawiera
klucz oryginału, przyszłego WebP, MIME, rozmiary, checksumy, rewizję, wymiary, kod błędu oraz
stan `pending`, `processing`, `ready` albo `failed`. Binarne pliki nie są przechowywane w
PostgreSQL.

#### `media_processing_jobs` i `outbox_events`

Tabele zapewniają trwałe, idempotentne przetwarzanie mediów oraz atomową publikację zadań do
RabbitMQ. Publisher odzyskuje blokady, czeka na confirm i dopiero wtedy ustawia `published`.
`consumed_messages` atomowo wiąże efekt handlera z parą `consumerName + messageId`. Payloady
zawierają identyfikatory i object keys, nigdy bajty/base64.

#### `uzytkownicy`

Kluczowe pola:

- `id_uzytkownika` -> FK do `"user"(id)`
- `uprawnienia uprawnienia_enum`
- `service_key varchar(64) -> service_types(service_key)`

Constraint:

- jeśli `uprawnienia != 'sluzby'`, to `service_key` musi być `NULL`

### Backup i zadania cykliczne

pgBackRest archiwizuje WAL oraz wykonuje kopie pełne i różnicowe przez kontrolowany wrapper.
`pg_cron` uruchamia codzienną kopię różnicową o 03:00 i pełną w niedzielę o 02:00. Niezależny
snapshot instalacji łączy logiczny `pg_dump`, archiwum aktywnego Object Storage, audyt i sumy
SHA-256. Automatyczna integracja wykonuje destrukcyjny restore drill. Szczegóły opisuje
[procedura backup/restore](backup-restore.md).

## Zmienne środowiskowe

Wersjonowany `.env.example` i [katalog zmiennych](environment-variables.md) sa zrodlem
prawdy dla lokalnego Compose. Nie są mechanizmem dostarczania sekretów produkcyjnych.
Docelowe profile Compose, Kubernetes i K3s zachowują te same nazwy konfiguracji, ale sekrety
otrzymują z mechanizmu właściwego dla profilu. Lokalny `.env` pozostaje ignorowany przez Git.

Compose nie przekazuje juz calego `.env` do kazdego kontenera. Jawne bloki `environment` rozdzielaja:

- dane i haslo PostgreSQL do `database`;
- bezposredni `DATABASE_DIRECT_URL` do operacji w `database` oraz upstreamu `pgbouncer`;
- `DATABASE_URL` wskazujacy `pgbouncer:6432` do uslug aplikacyjnych;
- `DATABASE_URL`, sekret Better Auth i publiczne originy do `authorization`;
- `DATABASE_URL`, wewnetrzny auth URL i ustawienia timeout/fallback LLM do `backend`;
- ustawienia runtime'u i modelu wyłącznie do `llm_gateway`.

Backend, authorization i gateway walidują wymagane zmienne przed startem. DMR nie wymaga
tokenu Hugging Face. Frontend ma wyłącznie publiczne ścieżki same-origin w
`frontend/.env.production`; do bundla nie trafiają sekrety.

## Kubernetes i K3s

Repo zawiera manifesty dla:

- `frontend`
- `backend`
- `authorization`
- `database`
- `llm-gateway`
- `nginx`

Dodatkowe elementy:

- HPA dla `frontend`, `backend`, `authorization`
- PDB dla `backend`
- ingress
- PVC dla `database`, `pgbackrest`
- NetworkPolicy

Stan obecny manifestów nie jest w pełni spójny z kodem i Compose. Nie istnieje jeszcze
zatwierdzony overlay K3s ani osobne bramki produkcyjne dla Kubernetes i K3s.

## Wykryte niespójności i ryzyka

### 1. Model routingu frontendu — rozwiązane

ADR-003 przyjmuje jeden kontrakt same-origin dla przeglądarki: `/api`, `/api/auth` i `/llm`. Compose/K8s realizują go przez Nginx, a Vite przez dev proxy. Backend i authorization nie publikują już portów hosta w Compose. CORS i `trustedOrigins` są ograniczone do publicznego origin oraz lokalnego Vite dev servera.

### 2. Backend nie ma `GET /health`, ale K8s go wymaga — rozwiazane

Backend udostepnia `/health/live`, `/health/ready` oraz kompatybilne `/health`. Readiness sprawdza PostgreSQL, a probes K8s korzystaja z rozdzielonych endpointow.

### 3. Backend w K8s dostaje inne zmienne niż te, których używa kod — częściowo rozwiązane

Kod backendu używa:

- `AUTH_SERVICE_URL`
- wymaganego `DATABASE_URL`; nie ma juz alternatywnej konfiguracji zlozonej z `DB_*` i
  `POSTGRES_*`;

Manifest przekazuje juz wymagane dla routingu i auth:

- `NODE_ENV`
- `FRONTEND_ORIGIN`
- `AUTH_SERVICE_URL`
- `DATABASE_URL`

PgBouncer jest wdrozony i przetestowany w Docker Compose. Manifest K8s nadal wskazuje
`pgbouncer`, ale jego docelowy Deployment, Service, sekrety, limity i NetworkPolicy pozostaja
zakresem profesjonalnej modernizacji wszystkich trzech profili w Fazie 9.

### 4. Backend serwuje `frontend/dist` — rozwiązane

Backend jest API-only. Usunięto `express.static("../frontend/dist")` i catch-all
zwracający `index.html`. TanStack Start buduje statyczny artefakt w
`frontend/dist/client`; osobny kontener frontendowy serwuje `_shell.html`, a Nginx jest
właścicielem publicznego routingu.

### 5. Tozsamosc mieszkańca — wdrozona i przetestowana

`POST /mieszkaniec/incydenty` pozwala na anonimowy zapis ze znormalizowanym e-mailem oraz opcjonalna sesje. Dla zalogowanego mieszkanca backend zapisuje `reporter_user_id` i wymaga zgodnosci e-maila formularza z sesja. `GET /mieszkaniec/incydenty` nie przyjmuje parametru e-mail, wymaga sesji i roli `mieszkaniec`, a dane wybiera wylacznie przez `reporter_user_id`.

Po potwierdzeniu e-maila hook Better Auth przypisuje anonimowa historie. Endpoint profilu wykonuje dodatkowo idempotentne przypisanie tylko wtedy, gdy tabela `user` potwierdza `email_verified = TRUE`, co zabezpiecza migracje i ponowienia. Zestaw integracyjny przechodzi przez rzeczywisty link weryfikacyjny Better Auth i potwierdza, ze niezweryfikowane konto nie przejmuje historii.

### 6. Obrazy w PostgreSQL jako `bytea` — rozwiązane

Kolumny `bytea` zostały usunięte bez migracji danych testowych. Pliki znajdują się w aktywnym
Object Storage, a PostgreSQL przechowuje wyłącznie referencje i metadane. Neutralny adapter,
wariant RustFS/NoRustFS, kontrolowany odczyt oraz backup/restore są wdrożone i pokryte testem
integracyjnym.

### 7. Testy integracyjne i smoke Compose — rozwiazane dla Fazy 0

Repo zawiera izolowany [smoke test startu Compose](compose-smoke-tests.md), ktory sprawdza build, healthchecki, restarty i publiczny routing bez modelu LLM, oraz osobny [zestaw integracyjny Fazy 0](phase-0-integration-tests.md). Zestaw biznesowy pokrywa rejestracje, logowanie, prawdziwy link potwierdzajacy Better Auth, przejecie historii, role, panel admina, izolacje sluzb, statusy, zdjecia i wszystkie zaakceptowane warianty LLM.

Oba srodowiska korzystaja z osobnych projektow Compose i danych w `tmpfs`; nie modyfikuja zwyklych wolumenow lokalnych.

### 8. Healthchecki są niepełne — rozwiazane dla uslug Fazy 0

Minimalny kontrakt obejmuje frontend, backend, authorization, database, `llm_gateway` i
publiczny Nginx. Compose czeka na zdrowe zależności, a K8s będzie
zaktualizowany w dedykowanej fazie wdrożeniowej. Szczegóły są w
[dokumencie healthchecków](healthchecks.md).

### 9. Strukturalny fallback LLM — wdrozony i przetestowany

Frontend wysyła zgłoszenie bezpośrednio do backendu i nie odpytuje LLM osobno. Backend
wywołuje gateway z krańcowym timeoutem, zapisuje `classification`, `modelAvailable`, `source`
i `reason`, a awarie mapuje na `unknown` bez blokowania zapisu. Gateway normalizuje odpowiedź
Docker Model Runner albo kontrolowany fallback `disabled`. UI rozróżnia sukces modelu,
zalecenie kontaktu z 112 oraz zapis do ręcznej weryfikacji.

Backend pobiera routing fallbacku wyłącznie z `routing.fallbackServiceKey` konfiguracji White Label. Przejściowy model runner zwraca `serviceKey: null`, więc nie zna i nie może nadpisać routingu miasta. Smoke test pokrywa rzeczywisty wariant `disabled`, a kontrolowany zestaw integracyjny dodatkowo `municipal`, `emergency`, `timeout`, `unavailable` i `invalid_response`.

### 10. TLS/mTLS transportu — wdrożone w Compose

Lokalny generator tworzy oddzielne Service CA i Database CA poza repozytorium i obrazami.
Authorization udostępnia wewnętrzny listener TLS 1.3/mTLS na `9956`, waliduje certyfikat oraz
URI SAN workloadu i ogranicza backend, Nginx oraz healthcheck do właściwych endpointów.
Backend i Nginx używają osobnych certyfikatów, weryfikują Service CA i DNS `authorization`
oraz łączą się wyłącznie przez HTTPS `9956`. Healthcheck używa trzeciej, minimalnej
tożsamości. Listener HTTP `9955` nie istnieje. Backend i Authorization weryfikują PgBouncera
przez Database CA, PgBouncer weryfikuje PostgreSQL przez `verify-full`, a oba odcinki wymagają
TLS 1.3 i SCRAM. Bezpośrednie migracje, backup i restore również używają `verify-full`;
plaintext jest odrzucany. Szczegóły opisuje
[kontrakt bezpieczeństwa transportu](transport-security.md).

## Chronologia wdrożenia Faz 0-10

Fazy 0-10 są zakończone. Poniższa chronologia zachowuje szczegóły kolejnych migracji i
bramek. Faza 3 ukończyła zakres danych i Object Storage, a Faza 4 została wykonana
wyprzedzająco. W Fazie 5 ukończono zamrożenie kontraktu oraz migrację Authorization z Express
do Hono, kontrakt ról/White-Label, lokalną hierarchię certyfikatów, listener mTLS i klienta
mTLS backendu i Nginx wraz z healthcheckami, TLS bazy, negatywne testy certyfikatów i pełną
integrację, usunięcie zależności Express/CORS z Authorization i końcową synchronizację
dokumentacji (kroki 1-16). Faza 5 jest zakończona. W Fazie 6 ukończono krok 1: wszystkie 21
tras backendu Express ma typowany manifest, kontrolę deklaracji źródłowych i probe
integracyjny przez Nginx. Migracja backendu do NestJS może rozpocząć się od kroku 2 zgodnie z
[planem Fazy 6](release.md#faza-6-backend-na-nestjs--node-26--typescript), przy zachowaniu
[zamrożonego kontraktu HTTP](phase-6-backend-http-contract.md). W kroku 2 wdrożono równoległy
backend NestJS `12.0.1` z `@nestjs/platform-express`, TypeScript 7/TSGO, ESM,
Vitest, natywnym Zod/Standard Schema, OpenAPI i shutdown hooks. Bramka DI, HTTP, walidacji,
OpenAPI, build ESM oraz kontrolowanego `SIGTERM` przeszła; fallback do NestJS 11 nie został
uruchomiony. W kroku 3 utworzono wszystkie 11 docelowych modułów, jawny acykliczny graf
zależności oraz test metadata `@Module`, który egzekwuje granice, odrzuca `forwardRef()` i
kompiluje pełny `AppModule` przez Nest DI. W kroku 4 dodano techniczny `PlatformModule` z Zod
ENV, lokalny schemat kompletnej konfiguracji backendu, natywne Standard Schema
request/response, stabilne `errorCode`, correlation ID, logi JSON oraz idempotentny rejestr
graceful shutdown. Registry używa już rzeczywistych
providerów PostgreSQL, RabbitMQ i outbox z kroków 8-9; nie dodano atrap połączeń. Compose/Nginx
nadal wskazuje typowany backend Express z Fazy 1. W kroku 5 `WhiteLabelModule` przejął
ładowanie jednej konfiguracji miasta i `/config/public`, a techniczny `HealthModule` przejął
liveness oraz oba aliasy readiness. Zachowano ETag, cache-control, puste `304`, odpowiedzi
`200`/`503` i zależności od PostgreSQL TLS, provider-neutralnego S3 oraz aktywnego configu.
Krótkotrwałe próby z kroku 5 zostały w kroku 8 zastąpione współdzielonymi providerami puli
PostgreSQL i klienta Object Storage. W
kroku 6 dodano bezpieczny domyślnie globalny guard, jawne tryby publiczny i optional-session,
guardy ról, typowany kontekst sesji, izolację `serviceKey` oraz wspólną politykę zdjęć.
NestJS przekazuje pełny Cookie i correlation ID do Authorization przez istniejący transport
mTLS, mapuje odrzuconą sesję na `401`, rolę na `403`, a niedostępność lub zły kontrakt usługi
na `503`. Backend nadal nie dekoduje sesji Better Auth. W kroku 7 dodano wszystkie 15 tras
mieszkańca, służb i admina, wspólne schematy requestów Zod oraz framework-neutralne use-case'y.
W kroku 8 semantyczny `IncidentDomainPort` otrzymał rzeczywisty adapter PostgreSQL/Object
Storage, stałą pulę przez PgBouncer/TLS oraz media HTTP z polityką dostępu i ETag/304.
W kroku 9 wdrożono RabbitMQ `4.3.3` przez AMQPS/TLS 1.3, wersjonowane quorum queues mediów i
LLM, retry TTL, DLQ, publisher confirms, odzyskiwalny PostgreSQL outbox, envelope korelacji
oraz transakcyjny rejestr idempotencji konsumentów. Test integracyjny potwierdza również
odrzucenie plaintext i obcej CA oraz ponowną publikację po niedostępności brokera.
W kroku 10 uruchomiono osobny kontener `media_worker` jako NestJS standalone bez HTTP i Hono.
Krok 11 podłączył neutralny Object Storage, konsumpcję RabbitMQ i `sharp@0.35.3`: worker
waliduje kontrakt oraz dekodowaną zawartość, pilnuje limitów, normalizuje orientację i sRGB,
usuwa metadane oraz zapisuje WebP. Ma własne limity zasobów, kontrolowany prefetch, retry/DLQ,
idempotencję, graceful shutdown i readiness PostgreSQL/RabbitMQ/Object Storage. Nie otrzymuje
sekretów Authorization ani `RUSTFS_*`. Krok 12 dodał `llm_gateway` jako jedyną granicę
backendu do opcjonalnego Docker Model Runner. Faza 7 usunęła przejściowy FastAPI i
zweryfikowała realną inferencję Gemma 3 1B. Krok 13 Fazy 6 dodał generowane ze
wspólnych schematów OpenAPI dla wszystkich 20 zachowywanych operacji i równoległy runtime do
bramki parytetu. W kroku 14 aktywny `backend` oraz domyślne polecenie obrazu przełączono na
NestJS na porcie `3000`, usunięto `backend_nest` i diagnostyczne `/protected` z manifestu.
Test przechodzi teraz przez Nginx, sprawdza strukturalne `errorCode`, OpenAPI, rzeczywiste
zależności, TLS/mTLS/AMQPS, przeciążenie kolejki, restart workera, retry, DLQ i idempotencję.
W kroku 15 usunięto ręczny bootstrap Express, routery, middleware, zależności legacy i
tymczasowy override rollbacku. Express pozostaje wyłącznie wewnętrznym adapterem
`@nestjs/platform-express`. Faza 6 jest zakończona po 15 krokach. Bramka wydania stabilnego
NestJS 12 została przeniesiona po Fazach 7-12 jako bramka wspólnego baseline'u źródłowego:
[Faza 13](release.md#faza-13-bramka-wspólnego-baselineu-źródłowego--stabilne-nestjs-12).
Późniejsza Faza 14 obejmuje już rozwój asynchronicznej kontroli routingu przez LLM.
