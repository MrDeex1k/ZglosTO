# Docelowa architektura White-Label ZglosTO

## Cel

Ten dokument jest źródłem prawdy o docelowym kierunku architektury opisanym w [planie modernizacji](release.md). Nie zastępuje [audytu stanu obecnego](current-architecture-audit.md), który opisuje to, co repo robi dzisiaj. Status zaakceptowanych i otwartych ustaleń znajduje się w [rejestrze decyzji](architecture-decisions.md).

Kontrakty obecnego API, sesji, rol, statusow, zdjec i LLM sa zamrozone w [baseline kontraktów API](api-contracts-baseline.md). Ten dokument docelowy powinien byc z nim zgodny albo jawnie wskazywac migracje kontraktu.

ZgłosTO jest bazą kodu White-Label dla wielu niezależnych wdrożeń miejskich. Każda
instancja obsługuje dokładnie jedno miasto i ma osobną konfigurację, bazę, Object Storage,
konta, sekrety oraz runtime. Współdzielona jest wyłącznie baza kodu, nie dane ani instancja.

## Glowna zasada

Kod aplikacji nie powinien znac konkretnej nazwy miasta ani stalej listy sluzb. Te informacje maja pochodzic z konfiguracji i byc walidowane przy starcie systemu.

## Docelowe uslugi

| Usluga            | Technologia                             | Rola                                                 |
| ----------------- | --------------------------------------- | ---------------------------------------------------- |
| `frontend`        | TanStack Start, React, TypeScript, PNPM | Interfejs mieszkanca, sluzb i admina                 |
| `authorization`   | Hono, Node 26, TypeScript, Better Auth  | Auth, sesje, role, integracja z tabela uzytkownikow  |
| `backend`         | NestJS, platform-express, Node 26, TS   | Glowne API domenowe i orkiestracja przypadkow uzycia |
| `media_worker`    | NestJS standalone, TypeScript, Sharp    | Asynchroniczna walidacja i konwersja zdjęć do WebP   |
| `llm_gateway`     | Hono, Node 26, TypeScript               | Adapter miedzy NestJS a runtime'em modelu            |
| `model_runner`    | Docker Model Runner                     | Opcjonalny runtime modelu wlaczany flaga/profilami   |
| `postgres`        | PostgreSQL                              | Dane domenowe, auth i metadane                       |
| `pgbouncer`       | PgBouncer                               | Pooling polaczen do PostgreSQL                       |
| `rabbitmq`        | RabbitMQ                                | Trwałe kolejki zadań mediów i operacji LLM           |
| `object_storage`  | S3-compatible                           | Prywatne zdjęcia i inne pliki                        |
| `rustfs`          | RustFS                                  | Opcjonalny lokalny provider Object Storage           |
| `nginx` / ingress | Nginx / Ingress Controller              | Publiczne wejscie HTTP/TLS                           |

Backend NestJS zachowuje oficjalny adapter `@nestjs/platform-express` jako element docelowego
stacku. Nie planujemy migracji na `@nestjs/platform-fastify`. Usuwany w Fazie 6 „stary
Express” oznacza ręczny serwer, routery i middleware istniejącej aplikacji, a nie adapter
platformowy NestJS.

## Przeplyw zgloszenia

1. Mieszkaniec wypelnia formularz w TanStack Start.
2. Frontend pobiera konfiguracje White-Label i liste sluzb z kontrolowanego endpointu albo z bezpiecznie wystawionego pliku konfiguracyjnego.
3. Frontend pobiera krótko ważny presigned PUT, wysyła oryginał bezpośrednio do prywatnego
   Object Storage i przekazuje backendowi wyłącznie jednorazowy `uploadId`.
4. Backend weryfikuje metadane obiektu i zapisuje zgłoszenie oraz stan uploadu w PostgreSQL.
5. Oryginał pozostaje w prywatnym prefiksie staging tylko na czas obróbki.
6. Backend publikuje przez outbox zadanie zawierające identyfikator zdjęcia i object key.
7. RabbitMQ przekazuje zadanie do `media_worker`; binarny plik nie przechodzi przez kolejkę.
8. Worker używa Sharp do walidacji, ograniczenia dłuższego boku do 2000 px i konwersji do
   WebP quality 85, zapisuje wynik, ustawia `ready`, a następnie usuwa oryginał. Cleanup
   ponawia nieudane usunięcia oraz usuwa wygasłe uploady staging.
