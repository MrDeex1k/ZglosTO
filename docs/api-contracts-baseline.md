# Baseline kontraktow API i sesji

## Cel

Ten dokument jest źródłem prawdy o obecnym kontrakcie HTTP, sesji, rol, statusow, zdjec i LLM przed migracjami opisanymi w [planie modernizacji](release.md). Status decyzji wpływających na kontrakty znajduje się w [rejestrze decyzji](architecture-decisions.md).

Baseline powstal jako pierwszy krok modernizacji i jest aktualizowany po zmianach kontraktów.
PNPM workspace, `packages/contracts`, White-Label i Object Storage są już wdrożone. Dokument
nadal chroni wspólny język i granice po migracjach do Hono, NestJS, TanStack Start i
`llm_gateway`.

Pełna, wykonywalna inwentaryzacja metod, ścieżek, statusów i dostępu dla 20 tras aktywnego
backendu NestJS znajduje się w [kontrakcie HTTP backendu Fazy 6](phase-6-backend-http-contract.md).
Ten dokument pozostaje źródłem szczegółowych modeli domenowych i semantyki odpowiedzi.

## Zakres

Dokument obejmuje:

- obecny kontrakt frontend -> backend;
- obecny kontrakt frontend -> authorization;
- obecny kontrakt backend -> authorization;
- obecny kontrakt backend -> `llm_gateway`;
- role, statusy i typy sluzb;
- format zdjec;
- kontrakt sesji dla web i przyszlego React Native;
- docelowy kierunek dla `packages/contracts`.

## Obecne uslugi

| Usluga              | Obecny katalog       | Obecny runtime                   | Odpowiedzialnosc               |
| ------------------- | -------------------- | -------------------------------- | ------------------------------ |
| `frontend`          | `frontend/`          | TanStack Start SPA + React       | UI i wywolania API             |
| `backend`           | `backend/`           | Node 26.8.1 + NestJS             | API incydentow, admina i sluzb |
| `authorization`     | `authorization/`     | Node 26.8.1 + Hono + Better Auth | auth, sesje i role             |
| `llm_gateway`       | `llm_gateway/`       | Node 26 + Hono + TypeScript      | granica klasyfikacji LLM       |
| Docker Model Runner | poza kodem aplikacji | llama.cpp + Gemma 3 1B QAT       | opcjonalny runtime modelu      |
| `database`          | `database/`          | PostgreSQL                       | dane domenowe i auth           |

Kontrakt liveness/readiness wszystkich uslug opisuje dokument [Healthchecki Fazy 0](healthchecks.md).

## Obecny model URL-i

Przegladarka korzysta z jednego origin i stabilnych prefiksow:

- `/` -> frontend;
- `/api/auth/*` -> authorization;
- `/api/*` -> backend, po usunieciu publicznego prefiksu `/api`;
- wyłącznie `/llm/health` -> `llm_gateway:8130/health`; klasyfikacja nie jest publiczna.

Frontend uzywa `VITE_API_BASE_URL=/api` i `VITE_LLM_BASE_URL=/llm`. Better Auth client nie ma jawnego `baseURL` i korzysta z domyslnego same-origin `/api/auth`.

W Compose i K8s routing realizuje Nginx. Serwer developerski TanStack Start/Vite wystawia
te same ścieżki przez proxy do lokalnych procesów, dzięki czemu kod frontendu nie zmienia
modelu URL-i między środowiskami.

## Auth i sesja - stan obecny

### Frontend -> authorization

Frontend uzywa Better Auth client z domyslnym same-origin `baseURL = /api/auth`.

Najwazniejsze operacje:

| Operacja       | Endpoint Better Auth                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| rejestracja    | `POST /api/auth/sign-up/email`                                                  |
| logowanie      | `POST /api/auth/sign-in/email`                                                  |
| wylogowanie    | `POST /api/auth/sign-out`                                                       |
| pobranie sesji | endpoint Better Auth klienta, obecnie uzywany przez `getSession` / `useSession` |

Sesja webowa jest przenoszona przez cookie Better Auth.

### Backend -> authorization

Chronione trasy backendu używają globalnego guarda NestJS i mostu mTLS z `AuthBridgeModule`.
Odpowiedź Authorization jest traktowana jako `unknown` i walidowana współdzielonym parserem
`parseVerifiedAuthSession`, zanim zweryfikowany kontekst użytkownika trafi do requestu.

