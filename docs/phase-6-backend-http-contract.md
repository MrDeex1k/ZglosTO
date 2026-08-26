# Kontrakt HTTP backendu po cutoverze na NestJS

## Cel i źródła prawdy

Ten dokument zamraża powierzchnię HTTP aktywnego backendu NestJS po kroku 15 Fazy 6. Powstał
z baseline'u Express i chroni 20 zachowanych tras przed przypadkową zmianą ścieżek, metod,
autoryzacji, statusów i kształtów odpowiedzi. `@nestjs/platform-fastify` nie jest częścią
architektury docelowej ani późniejszego planu migracji.

Źródła prawdy:

- wykonywalny manifest: `backend/contracts/http-contract.ts`;
- kontrola spójności manifestu: `backend/contracts/http-contract.test.ts`;
- test wszystkich tras przez Nginx: `tests/integration/backend-http-contract.integration.ts`;
- dokument OpenAPI NestJS: generowany przez `backend/nest/application.ts` i wystawiony przez
  Nginx pod `/api/openapi.json`;
- szczegóły modeli: [baseline API i sesji](api-contracts-baseline.md) oraz
  `packages/contracts/src`.

Zmiana kontraktu wymaga świadomej aktualizacji kodu, manifestu, testów integracyjnych i tego
dokumentu. Samo dostosowanie kontrolera NestJS nie jest wystarczające.

## Routing

Nginx wystawia backend pod `/api/*` i usuwa prefiks `/api` przed przekazaniem żądania. Na
przykład publiczne `/api/admin/incydenty` dociera do backendu jako `/admin/incydenty`.

Aktywna inwentaryzacja obejmuje dokładnie:

- 17 tras domenowych i konfiguracyjnych;
- 3 trasy healthcheck;

Diagnostyczne `/api/protected` zostało usunięte podczas cutoveru, ponieważ nie było kontraktem
produktu i dublowało testy guardów. Ręczny runtime Express został całkowicie usunięty w kroku
15; jedynym adapterem HTTP jest Express zarządzany przez `@nestjs/platform-express`.

## Pełna macierz tras