9. Backend wysyla opis zgloszenia do `llm_gateway` z krótkim timeoutem i fallbackiem;
   asynchroniczne retry/enrichment może używać osobnej kolejki RabbitMQ.
10. `llm_gateway` komunikuje sie z Docker Model Runner tylko wtedy, gdy tryb LLM jest wlaczony.
11. Gdy LLM jest niedostepny, backend zapisuje zgloszenie z fallbackiem i nie blokuje glownego przeplywu.
12. Sluzby albo admin obsluguja zgloszenie przez API NestJS.

## Konfiguracja White-Label

Minimalny kontrakt konfiguracji:

```yaml
schemaVersion: 1
configVersion: 'zglosto-2026-01'

city:
  key: zglosto
  displayName:
    'pl-PL': 'Warszawa'
    en: 'Warsaw'
  defaultLocale: 'pl-PL'
  supportedLocales:
    - 'pl-PL'
    - 'en'
  timezone: 'Europe/Warsaw'

branding:
  logoPath: '/assets/city-logo.svg'
  emblemAlt:
    'pl-PL': 'Herb miasta Warszawy'
    en: 'Coat of arms of Warsaw'
  faviconPath: '/assets/favicon.svg'
  colors:
    primary: '#0057B8'
    secondary: '#FFFFFF'
    accent: '#F5A623'

contact:
  email: 'kontakt@zglosto.example'
  phone: '+48 22 000 00 00'
  website: 'https://zglosto.example'
  address:
    'pl-PL': 'ul. Przykladowa 1, 00-001 Warszawa'
    en: '1 Example Street, 00-001 Warsaw'
  officeHours: null

localContent:
  siteTitle:
    'pl-PL': 'ZglosTO - Warszawa'
    en: 'ZglosTO - Warsaw'
  siteDescription:
    'pl-PL': 'Miejski system zglaszania incydentow w Warszawie.'
    en: 'Municipal incident reporting system for Warsaw.'
  footerText:
    'pl-PL': 'Warszawa dziekuje za odpowiedzialne zglaszanie problemow.'
    en: 'Warsaw thanks you for reporting local problems responsibly.'
  legalNotice:
    'pl-PL': 'Zgloszenie nie zastepuje kontaktu z numerem alarmowym 112.'
    en: 'A report does not replace contacting the 112 emergency number.'
  reportAddressPlaceholder:
    'pl-PL': 'np. ul. Glowna 123, Warszawa'
    en: 'e.g. 123 Main Street, Warsaw'

services:
  - key: roads
    label:
      'pl-PL': 'Zarzad Drog'
      en: 'Road Authority'
    shortLabel:
      'pl-PL': 'ZD'
      en: 'Roads'
    enabled: true
    sortOrder: 10
    iconKey: road
    description: null
    color: '#EA580C'
  - key: transit
    label:
      'pl-PL': 'Miejskie Przedsiebiorstwo Komunikacyjne'
      en: 'Municipal Public Transport Company'
    shortLabel:
      'pl-PL': 'MPK'
      en: 'Transit'
    enabled: true
    sortOrder: 20
    iconKey: bus
    description: null
    color: '#2563EB'
  - key: other
    label:
      'pl-PL': 'Inne'
      en: 'Other'
    shortLabel:
      'pl-PL': 'Inne'
      en: 'Other'
    enabled: true
    sortOrder: 999
    iconKey: circle_help
    description: null
    color: '#6B7280'

routing:
  fallbackServiceKey: other

map:
  provider: 'osm'
  center:
    lat: 52.2297
    lng: 21.0122
  zoom: 12
```

Zasady:

- jeden deployment obsluguje jedno miasto;
- YAML wskazany przez `WHITE_LABEL_CONFIG` jest wersjonowanym zrodlem prawdy produktu i nie jest edytowany z panelu admina;
- schemat jest strict, walidowany przez Zod przy starcie, a bledna konfiguracja blokuje readiness;
- config nie zawiera sekretow i jest aktywowany przez restart/rollout, bez hot reloadu;
- `service.key` jest stabilnym identyfikatorem w API i bazie.
- `service.label` i `service.shortLabel` sa lokalizowanymi tekstami wyswietlanymi w UI.
- Historyczne etykiety usług nie są częścią docelowego kontraktu konfiguracji.
- Frontend wyswietla tylko `enabled: true`.
- Backend waliduje `typ_sluzby`/service key wzgledem konfiguracji.
- PostgreSQL przechowuje katalog w tabeli `service_types`; migracja z enumu została zakończona w kroku 7 Fazy 2.
- nieaktywna usluga pozostaje dostepna dla danych historycznych, ale nie przyjmuje nowych przypisan.
- Logo powinno byc plikiem mountowanym do kontenera, zasobem statycznym frontendu albo obiektem w RustFS, ale kontrakt `logoPath` ma pozostac stabilny.
- publiczna czesc konfiguracji jest udostepniana przez kontrolowany endpoint z wersja i ETag/checksum.

## Granice odpowiedzialnosci

### Frontend

- Renderuje UI z konfiguracji White-Label.
- Nie trzyma stalej listy sluzb w kodzie.
- Korzysta z routingu i loaderow TanStack Start.
- Uzywa TanStack Query jako standardu dla stanu serwerowego, cache, invalidacji i mutation state.
- Nie używa obecnie TanStack Table; widoki kart pozostają prostymi komponentami React.
  Biblioteka może zostać ponownie oceniona dopiero dla rzeczywistych, złożonych tabel
  wymagających paginacji serwerowej, operacji zbiorczych lub wirtualizacji.
- Używa TanStack Form z Zod dla wszystkich formularzy zapisujących dane użytkownika.
  Schematy uwzględniają aktywny katalog usług White-Label, ale walidacja przeglądarkowa
  nie zastępuje walidacji backendu.
- Uzywa lokalnych komponentow shadcn/ui opartych na Base UI; komponenty domenowe nie importuja bezposrednio Base UI ani Radix.
- Zachowuje komponenty design systemu w `frontend/src/components/ui` i tokeny White-Label niezaleznie od frameworka routingu.
- Traktuje TanStack Start jako warstwe web/BFF, a nie drugi backend domenowy.
- Korzysta wyłącznie z kontraktów HTTP NestJS i Authorization; nie importuje sterowników
  PostgreSQL, klientów Object Storage/RabbitMQ ani implementacji innych usług.
- Ogranicza ewentualne server functions do cienkich adapterów
  `frontend/src/server/bff`, bez logiki domenowej. Granicę egzekwuje
  `scripts/check-frontend-boundary.sh`.
- Po kazdej wiekszej zmianie React uruchamiany jest React Doctor jako kontrola jakosci.

### Authorization

- Wystawia endpointy Better Auth.
- Dba o cookies, CORS, sesje i role.
- Dla React Native + Expo uzywa oficjalnej integracji `@better-auth/expo`; klient przechowuje cookies w SecureStore i jawnie przekazuje je w naglowku do chronionego API.
- Dokłada do sesji `uprawnienia` i stabilny `serviceKey`; klucz jest dostępny wyłącznie dla roli `sluzby` przypisanej do aktywnej usługi.
- Nie zawiera logiki incydentow.
- Wewnętrzny listener uwierzytelnia backend i Nginx przez mTLS. Każdy klient ma osobny
  certyfikat workloadu; certyfikat nie zastępuje sesji ani kontroli roli użytkownika.
- Przeglądarka i Expo łączą się przez publiczny HTTPS Nginx/Ingress i nie otrzymują
  certyfikatów klienckich.

### Backend

- Jest jedynym glowym API domenowym.
- Pozwala utworzyc anonimowe zgloszenie z adresem e-mail, ale prywatna historie udostepnia tylko po sesji; po potwierdzeniu e-maila przypisuje wcześniejsze anonimowe zgloszenia do `user.id`.
- Nie komunikuje sie bezposrednio z Docker Model Runner.
- Korzysta z neutralnego `ObjectStorage`; lokalnie providerem jest opcjonalny RustFS, a
  zewnętrznie może nim być AWS S3 lub Cloudflare R2.
- Korzysta z PgBouncera do PostgreSQL.
- Łączy się z authorization przez REST/JSON zabezpieczony mTLS, a nie przez gRPC.
- Publikuje trwałe zadania przez PostgreSQL outbox i RabbitMQ, ale nie wykonuje Sharp w
  procesie HTTP.