Obecny mechanizm:

1. Backend przekazuje pelny naglowek `Cookie` do `GET ${AUTH_SERVICE_URL}/api/verify-session`.
2. Authorization waliduje sesje przez Better Auth i zwraca `session` oraz rozszerzonego `user`.
3. Backend sprawdza `user.uprawnienia` przeciw dozwolonym rolom i zwraca `403` przy niewlasciwej roli.
4. Ten sam kontrakt obsluguje automatyczne cookie przegladarki oraz jawny naglowek `Cookie` przyszlego klienta Expo.

To jest krytyczny kontrakt migracji auth na Hono. Od kroku 1 Fazy 5 jest wykonywalnie
zamrożony w `tests/integration/authorization-contract.integration.ts`, a po krokach 2-4
przechodzi już na implementacji Hono. Test sprawdza publiczną granicę przez Nginx oraz
bezpośrednią granicę backend -> Authorization, w tym CORS, cookie, role, `customSession`,
wylogowanie i healthchecki.

Transport do Authorization używa HTTPS/mTLS. Backend oraz Nginx przedstawiają osobne
certyfikaty klienta, ufają Service CA, wymagają TLS 1.3 i weryfikują DNS `authorization`, a
Authorization nadal osobno waliduje sesję Better Auth. Dedykowana tożsamość healthchecka ma
dostęp wyłącznie do `/health*`; listener plaintext nie istnieje. Przeglądarka i Expo nie
posiadają certyfikatów klienckich. Szczegóły opisuje
[kontrakt bezpieczeństwa transportu](transport-security.md).

### Role w sesji

Obecne role:

- `mieszkaniec`;
- `sluzby`;
- `admin`.

Dodatkowe pole:

- `serviceKey`: stabilny klucz aktywnej usługi dla roli `sluzby` albo `null`.

W bazie pole nazywa się `service_key`. Role `mieszkaniec` i `admin` zawsze otrzymują
`serviceKey: null`; Authorization nie propaguje klucza nieaktywnej usługi.

## Auth i React Native - kontrakt docelowy

Better Auth pozostaje zrodlem prawdy dla sesji, uzytkownikow i rol rowniez dla przyszlej aplikacji React Native + Expo.

Docelowy kontrakt:

- web:
  - standardowe cookie Better Auth;
  - `credentials: include`;
  - ochrona CSRF/CORS zgodna z wybranym deploymentem.
- mobile React Native:
  - oficjalny plugin `@better-auth/expo` po stronie serwera i `expoClient` po stronie aplikacji;
  - cookies i cache sesji przechowywane przez klienta Better Auth w Expo SecureStore;
  - chronione requesty domenowe jawnie przekazuja wartosc zwracana przez `authClient.getCookie()` w naglowku `Cookie`, z `credentials: omit`;
  - backend nie waliduje cookie samodzielnie, tylko przekazuje naglowki do `authorization`;
  - role i service keys dalej pochodza z auth/domain DB.

Docelowy auth service powinien obslugiwac dwa transporty tej samej sesji:

- automatyczne cookie przegladarki dla web;
- cookie przechowywane bezpiecznie i jawnie wysylane w naglowku przez Expo dla mobile.

Bearer plugin Better Auth pozostaje mozliwym rozszerzeniem, ale nie jest czescia bazowego kontraktu. Przy implementacji klienta mobilnego trzeba ponownie potwierdzic API aktualnej wersji Better Auth i `@better-auth/expo`.

## Backend API - stan obecny

### Publiczne endpointy mieszkanca

| Metoda | Sciezka                         | Auth                | Opis                                         |
| ------ | ------------------------------- | ------------------- | -------------------------------------------- |
| `GET`  | `/mieszkaniec/incydenty/glowna` | brak                | ostatnie 15 naprawionych zgloszen            |
| `GET`  | `/mieszkaniec/incydenty`        | sesja `mieszkaniec` | prywatna lista przypisana do `user.id`       |
| `POST` | `/mieszkaniec/incydenty`        | opcjonalna          | anonimowe albo sesyjne utworzenie zgloszenia |

`POST /mieszkaniec/incydenty` przyjmuje:

```json
{
  "opis_zgloszenia": "string",
  "mail_zglaszajacego": "string",
  "adres_zgloszenia": "string",
  "latitude": "number | null",
  "longitude": "number | null",
  "typ_sluzby": "string | optional",
  "zdjecie_incydentu_zglaszanego": "base64 string | optional"
}
```

Uwagi:

- `GET /mieszkaniec/incydenty` nie przyjmuje e-maila z query i wymaga zweryfikowanej sesji z rola `mieszkaniec`;
- anonimowe `POST /mieszkaniec/incydenty` pozostaje dozwolone i wymaga adresu e-mail;
- `latitude` i `longitude` są opcjonalną parą WGS84; muszą wystąpić razem i mieścić się w
  zakresach `-90..90` oraz `-180..180`;
- pominięte współrzędne są na granicy transportu normalizowane do `null`, a listy i odpowiedź
  utworzenia zawsze zwracają oba pola jako liczby albo oba jako `null`;
- tekstowy adres pozostaje wymagany, a endpoint nie wykonuje zewnętrznego geokodowania;
- rekord przechowuje znormalizowany e-mail zglaszajacego oraz opcjonalne `reporter_user_id`;
- dla zalogowanego mieszkanca backend wiąże rekord z `user.id` i odrzuca e-mail inny niz e-mail sesji;
- po utworzeniu konta i potwierdzeniu wlasnosci e-maila system idempotentnie przypisuje wcześniejsze anonimowe zgloszenia o tym samym znormalizowanym adresie do `user.id`;
- prywatna lista profilu jest pobierana po sesji i obejmuje zgloszenia przypisane do `user.id`, w tym przejete zgloszenia anonimowe;
- samo podanie cudzego adresu w anonimowym formularzu nie daje dostepu do listy; przejecie historii wymaga potwierdzenia e-maila.

### Chronione endpointy sluzb

Wymagana rola: `sluzby`.

| Metoda  | Sciezka                                    | Opis                                     |
| ------- | ------------------------------------------ | ---------------------------------------- |
| `GET`   | `/sluzby/incydenty`                        | lista zgloszen dla `req.user.serviceKey` |
| `GET`   | `/sluzby/statystyki`                       | statystyki dla sluzby                    |
| `PATCH` | `/sluzby/incydenty/:id/status`             | zmiana statusu                           |
| `PATCH` | `/sluzby/incydenty/:id/sprawdzenie`        | zmiana flagi sprawdzenia                 |
| `PATCH` | `/sluzby/incydenty/:id/typ`                | przekierowanie do innej sluzby           |
| `POST`  | `/sluzby/incydenty/:id/zdjecie_rozwiazane` | zapis zdjecia rozwiazania                |

Służba listuje i modyfikuje wyłącznie incydenty zgodne z własnym `serviceKey`; próba zmiany incydentu innej służby zwraca `404` bez ujawniania jego istnienia.

### Chronione endpointy admina

Wymagana rola: `admin`.

| Metoda  | Sciezka                            | Opis                                       |
| ------- | ---------------------------------- | ------------------------------------------ |
| `GET`   | `/admin/statystyki`                | statystyki globalne                        |
| `GET`   | `/admin/incydenty`                 | wszystkie zgloszenia                       |
| `PATCH` | `/admin/incydenty/:id/sprawdzenie` | zmiana flagi sprawdzenia                   |
| `PATCH` | `/admin/incydenty/:id/typ`         | zmiana przypisania sluzby                  |
| `PATCH` | `/admin/incydenty/:id/status`      | zmiana statusu                             |
| `PATCH` | `/admin/uzytkownicy/service-key`   | zmiana roli i przypisania usługi po emailu |

`PATCH /admin/uzytkownicy/service-key` przyjmuje:

```json
{
  "email": "string",
  "uprawnienia": "mieszkaniec | sluzby | admin",
  "serviceKey": "string | null"
}
```

`serviceKey` jest wymagany dla roli `sluzby`, musi wskazywać aktywną usługę i jest
normalizowany do `null` dla pozostałych ról.

## Statusy incydentu

Statusy backendu, API i bazy po wdrozeniu ADR-007:

- `reported`;
- `in_progress`;
- `resolved`.

Kontrakt rozdziela:

- stabilny kod maszynowy `reported`, `in_progress`, `resolved`;
- etykiete UI, np. `ZGŁOSZONY`, `W TRAKCIE NAPRAWY`, `NAPRAWIONY`.