| Metoda  | Publiczna ścieżka                              | Dostęp           | Sukces       | Błędy kontraktowe                        | Request / odpowiedź                                                |
| ------- | ---------------------------------------------- | ---------------- | ------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `GET`   | `/api/health/live`                             | publiczny        | `200`        | —                                        | brak / liveness backendu                                           |
| `GET`   | `/api/health`                                  | publiczny        | `200`        | `503`                                    | brak / readiness                                                   |
| `GET`   | `/api/health/ready`                            | publiczny        | `200`        | `503`                                    | brak / readiness                                                   |
| `GET`   | `/api/config/public`                           | publiczny        | `200`, `304` | —                                        | brak / `PublicCityConfigResponse`                                  |
| `GET`   | `/api/images/:id`                              | polityka zasobu  | `200`, `304` | `401`, `403`, `404`, `500`, `503`        | brak / prywatne bajty obrazu                                       |
| `GET`   | `/api/mieszkaniec/incydenty`                   | `mieszkaniec`    | `200`        | `401`, `403`, `500`, `503`               | brak / lista własnych incydentów                                   |
| `GET`   | `/api/mieszkaniec/incydenty/glowna`            | publiczny        | `200`        | `500`                                    | brak / maks. 15 naprawionych                                       |
| `POST`  | `/api/mieszkaniec/incydenty`                   | sesja opcjonalna | `201`        | `400`, `401`, `403`, `500`, `503`        | `CurrentCreateIncidentRequest` / utworzony incydent i klasyfikacja |
| `GET`   | `/api/sluzby/incydenty`                        | `sluzby`         | `200`        | `401`, `403`, `500`, `503`               | brak / incydenty własnej usługi                                    |
| `GET`   | `/api/sluzby/statystyki`                       | `sluzby`         | `200`        | `401`, `403`, `500`, `503`               | brak / statystyki własnej usługi                                   |
| `PATCH` | `/api/sluzby/incydenty/:id/status`             | `sluzby`         | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateIncidentStatusRequest` / incydent                           |
| `PATCH` | `/api/sluzby/incydenty/:id/sprawdzenie`        | `sluzby`         | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateIncidentVerificationRequest` / incydent                     |
| `PATCH` | `/api/sluzby/incydenty/:id/typ`                | `sluzby`         | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateIncidentServiceRequest` / incydent                          |
| `POST`  | `/api/sluzby/incydenty/:id/zdjecie_rozwiazane` | `sluzby`         | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UploadResolvedImageRequest` / incydent                            |
| `GET`   | `/api/admin/statystyki`                        | `admin`          | `200`        | `401`, `403`, `500`, `503`               | brak / statystyki globalne                                         |
| `GET`   | `/api/admin/incydenty`                         | `admin`          | `200`        | `401`, `403`, `500`, `503`               | brak / wszystkie incydenty                                         |
| `PATCH` | `/api/admin/incydenty/:id/sprawdzenie`         | `admin`          | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateIncidentVerificationRequest` / incydent                     |
| `PATCH` | `/api/admin/incydenty/:id/typ`                 | `admin`          | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateIncidentServiceRequest` / incydent                          |
| `PATCH` | `/api/admin/incydenty/:id/status`              | `admin`          | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateIncidentStatusRequest` / incydent                           |
| `PATCH` | `/api/admin/uzytkownicy/service-key`           | `admin`          | `200`        | `400`, `401`, `403`, `404`, `500`, `503` | `UpdateUserPermissionsRequest` / zmienione uprawnienia             |

`500` oznacza nieoczekiwany błąd zależności lub implementacji. NestJS ma zachować status i
bezpieczny JSON błędu, ale nie musi zachowywać tekstu logu serwerowego.

## Kontrakt autoryzacji

- `publiczny`: brak sesji jest dozwolony;
- `sesja opcjonalna`: brak cookie jest dozwolony, ale przesłana nieważna sesja zwraca `401`,
  a niedostępne Authorization `503`;
- `mieszkaniec`, `sluzby`, `admin`: brak lub nieważna sesja zwraca `401`, zła rola `403`, a
  niedostępne Authorization `503`;
- `polityka zasobu`: publiczne jest wyłącznie zdjęcie rozwiązania naprawionego incydentu;
  właściciel, przypisana służba i admin mają dostęp do właściwych prywatnych zdjęć;
- służba modyfikuje wyłącznie incydenty własnego `serviceKey`; obcy albo nieistniejący
  incydent zwraca to samo `404`.

Backend przekazuje cookie do Authorization przez mTLS. NestJS nie może lokalnie dekodować ani
uznawać sesji Better Auth bez odpowiedzi Authorization.

Wdrożony most NestJS jest bezpieczny domyślnie: brak metadanych oznacza wymaganą sesję,
`@PublicEndpoint()` jawnie wyłącza weryfikację, a `@OptionalSession()` zezwala na anonimowe
żądanie wyłącznie wtedy, gdy nie przesłano cookie Better Auth. Jeśli cookie zostało przesłane,
sesja opcjonalna także musi zostać poprawnie zweryfikowana. Pełny nagłówek `Cookie` oraz
`X-Correlation-Id` są przekazywane do Authorization. `serviceKey` jest akceptowany wyłącznie
dla roli `sluzby` i pobierany z kontekstu zweryfikowanej sesji, nigdy z danych requestu.

Polityka zdjęć ma jeden algorytm używany przez NestJS: zdjęcie rozwiązania jest
publiczne dopiero dla zgłoszenia `resolved`; pozostałe obrazy wymagają admina, właściciela lub
służby o `serviceKey` równym przypisaniu zgłoszenia. Brak sesji daje `401`, a zalogowany
użytkownik spoza polityki `403`.

Wszystkie 15 tras domenowych ma kontroler NestJS. Requesty tworzenia i
mutacji są walidowane wspólnymi schematami Zod/Standard Schema, a kontrolery delegują do
framework-neutralnych use-case'ów. Od kroku 8 `IncidentDomainPort` ma rzeczywisty adapter
PostgreSQL/Object Storage, a `/images/:id` ma równoległy kontroler NestJS zachowujący politykę
dostępu, ETag, `304` i binarne body. Tymczasowy adapter fail-closed nie jest aktywnym
providerem. Test parytetu kontrolerów nadal może podmienić sam port kontrolowanym adapterem.

Od kroku 13 wszystkie 20 zachowywanych operacji ma opis OpenAPI generowany bez osobnych klas
DTO. Schematy requestów, odpowiedzi sukcesu oraz błędów pochodzą z `@zglosto/contracts`.
Test jednostkowy porównuje dokument z wykonywalnym manifestem i odrzuca brak statusu,
request body lub udokumentowanego błędu. Po kroku 14 test integracyjny sprawdza aktywny NestJS
przez publiczny Nginx na rzeczywistej bazie i parsuje każdą odpowiedź błędu przez
`StructuredApiErrorResponseSchema`. Surowy dokument jest dostępny pod `/api/openapi.json`;
interfejs Swagger UI pozostaje wyłączony.

## Istotne odpowiedzi i nagłówki

- listy zwracają tablice bez opakowania;
- mutacje zwracają `{ success: true, incydent }`, a utworzenie dodatkowo `classification`;
- brak obrazu w danych incydentu jest reprezentowany przez `null`, nie przez pominięte pole;
- `/config/public` zwraca silny `ETag`, `Cache-Control: public, max-age=60, must-revalidate`
  oraz puste `304` dla zgodnego `If-None-Match`;
- obraz zwraca `Content-Type`, `Content-Length`, `ETag` i zależny od widoczności
  `Cache-Control`; zgodny `If-None-Match` daje puste `304`;
- readiness zwraca `200` wyłącznie przy dostępnych PostgreSQL i Object Storage oraz poprawnej
  konfiguracji White-Label; w przeciwnym razie zwraca `503`;
- `BackendLivenessResponseSchema`, `BackendReadinessResponseSchema` i schematy obu wariantów
  readiness są współdzielonymi, ścisłymi kontraktami Zod; wariant `503` nie zawiera configu i
  wymaga co najmniej jednej zależności ze stanem `down`;
- błędy aplikacyjne pozostają odpowiedziami JSON z polem `error`; komunikaty autoryzacyjne
  zachowują także pole `message`.

Podczas przejścia na NestJS pole `error` pozostaje dla zgodności. Docelowa odpowiedź błędu
dodaje `errorCode`, `message` i `correlationId`, a ten sam correlation ID znajduje się w
nagłówku `X-Correlation-Id`. Klient podejmuje decyzje wyłącznie na podstawie stabilnego
`errorCode`; tekst `error`/`message` może zostać przetłumaczony i nie jest identyfikatorem
logiki. Błąd 5xx nie ujawnia nazwy wyjątku, stack trace ani szczegółów zależności. To jest
addytywne rozszerzenie zamrożonego kontraktu, nie zgoda na zmianę istniejących statusów.

## Bramka kontraktu po usunięciu legacy runtime'u

1. Test integracyjny chroni unikalny manifest tras oraz wykonuje anonimowy probe każdej
   operacji przez rzeczywisty prefiks Nginx `/api`. Chroni routing, metodę i pierwszą
   granicę autoryzacji/walidacji.
2. Istniejący zestaw Fazy 0 chroni scenariusze biznesowe, treść odpowiedzi, role, izolację
   służb, zdjęcia, White-Label, lokalizację i warianty LLM.
3. Izolowany Compose uruchamia wyłącznie aktywny NestJS, sprawdza graceful shutdown kodem `0`,
   ponowny start, `404` dla `/api/protected` oraz dostępność `/api/openapi.json`.
4. Wygenerowany OpenAPI zawiera dokładnie wszystkie operacje i kontraktowe statusy oraz nie
   zawiera `/protected`.

Krok 15 Fazy 6 jest ukończony, gdy kontrola statyczna, test wszystkich 20 tras, OpenAPI,
graceful shutdown, audyt zależności, build obrazu i pełny zestaw integracyjny przechodzą bez
ręcznego runtime'u Express.