- Egzekwuje role i service keys.

### Bezpieczeństwo transportu

- Backend i Nginx przedstawiają authorization osobne certyfikaty klienckie wystawione przez
  Service CA.
- Backend i authorization używają natywnego protokołu PostgreSQL przez PgBouncera; oba
  odcinki są zabezpieczone TLS z pełną weryfikacją serwera i SCRAM-SHA-256.
- Nie używamy mTLS do PostgreSQL ani RPC jako proxy do bazy.
- Service CA i Database CA są rozdzielone, a certyfikaty są dostarczane i rotowane poza
  obrazami. Szczegóły definiuje [kontrakt bezpieczeństwa transportu](transport-security.md).

### Media Worker

- Jest osobnym procesem TypeScript/NestJS standalone w tym samym monorepo co backend.
- Nie wystawia publicznego HTTP i nie potrzebuje Hono.
- Odbiera z RabbitMQ wyłącznie identyfikatory oraz object keys.
- Używa Sharp do weryfikacji zawartości i limitu pikseli, normalizacji orientacji, usunięcia
  zbędnych metadanych oraz konwersji do WebP.
- Ma ograniczoną współbieżność, idempotentne operacje, manual ACK, retry/backoff i DLQ.
- Aktualizuje stan `pending`/`processing`/`ready`/`failed` oraz metadane wyniku.

### LLM Gateway

- Jest cienkim adapterem HTTP.
- Normalizuje odpowiedzi modelu.
- Obsluguje timeouty, retry i fallbacki.
- Przy niedostepnym, wylaczonym, przekraczajacym timeout albo zwracajacym nieprawidlowa odpowiedz modelu zwraca `classification: unknown`, `serviceKey` z `routing.fallbackServiceKey`, `modelAvailable: false`, `source: fallback` oraz kod `reason`.
- Nie ujawnia mieszkancowi technicznej przyczyny awarii; backend zapisuje zgloszenie, a UI informuje o recznej weryfikacji.
- Nadaje sie do serverless scale-to-zero.
- Moze byc wymieniony na inny provider bez przepisywania backendu.

## Docker Model Runner

Docker Model Runner nie jest wymagany do podstawowego uruchomienia systemu. Ma byc wlaczany jawnie, np. przez:

- Compose profile `llm`;
- zmienna `LLM_RUNTIME=docker-model-runner`;
- osobny plik Compose dla DMR;
- odpowiedni overlay Kubernetes/K3s albo zewnętrzny endpoint modelu.

Gdy tryb LLM nie jest wlaczony:

- `llm_gateway` zwraca kontrolowany fallback albo status niedostepnosci;
- backend zapisuje zgloszenie bez blokowania glownego przeplywu;
- UI pokazuje przewidywalny stan zamiast bledow technicznych.

## Profile wdrożeniowe i scale-to-zero

Docelowo utrzymujemy trzy profile produkcyjne:

- Docker Compose jako utwardzony profil na pojedynczym hoście, z ręcznym/statycznym
  skalowaniem i jawnym brakiem wysokiej dostępności hosta;
- Kubernetes jako ogólny profil klastrowy;
- K3s jako lżejszy profil klastrowy dla mniejszych wdrożeń, dostępny w wariancie
  pojedynczego serwera albo HA.

Każdy profil zapewnia ten sam kontrakt funkcjonalny, bezpieczeństwa transportu,
konfiguracji White-Label, danych, obrazów i obserwowalności. Compose nie emuluje KEDA,
HPA, PDB ani rolloutów klastrowych, a jego SLA, RTO i RPO muszą uwzględniać awarię
pojedynczego hosta. Autoskalowanie i scale-to-zero są funkcjami Kubernetes/K3s.

Bieżące pliki Compose i manifesty są stanem przejściowym, nie certyfikowanymi
deploymentami produkcyjnymi. Szczegóły opisuje
[plan modernizacji profili](k8s-k3s-modernization.md), a kolejność wykonawcza
[plan Fazy 9](phase-9-execution-plan.md).

`llm_gateway` używa scale-to-zero w profilach Kubernetes/K3s, ponieważ:

- jest bocznym adapterem;
- nie przechowuje stanu;
- moze tolerowac cold start;
- backend moze miec fallback przy niedostepnosci.

Wybrano KEDA HTTP Add-on 0.15.0 z `InterceptorRoute` v1beta1 i zakresem `0-4`.
Knative Serving odrzucono, aby nie utrzymywać drugiego, cięższego stosu operacyjnego.
Backend komunikuje się przez interceptor KEDA i zachowuje timeout oraz fallback.
Przed-1.0 linia dodatku i API v1beta1 są jawnym ryzykiem certyfikowanym na realnych
K8s/K3s w Fazie 12.
Compose nadal uruchamia jedną replikę gatewaya albo tryb LLM `disabled`.

## Redis, cache i rate limiting

Redis został wybrany zamiast PostgreSQL `UNLOGGED TABLES` dla współdzielonego cache’u i
rate limitingu. RabbitMQ pozostaje brokerem trwałych zadań, PostgreSQL źródłem prawdy, a
sesje Better Auth pozostają w PostgreSQL.

Każda instancja Authorization i backendu ma zawsze aktywny, ograniczony pamięciowo limiter
lokalny. `REDIS_MODE=disabled` wyłącza wyłącznie Redis: mały, pojedynczy Compose nadal ma
pełny lokalny limiter. `local` i `external` dodają atomowy limiter wspólny dla wszystkich
replik oraz cache Redis; lokalny limiter pozostaje pierwszą warstwą przeciw burstom i
fallbackiem.

Better Auth zachowuje własne reguły. W `disabled` przechowuje liczniki w pamięci, a w
`local`/`external` korzysta z Redis przez atomowe `rateLimit.customStorage`; globalne
`secondaryStorage` nie jest używane, dzięki czemu sesje pozostają w PostgreSQL. Publiczny endpoint
dodawania zgłoszeń ma osobne limity po IP, zalogowanym użytkowniku i globalnym ruchu
instalacji. E-mail jest sygnałem telemetrycznym, a nie samodzielnym kluczem blokującym.

Publiczna lista rozwiązanych incydentów używa cache-aside Redis z TTL `900 s`,
natychmiastową invalidacją po zmianie widocznych danych i fallbackiem do PostgreSQL. Nginx
ma microcache `30 s`. Pojedynczy Compose `disabled` nie ma cache’u Redis i cache’uje ten
publiczny endpoint w Nginx przez `900 s`.

Awaria Redisa nie blokuje sesji, przyjęcia zgłoszenia ani publicznego odczytu: lokalny
limiter pozostaje aktywny, odczyt wraca do PostgreSQL, a readiness raportuje stan
`degraded`. Szczegóły opisuje
[kontrakt Fazy 10](phase-10-redis-cache-rate-limiting.md).

## Kolejnosc zaleznosci

1. PNPM workspace i wspolne typy.
2. White-Label config.
3. PgBouncer, provider-neutralny Object Storage i lokalny wariant RustFS.
4. Hono auth.
5. Nest backend, RabbitMQ i osobny `media_worker` ze Sharp.
6. Hono LLM gateway.
7. Docker Model Runner jako opcja.
8. React Doctor baseline.
9. Progresywna migracja shadcn/Radix do shadcn/Base UI.
10. TanStack Start.
11. Trzy profile produkcyjne; scale-to-zero gatewaya wyłącznie w Kubernetes/K3s.
12. Redis, zawsze aktywny lokalny rate limiting i cache publicznej listy.
13. Optymalizacja obrazow Docker.

## Antywzorce do unikniecia

- Hardcode nazwy miasta lub sluzb w komponentach.
- Bezposrednie wywolania Docker Model Runner z backendu.
- Wymaganie LLM do zapisu zgloszenia.
- Obróbka Sharp w procesie HTTP backendu.
- Przesyłanie binarnych zdjęć przez RabbitMQ.
- Migracja frontend/backend/auth/storage w jednym kroku.
- Optymalizacja Dockerfile przed ustaleniem docelowego runtime'u.
- Uznanie `REDIS_MODE=disabled` za wyłączenie rate limitingu zamiast wyłącznie brak Redisa.
- Przenoszenie sesji Better Auth, trwałych zadań RabbitMQ lub danych biznesowych do Redisa.