Stare wartosci nie sa przyjmowane przez API. Istniejace lokalne dane migruje idempotentny skrypt `database/migrations/001-incident-status-codes.sql`, uruchamiany przez `scripts/migrate-incident-statuses.sh`. Nowe bazy od razu tworza enum z kodami maszynowymi. Nie utrzymujemy publicznej warstwy kompatybilnosci, poniewaz aplikacja nie byla wdrozona produkcyjnie.

## Typy sluzb

Obecny kontrakt White-Label:

```ts
type ServiceKey = string;

interface CityService {
  key: ServiceKey;
  label: { 'pl-PL': string; en: string };
  shortLabel: { 'pl-PL': string; en: string };
  enabled: boolean;
  description: string | null;
  color: string | null;
  iconKey: string;
}
```

Zasada:

- API i baza uzywaja `serviceKey`;
- UI pokazuje `label`;
- konfiguracja miasta decyduje, ktore sluzby sa aktywne.
- PostgreSQL zapewnia integralnosc przez `service_types` i klucze obce; migracja
  `004-service-types-catalog.sql` usunela historyczny `typ_sluzby_enum`.

## Publiczna konfiguracja White-Label

| Metoda | Sciezka              | Sesja | Odpowiedz                                                 |
| ------ | -------------------- | ----- | --------------------------------------------------------- |
| `GET`  | `/api/config/public` | brak  | `{ configVersion, checksum, config }` albo `304` bez body |

`config` jest ścisłą allowlistą: dane miasta i locale, branding, publiczny kontakt, lokalne
treści, aktywne usługi, publiczny `routing.fallbackServiceKey`, mapa oraz jawne feature flags.
Nie zawiera ustawień integracji ani sekretów. Pole `checksum` identyfikuje źródłowy YAML,
a silny ETag jest hashem dokładnej publicznej reprezentacji JSON. Odpowiedź ma
`Cache-Control: public, max-age=60, must-revalidate`; klient może użyć `If-None-Match` do
rewalidacji.

## Zdjecia - stan obecny

Obecnie:

- frontend wysyla base64 string bez prefiksu `data:*;base64,`;
- backend waliduje limit 5 MiB oraz magic bytes JPEG/PNG/GIF/WebP;
- plik trafia przez `ObjectStorage` do aktywnego prywatnego bucketu S3-compatible;
- PostgreSQL przechowuje wyłącznie referencje, metadane i stan przetwarzania;
- listy zwracają `IncidentImageRef | null`, nigdy base64 ani `Buffer`;
- `GET /api/images/:id` zwraca bajty po sprawdzeniu uprawnień; zdjęcie rozwiązania jest
  publiczne tylko wtedy, gdy zgłoszenie ma status `resolved`.

Pola:

- `zdjecie_incydentu_zglaszanego`;
- `zdjecie_incydentu_rozwiazanego`.

Typ odpowiedzi:

```ts
interface IncidentImageRef {
  id: string;
  kind: 'report' | 'resolution';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  original: ImageObjectMetadata;
  processed: ImageObjectMetadata | null;
  width: number | null;
  height: number | null;
  failureCode: string | null;
  url: string;
}

interface ImageObjectMetadata {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}
```

## LLM - stan obecny

Backend i publiczny healthcheck korzystają z `llm_gateway`:

| Metoda  | Sciezka              | Body                             | Odpowiedz                                                                    |
| ------- | -------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `GET`   | `/health`            | brak                             | `{ status, service, model, enabled, loaded, error? }`                        |
| `GET`   | `/health/live`       | brak                             | `{ status, service }`                                                        |
| `GET`   | `/health/ready`      | brak                             | `200`, gdy model jest dostepny; w innym przypadku `503`                      |
| `QUERY` | `/classify-incident` | `{ description, address, city }` | `{ classification, serviceKey, confidence, modelAvailable, source, reason }` |

Frontend nie wywołuje modelu przed zapisem. Backend NestJS odpytuje wyłącznie gateway z
krańcowym timeoutem 7 s i zawsze zapisuje zgłoszenie. Gateway domyślnie działa w trybie
`disabled`; opcjonalny Docker Model Runner ma timeout 5 s i nie zmienia kontraktu backendu.
Wynik trafia do `llm_classification`, `llm_model_available`, `llm_source`
i `llm_reason`; `LLM_odpowiedz` pozostaje tylko polem kompatybilności.

Gateway zwraca `serviceKey: null`; model nie zna routingu miejskiego. Backend używa wybranej
służby dla poprawnej klasyfikacji albo `routing.fallbackServiceKey` dla `unknown`. Przy
`emergency` UI nadal zaleca telefon pod 112.

Stan healthchecku modelu jest osobny: `/health` moze zwrocic `error: model_disabled` albo `error: model_unavailable`, a `/health/ready` zwraca wtedy `503`. Te wartosci nie sa obecnie prezentowane mieszkancom.

## LLM - wdrożony kontrakt docelowy

Backend komunikuje się tylko z `llm_gateway`, nie z runtime'em modelu bezpośrednio.

Zaakceptowany kontrakt:

```http
QUERY /classify-incident
Content-Type: application/json
```

```json
{
  "description": "string",
  "address": "string | null",
  "city": "string | null"
}
```

```json
{
  "classification": "municipal | emergency | unknown",
  "serviceKey": "string | null",
  "confidence": 0.0,
  "reason": "timeout | disabled | unavailable | invalid_response | null",
  "modelAvailable": true,
  "source": "model | fallback"
}
```

Zasady:

- `QUERY` jest bezpieczną i idempotentną metodą kontraktu backend -> gateway zgodną z RFC 10008;
- gateway wymaga `Content-Type: application/json`, ogłasza `Accept-Query: application/json`
  i zwraca `Cache-Control: no-store` dla odpowiedzi klasyfikacji;
- podpis workload HMAC obejmuje metodę `QUERY`, ścieżkę i body, a powtórzenie tego samego
  nonce nadal jest odrzucane; ewentualny retry aplikacyjny musi utworzyć nowy podpis;
- `POST /classify-incident` jest obsługiwany wyłącznie przejściowo na czas uporządkowanego
  rolloutu gateway -> backend; po potwierdzeniu braku starego ruchu zostanie usunięty;
- wywołanie gateway -> Docker Model Runner lub zewnętrzny runtime OpenAI-compatible pozostaje
  `POST`, ponieważ jest osobnym kontraktem dostawcy;
- LLM nie moze blokowac zapisu zgloszenia;
- gateway ma timeout i fallback;
- odpowiedz musi byc strukturalna, nie parsowana heurystycznie z tekstu;
- poprawna klasyfikacja modelu zwraca `source: model` i `modelAvailable: true`;
- niedostępny, wyłączony, przekraczający timeout albo zwracający nieprawidłową odpowiedź model
  daje w gatewayu `classification: unknown`, `serviceKey: null`, `modelAvailable: false`,
  `source: fallback` i odpowiedni kod `reason`;
- dopiero backend mapuje fallback na `routing.fallbackServiceKey` z konfiguracji miasta;
  gateway i runtime modelu nie znają katalogu służb ani routingu White Label;
- dane techniczne `source`, `modelAvailable` i `reason` sa zapisywane do diagnostyki, ale nie sa prezentowane mieszkancowi;
- przy fallbacku UI pokazuje: `Zgłoszenie zostało zapisane. Nie udało się automatycznie określić właściwej kategorii, dlatego zostanie ono zweryfikowane przez operatora.`;
- klasyfikacja `emergency` nie uruchamia sluzb ratunkowych; UI zapisuje zgloszenie i jednoznacznie zaleca kontakt z numerem 112 w sytuacji zagrozenia;
- Docker Model Runner jest opcjonalnym runtime'em, wlaczanym flaga/profilami.

Przyklad fallbacku:

```json
{
  "classification": "unknown",
  "serviceKey": "<routing.fallbackServiceKey>",
  "modelAvailable": false,
  "source": "fallback",
  "reason": "timeout"
}
```

## Minimalny pakiet `packages/contracts`

Pakiet `packages/contracts` jest wdrożonym wspólnym źródłem typów, stabilnych wartości runtime
i parserów odpowiedzi HTTP. Frontend oraz authorization korzystają z niego przez zależność
workspace. Struktura modułów i zasady użycia znajdują się w
[`packages/contracts/README.md`](../packages/contracts/README.md).

Minimalna zawartosc:

```ts
export type UserRole = 'mieszkaniec' | 'sluzby' | 'admin';

export type IncidentStatusCode = 'reported' | 'in_progress' | 'resolved';

export interface CityConfig {
  city: {
    key: string;
    displayName: { 'pl-PL': string; en: string };
    defaultLocale: 'pl-PL' | 'en';
    supportedLocales: Array<'pl-PL' | 'en'>;
    timezone: 'Europe/Warsaw';
  };
  branding: {
    logoPath: string;
    emblemAlt: { 'pl-PL': string; en: string };
    faviconPath: string;
    colors: { primary: string; secondary: string; accent: string };
  };
  contact: {
    email: string;
    phone: string | null;
    website: string | null;
    address: { 'pl-PL': string; en: string };
    officeHours: { 'pl-PL': string; en: string } | null;
  };
  localContent: {
    siteTitle: { 'pl-PL': string; en: string };
    siteDescription: { 'pl-PL': string; en: string };
    footerText: { 'pl-PL': string; en: string };
    legalNotice: { 'pl-PL': string; en: string };
    reportAddressPlaceholder: { 'pl-PL': string; en: string };
  };
  services: CityService[];
  map: {
    provider: 'osm' | 'maplibre' | 'google';
    center: { lat: number; lng: number } | null;
    zoom: number | null;
  } | null;
}

export interface CityService {
  key: string;
  label: string;
  enabled: boolean;
  description: string | null;
  color: string | null;
  icon: string | null;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  serviceKey: string | null;
}

export interface LlmClassificationRequest {
  description: string;
  address: string | null;
  city: string | null;
}

export interface LlmClassificationResponse {
  classification: 'municipal' | 'emergency' | 'unknown';
  serviceKey: string | null;
  confidence: number | null;
  reason: 'timeout' | 'disabled' | 'unavailable' | 'invalid_response' | null;
  modelAvailable: boolean;
  source: 'model' | 'fallback';
}
```

Docelowe kontrakty pakietu nie używają pól opcjonalnych ani `undefined`. Obecny transport
Express nadal akceptuje część starszych payloadów z pominiętymi polami; adapter migracyjny ma
normalizować taki brak do `null` przed wejściem do logiki domenowej. Pełne zasady oraz
inwentaryzacja migracji są opisane w
[zakresie Fazy 1](phase-1-contracts-typescript-scope.md).

## Status decyzji kontraktowych

1. `zaakceptowana` ([ADR-004](architecture-decisions.md)): anonimowe zgloszenia sa dozwolone, a po potwierdzeniu e-maila zostaja przypisane do konta; prywatne listy wymagaja sesji.
2. `zaakceptowana` ([ADR-005](architecture-decisions.md)): Better Auth obsluguje web i Expo; mobile przechowuje cookies w SecureStore i jawnie wysyla naglowek `Cookie` do API.
3. `wdrozona` ([ADR-006](architecture-decisions.md)): sesja, API i konsumenci używają wyłącznie stabilnego `serviceKey`; stara nazwa pozostaje tylko w historycznej migracji schematu.
4. `wdrozona` ([ADR-007](architecture-decisions.md)): baza, backend, frontend i wspolny kontrakt uzywaja kodow maszynowych; polskie nazwy sa etykietami UI.
5. `otwarta` ([ADR-008](architecture-decisions.md)): czy listy incydentow zwracaja miniatury/URL-e, czy tylko metadane zdjec?
6. `zaakceptowana` ([ADR-009](architecture-decisions.md)): awaria LLM zapisuje `unknown` z `fallbackServiceKey`, `modelAvailable: false`, `source: fallback` i technicznym kodem przyczyny, bez blokowania zgloszenia.

## Definicja ukonczenia baseline

Baseline jest gotowy, gdy:

- ten dokument jest aktualny wzgledem kodu;
- `docs/current-architecture-audit.md` wskazuje na ten kontrakt;
- [plan modernizacji](release.md) wskazuje ten dokument jako warunek Fazy 0;
- pierwsza wersja `packages/contracts` moze zostac utworzona bez ponownego zgadywania nazw pol i typow.

Definicja jest spelniona. Zgodnosc kontraktow sesji, rol, incydentow, zdjec i LLM chroni [zestaw integracyjny Fazy 0](phase-0-integration-tests.md).
