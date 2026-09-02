# Plan Fazy 6: backend NestJS przygotowany na NestJS 12

## Stan i zasada wersjonowania

Kroki 1-15 Fazy 6 są ukończone: zamrożono 21 tras przejściowego backendu Express, z których
20 należy zachować podczas migracji, bramka zgodności potwierdziła NestJS 12 prerelease,
docelowy szkielet modułowy ma jawny i testowany graf zależności, a wspólna warstwa platformowa
zapewnia walidację, błędy, korelację, logowanie i shutdown. NestJS obsługuje już health oraz
publiczną konfigurację miasta, most mTLS do Authorization, sesję opcjonalną, guardy ról i
politykę dostępu do zdjęć, wszystkie 15 tras domenowych w cienkich kontrolerach i
framework-neutralnych use-case'ach oraz rzeczywiste adaptery PostgreSQL/Object Storage i
media HTTP. RabbitMQ 4.3.3 działa jako trwały broker AMQPS/TLS 1.3, a publisher NestJS
publikuje atomowy outbox z confirms. Aktywny runtime Compose/Nginx został przełączony na NestJS.
Osobny `media_worker` działa jako NestJS standalone bez publicznego HTTP, konsumuje kolejkę
mediów i zapisuje zwalidowane WebP w Object Storage. Backend korzysta wyłącznie z
provider-neutralnego `llm_gateway`; po Fazie 7 adapter wywołuje opcjonalny Docker Model
Runner, a domyślnie zwraca kontrolowany fallback. OpenAPI i pełna bramka parytetu przeszły
przed przełączeniem, a ręczny runtime Express został usunięty. Faza 6 jest zakończona po
15 krokach. Bramka publicznego wydania zależna od stabilnego NestJS 12 została wykonana
2026-09-02 w [Fazie 13](release.md#faza-13-bramka-wspólnego-baselineu-źródłowego--stabilne-nestjs-12).

Od 2026-09-02 backend używa oficjalnej stabilnej linii NestJS `12.0.1`. Historyczna bramka
z 2026-07-20 była wykonana na `12.0.0-alpha.5`; poniższa macierz prerelease pozostaje zapisem
tamtego etapu, a nie bieżącym stanem zależności.

Podczas migracji obowiązywały następujące zasady:

- podczas Fazy 6 można użyć NestJS 12 prerelease, ponieważ aplikacja nie jest wdrażana
  produkcyjnie;
- przed instalacją wybieramy najnowszy spójny zestaw pakietów NestJS dostępny w npm od co
  najmniej 48 godzin i przypinamy wszystkie wersje dokładnie;
- jeżeli bramka zgodności NestJS 12 przejdzie, rozwijamy nowy backend bezpośrednio na tej
  linii;
- jeżeli bramka ujawni błąd blokujący TypeScript 7/TSGO, ESM, Express, Vitest, Zod albo
  OpenAPI, czasowo używamy stabilnego NestJS 11 i utrzymujemy cienkie adaptery zgodności;
- przed publicznym wydaniem produktu obowiązkowo przechodzimy na stabilne NestJS 12 i
  ponawiamy pełną bramkę kontraktową oraz integracyjną;
- adapterem HTTP pozostaje `@nestjs/platform-express`; NestJS 12 nie otwiera ponownie decyzji
  o Fastify.

## Zmiany NestJS 12 istotne dla projektu

Stabilne wydanie potwierdziło następujące zmiany istotne dla projektu:

- natywne ESM w pakietach core;
- Vitest i OxLint w nowych projektach ESM;
- Standard Schema jako wspólna granica walidacji i serializacji;
- graceful shutdown dla adaptera Express;
- jawna polityka konfliktów tras i routing według specyficzności;
- deterministyczna kolejność lifecycle hooks zgodna z hierarchią modułów;
- bogatsze błędy HTTP, w tym stabilny `errorCode`, oraz logowanie strukturalne;
- globalne hooki dla transportów microservices, przydatne dla RabbitMQ.

Źródłem wiążącym po migracji jest [oficjalna dokumentacja NestJS](https://docs.nestjs.com/).
Względem alpha usunięto wyjątki peer dependency oraz wymuszenia `multer` i `js-yaml`, a
bootstrap korzysta z finalnych opcji `routeConflictPolicy` i `routeResolutionStrategy`.
Zachowano adapter Express, ESM/NodeNext, natywny Standard Schema i dotychczasową politykę
graceful shutdown; nie było potrzeby wprowadzania adapterów zgodności.

## Kroki realizacji

1. **Wdrożone 2026-07-18 — zamrożenie kontraktu HTTP.** Utrzymywać typowany manifest,
   kontrolę deklaracji Express i probe wszystkich tras przez Nginx. Zachować 20 tras; usunąć
   wyłącznie diagnostyczne `/protected` podczas cutoveru.

2. **Wdrożone 2026-07-20 — bramka NestJS 12 i równoległy szkielet aplikacji.**

   - sprawdzić daty publikacji i peer dependencies całej macierzy `@nestjs/*`;
   - przetestować Node 26, TypeScript 7/TSGO, `module` i `moduleResolution: NodeNext`, legacy
     decorator metadata wymagane przez NestJS oraz produkcyjny build ESM;
   - uruchomić `@nestjs/platform-express`, DI i bootstrap w Vitest;
   - sprawdzić Zod 4 jako Standard Schema, generowanie OpenAPI przez kompatybilną wersję
     `@nestjs/swagger` i brak potrzeby dublowania schematów w `class-validator`;
   - sprawdzić `SIGTERM`, `app.enableShutdownHooks()` i poprawne zamknięcie serwera;
   - zablokować zależność oraz import `@nestjs/platform-fastify`;
   - pozostawić dotychczasowy `backend/index.ts` aktywnym runtime'em Compose aż do osiągnięcia
     parytetu; nowy bootstrap NestJS działa równolegle i nie przejmuje jeszcze ruchu.

   Bramka zakończyła się wynikiem pozytywnym bez uruchamiania fallbacku NestJS 11. Wybrana
   macierz:

   | Element                    | Wersja           |
   | -------------------------- | ---------------- |
   | Node.js                    | `26.5.0`         |
   | TypeScript/TSGO            | `7.0.2`          |
   | `@nestjs/common`           | `12.0.0-alpha.5` |
   | `@nestjs/core`             | `12.0.0-alpha.5` |
   | `@nestjs/platform-express` | `12.0.0-alpha.5` |
   | `@nestjs/testing`          | `12.0.0-alpha.5` |
   | `@nestjs/swagger`          | `12.0.0-alpha.2` |
   | Express                    | `5.2.1`          |
   | Zod                        | `4.4.3`          |
   | Vitest                     | `4.1.10`         |
   | `reflect-metadata`         | `0.2.2`          |
   | RxJS                       | `7.8.2`          |

   Kod w `backend/nest` potwierdza DI, jawny `ExpressAdapter`, ESM/NodeNext, natywny
   `StandardSchemaValidationPipe` z Zod 4, OpenAPI generowane ze Standard Schema i obsługę
   shutdown hooks. Vitest wykonuje prawdziwe żądania HTTP, a dodatkowy test procesu uruchamia
   skompilowane ESM i kończy je przez `SIGTERM`. `@nestjs/platform-fastify` nie jest
   zależnością. Pełne `pnpm check` oraz build obrazu `zglosto-backend` przechodzą.
   Dotychczasowy `backend/index.ts` pozostaje jedynym runtime'em Compose.

   Metadane peer dependencies alphy nadal wskazują częściowo linię `^11`, mimo że
   `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` i `@nestjs/testing` pochodzą
   z tej samej, przetestowanej wersji `12.0.0-alpha.5`. PNPM dopuszcza wyłącznie te trzy
   dokładne wersje jako świadomy wyjątek `peerDependencyRules.allowedVersions`; nie jest to
   ogólne wyciszenie peer dependencies. Wyjątek należy usunąć przy migracji na stabilne
   NestJS 12, a aktualizacja każdego prerelease wymaga ponowienia całej bramki. PNPM jawnie
   zezwala wyłącznie na skrypt instalacyjny `@nestjs/core`, a blokuje telemetryczny
   `@scarf/scarf`.

3. **Wdrożone 2026-07-20 — szkielet modułowy.** `AppModule` składa wszystkie planowane
   moduły: `IncidentsModule`, `ResidentsModule`, `ServicesModule`, `AdminModule`,
   `AuthBridgeModule`, `StorageModule`, `MediaModule`, `JobsModule`, `DatabaseModule`,
   `WhiteLabelModule` i `LlmGatewayModule`.

   Graf zależności jest jednokierunkowy:

   - `Database`, `WhiteLabel`, `AuthBridge`, `Storage` i `LlmGateway` są liśćmi;
   - `Jobs` zależy od `Database`;
   - `Media` zależy od `Database`, `Jobs` i `Storage`;
   - `Incidents` zależy od `Database`, `Jobs`, `LlmGateway`, `Media` i `WhiteLabel`;
   - `Residents` oraz `Services` zależą od `AuthBridge` i `Incidents`;
   - `Admin` zależy od `AuthBridge`, `Incidents` i `WhiteLabel`.

   Test `module-topology.test.ts` odczytuje rzeczywiste metadata dekoratorów `@Module`,
   porównuje dokładny zestaw modułów i importów, wykrywa cykle oraz nieznane importy, w tym
   próbę użycia `forwardRef()`, a następnie kompiluje cały `AppModule` przez Nest DI. Pełne
   `pnpm check`, 45 testów backendu i build obrazu `zglosto-backend` przechodzą. Moduły nie
   zawierają jeszcze kontrolerów ani providerów domenowych; te elementy powstaną w kolejnych
   krokach bez przedwczesnego duplikowania starego runtime'u.

4. **Wdrożone 2026-07-20 — wspólna warstwa platformowa zgodna z NestJS 12.**

   - walidować ENV oraz request/response przez Zod; współdzielone kontrakty transportowe
     umieszczać w `packages/contracts`, a konfigurację zawierającą sekrety utrzymywać lokalnie
     w usłudze;
   - traktować Zod jako źródło prawdy i podłączać go przez mały adapter pipe/serializer, który
     można usunąć po udostępnieniu stabilnego natywnego Standard Schema;
   - zwracać stabilne kody `errorCode`; tłumaczone komunikaty nie są kontraktem klienta;
   - wprowadzić strukturalne logi, correlation ID oraz kontekst requestu i zadania;
   - przygotować idempotentne lifecycle hooks i graceful shutdown dla HTTP, PostgreSQL,
     RabbitMQ oraz outboxa;
   - po udostępnieniu stabilnych opcji NestJS 12 włączyć błąd dla konfliktów/shadowingu tras
     i routing według specyficzności.

   Techniczny `PlatformModule`, niebędący dwunastym modułem domenowym, dostarcza:

   - `PlatformEnvironmentSchema` i provider konfiguracji uruchomieniowej, który waliduje
     `BACKEND_PORT` oraz `NODE_ENV` przez Zod przed startem listenera;
   - lokalny `BackendEnvironmentSchema`, z którego inferowane są typy całej aktywnej
     konfiguracji backendu (Authorization mTLS, PostgreSQL TLS, LLM i S3); dotychczasowe
     precyzyjne reguły wejścia pozostają zachowane, a schemat zawierający nazwy sekretów nie
     jest eksportowany do pakietu dostępnego dla frontendu;
   - globalny `StandardSchemaValidationPipe` z kodem `VALIDATION_FAILED` oraz globalny
     `StandardSchemaSerializerInterceptor`, więc request i oznaczone response są walidowane
     przez te same schematy Zod/Standard Schema;
   - wspólne kontrakty `CorrelationIdSchema`, `ApiErrorCodeSchema` i
     `StructuredApiErrorResponseSchema` w `@zglosto/contracts`;
   - middleware, który akceptuje wyłącznie correlation ID w formacie UUID, w przeciwnym razie
     generuje nowy identyfikator, przechowuje go w `AsyncLocalStorage` i zwraca nagłówek
     `X-Correlation-Id`;
   - globalny filtr, który zachowuje pole `error` dla zgodności, dodaje stabilne `errorCode`,
     `message` i `correlationId`, nie ujawnia szczegółów błędów 5xx i wykorzystuje natywne
     `HttpExceptionOptions.errorCode` z NestJS 12;
   - `StructuredLogger` zapisujący pojedyncze rekordy JSON z czasem, poziomem, usługą,
     zdarzeniem, kontekstem i correlation ID; body żądania nie jest logowane;
   - `GracefulShutdownRegistry`, który przy `beforeApplicationShutdown` zamyka zasoby tylko
     raz, sekwencyjnie w odwrotnej kolejności rejestracji, próbuje domknąć wszystkie zasoby i
     raportuje zbiorczy błąd.

   PostgreSQL, RabbitMQ i outbox nie istnieją jeszcze jako providery NestJS, dlatego nie są
   sztucznie podłączone. Ich adaptery muszą rejestrować się w gotowym registry w krokach 8-9.
   Correlation ID będzie przekazywane przez `AuthBridge`, `LlmGateway` i envelope RabbitMQ w
   krokach implementujących te granice. Restrykcyjne opcje konfliktów/routingu NestJS 12
   pozostają w bramce stabilnego API z kroku 16.

   Testy sprawdzają poprawne i błędne ENV, zachowanie kontekstu logów, walidację requestu i
   response, własny `errorCode`, bezpieczne 500, propagację/generowanie correlation ID,
   idempotencję i kolejność shutdown oraz awarię pojedynczego zasobu. Pełne `pnpm check`,
   35 testów kontraktów, 50 testów backendu i build obrazu `zglosto-backend` przechodzą.

5. **Wdrożone 2026-07-20 — health i konfiguracja White-Label.** Przeniesiono liveness,
   readiness i `/config/public`, zachowując statusy, ETag, cache headers oraz zależności
   readiness od PostgreSQL, Object Storage i aktywnej konfiguracji miasta.

   - `WhiteLabelModule` ładuje dokładnie jeden plik wskazany przez `WHITE_LABEL_CONFIG` przed
     uruchomieniem aplikacji, eksportuje typowany `WhiteLabelConfigService` i nadal odrzuca
     brakujący, błędny albo zmieniony w procesie config;
   - `GET /config/public` używa tej samej publicznej projekcji i dokładnej reprezentacji JSON
     co Express, zwraca silny ETag SHA-256, `Cache-Control: public, max-age=60,
must-revalidate` oraz puste `304` dla exact, weak, list i wildcard `If-None-Match`;
   - techniczny `HealthModule` składa liściowe `DatabaseModule`, `StorageModule` i
     `WhiteLabelModule`, nie zmieniając kierunku zależności modułów domenowych;
   - `GET /health/live` zachowuje odpowiedź procesu, a `GET /health` i
     `GET /health/ready` zachowują identyczny kontrakt `200`/`503`, w tym stan aktywnego
     configu wyłącznie w odpowiedzi gotowej;
   - współdzielone, ścisłe schematy Zod opisują liveness, readiness success/failure i stan
     White-Label; odpowiedź `error` wymaga co najmniej jednej niedostępnej zależności;
   - rzeczywiste próby readiness wykonują krótkotrwałe `SELECT 1` przez PgBouncer/PostgreSQL
     z TLS oraz `HeadBucket` przez provider-neutralne API S3. Każda próba zamyka własny klient,
     więc krok nie tworzy przedwcześnie stałej puli ani klienta Object Storage z kroku 8;
   - wspólna logika projekcji, ETag i `If-None-Match` została wydzielona z routera Express,
     dzięki czemu oba runtime'y używają tego samego algorytmu podczas okresu parytetu.

   Testy HTTP sprawdzają oba aliasy readiness, liveness, bezpieczne `503`, correlation ID,
   publiczną odpowiedź config, nagłówki cache oraz puste `304`. Łącznie przechodzi 38 testów
   kontraktów i 55 testów backendu. Compose/Nginx nadal wskazuje dotychczasowy runtime Express.

6. **Wdrożone 2026-07-20 — most autoryzacji.** Przeniesiono klienta mTLS do Authorization,
   optional session, guardy `admin`, `sluzby`, `mieszkaniec`, izolację `serviceKey` i politykę
   dostępu do zdjęć. Backend nie dekoduje samodzielnie sesji Better Auth.

   - `AuthBridgeModule` dostarcza globalny, bezpieczny domyślnie `AuthorizationGuard`; trasa
     bez metadanych wymaga sesji, a publiczny lub opcjonalny dostęp musi zostać oznaczony
     odpowiednio `@PublicEndpoint()` albo `@OptionalSession()`;
   - `@RequireRoles()` egzekwuje role wyłącznie z odpowiedzi `GET /api/verify-session`;
     `AuthRequestContext` przechowuje zweryfikowaną sesję w `WeakMap` powiązanej z obiektem
     requestu i udostępnia typowane `requireUser()` oraz `requireServiceKey()`;
   - pełny nagłówek `Cookie` jest przekazywany bez zmian przez istniejący klient HTTPS z
     Service CA, certyfikatem workloadu backendu, TLS 1.3, weryfikacją nazwy serwera, timeoutem
     oraz limitem odpowiedzi 64 KiB. `X-Correlation-Id` jest propagowany do Authorization;
   - brak cookie na trasie wymagającej sesji oraz odrzucona/wygasła sesja dają `401`, zła rola
     daje `403`, a błąd transportu, TLS, odpowiedź 5xx/nieoczekiwany status lub nieprawidłowy
     kontrakt Authorization dają `503`;
   - mTLS credentials są materializowane leniwie przy pierwszej weryfikacji, a keep-alive
     agent jest niszczony przez lifecycle hook. Dzięki temu równoległy NestJS można kompilować
     i testować bez połączenia, ale żadna chroniona trasa nie działa bez poprawnego mTLS;
   - kontrakt sesji wymaga niepustego `serviceKey` wyłącznie dla roli `sluzby` i odrzuca jego
     wyciek do innych ról. Kontrolery służb będą pobierały klucz tylko przez
     `requireServiceKey()`, nigdy z parametrów klienta;
   - wspólna `IncidentImageAccessPolicy` zachowuje obecną macierz: publiczne jest wyłącznie
     zdjęcie rozwiązania dla naprawionego zgłoszenia; prywatne zdjęcia widzi admin, właściciel
     albo służba o dokładnie zgodnym `serviceKey`. Ten sam kod działa już w routerze Express i
     zostanie użyty przez NestJS przy przenoszeniu media HTTP w kroku 8.

   Obecne kontrolery health, White-Label i probe kompatybilności zostały jawnie oznaczone jako
   publiczne. Testy HTTP pokrywają secure-by-default, sesję opcjonalną, pełny Cookie,
   correlation ID, `401`/`403`/`503`, wszystkie role, izolację `serviceKey` i politykę zdjęć.
   Przechodzi 39 testów kontraktów i 64 testy backendu. Compose nadal używa Express.

7. **Wdrożone 2026-07-20 — przypadki użycia i kontrolery domenowe.** Przeniesiono pionami
   funkcjonalnymi mieszkańca, służby i admina. Kontrolery są cienkie, a logika przypadków
   użycia pozostaje niezależna od Express i dekoratorów NestJS.

   - `ResidentsController` obsługuje trzy trasy: listę profilu, publiczną listę naprawionych
     zgłoszeń oraz tworzenie zgłoszenia z sesją opcjonalną;
   - `ServicesController` obsługuje sześć tras: listę, statystyki, zmianę statusu, weryfikacji,
     przypisanej służby i przesłanie zdjęcia rozwiązania. Każda operacja pobiera izolowany
     `serviceKey` wyłącznie ze zweryfikowanego `AuthRequestContext`;
   - `AdminController` obsługuje sześć tras: globalne statystyki, listę, trzy mutacje zgłoszenia
     i zmianę roli/przypisania użytkownika;
   - `ResidentsUseCases`, `ServicesUseCases` i `AdminUseCases` są zwykłymi klasami TypeScript
     bez Express, request/response i dekoratorów NestJS. Moduły składają je jawnie przez
     `useFactory`;
   - reguły e-maila zgłaszającego, sesji mieszkańca, aktywnego `serviceKey`, bazowego formatu
     zdjęcia, not-found i odpowiedzi mutacji znajdują się w use-case'ach, a nie kontrolerach;
   - dodano wspólne schematy Zod/Standard Schema dla tworzenia zgłoszenia, parametrów ID,
     zmian statusu/weryfikacji/służby, zdjęcia rozwiązania i uprawnień użytkownika. Schemat
     uprawnień wiąże `serviceKey` wyłącznie z rolą `sluzby`;
   - semantyczny `IncidentDomainPort` opisuje operacje potrzebne przypadkom użycia bez SQL,
     `pg`, S3 ani LLM. Domyślny `PendingIncidentInfrastructureAdapter` nie zwraca fikcyjnych
     danych i kończy wywołanie kontrolowanym `503`; w kroku 8 zostanie zastąpiony rzeczywistym
     adapterem PostgreSQL/Storage, a granica LLM zostanie domknięta w kroku 12;
   - ogólny `ApplicationError` pozwala use-case'om zwracać stabilne `400`, `403`, `404` i `503`
     bez importowania wyjątków NestJS; globalny filtr mapuje je na wspólny kontrakt błędu.

   Test HTTP uruchamia pełny `AppModule`, podmienia wyłącznie port infrastruktury oraz
   Authorization i wywołuje wszystkie 15 ścieżek. Sprawdza statusy, delegację, Zod,
   normalizację wejścia, role, `serviceKey`, `404` i fail-closed `503`. Przechodzi 41 testów
   kontraktów i 68 testów backendu. Compose nadal używa kompletnego runtime'u Express.

8. **Wdrożone 2026-07-20 — Database, Storage i media HTTP.** Podłączono rzeczywisty adapter
   domenowy NestJS do PostgreSQL przez PgBouncer/TLS oraz do provider-neutralnego Object
   Storage. Tymczasowy adapter `503` nie jest już aktywnym providerem.

   - `DatabaseService` utrzymuje jedną, leniwie tworzoną pulę `pg` na proces, używa wyłącznie
     `DATABASE_URL`, weryfikuje Database CA i TLS 1.3 oraz ma jawne limity puli, idle timeout i
     connection timeout. Pula obsługuje zwykłe zapytania i transakcje oraz zamyka się przez
     `GracefulShutdownRegistry`;
   - `ObjectStorageService` utrzymuje jednego klienta zgodnego z S3, współdzielonego przez
     readiness, upload i odczyt. Kod domenowy nie zna RustFS; AWS S3, Cloudflare R2 albo inny
     zgodny provider wybierany jest wyłącznie przez `S3_*`. Klient i transport są zamykane
     podczas shutdownu;
   - `PostgresIncidentAdapter` implementuje wszystkie operacje `IncidentDomainPort`, zachowuje
     izolację `serviceKey`, przejmowanie anonimowych zgłoszeń, semantykę statusów, statystyki i
     zmianę uprawnień. Katalog usług White-Label jest synchronizowany jednokrotnie i bezpiecznie
     przy współbieżnych pierwszych żądaniach;
   - upload oryginału zapisuje binaria w Object Storage, a w jednej transakcji PostgreSQL
     aktualizuje `incident_images`, `media_processing_jobs` i `outbox_events`. Błąd transakcji
     usuwa nowy obiekt, a błąd uploadu zdjęcia podczas tworzenia usuwa niedokończone zgłoszenie;
   - `GET /images/:id` jest równoległym endpointem NestJS. Zachowuje politykę publicznego
     zdjęcia rozwiązania i prywatnych oryginałów, `401`/`403`/`404`, `ETag`, `304`, cache-control,
     typ i długość body. `304` nie pobiera obiektu z providera, a checksum obiektu jest
     porównywany z metadanymi bazy;
   - PostgreSQL oraz RabbitMQ przechowują wyłącznie metadane, identyfikatory i object keys —
     nigdy bajty ani base64. Odczyt automatycznie preferuje gotowy `processed_object_key`
     WebP, a przed zakończeniem zadania korzysta z oryginału;
   - na etapie kroku 8 classifier zachowywał przejściowe połączenie ze starym LLM service;
     krok 12 wymienił jego implementację na `llm_gateway` bez zmiany adaptera domenowego.

   Testy HTTP pokrywają publiczny i prywatny obraz, autoryzację, binarne body, cache oraz brak
   odczytu S3 dla `304`. Izolowana próba Compose potwierdziła readiness przez PgBouncer/TLS i
   RustFS, utworzenie zgłoszenia ze zdjęciem (`201`), rekordy `incident_images`, joba i outboxa
   oraz ochronę prywatnego oryginału (`401`). Pełny runtime Compose/Nginx nadal wskazuje
   Express aż do kroku 14.

9. **Wdrożone 2026-07-20 — RabbitMQ i outbox.** Uruchomiono przypięty RabbitMQ `4.3.3` z
   wyłączonym plaintext AMQP i listenerem AMQPS/TLS 1.3. Obie topologie V1 mają durable topic
   exchange, trwałe quorum queues, trzy kolejki retry TTL (`5 s`, `30 s`, `5 min`) i osobne
   DLQ. Wiadomości są persistent, a publisher używa confirms oraz wykrywa zwrócone wiadomości
   `mandatory`. Backend korzysta z natywnie typowanego `@cloudamqp/amqp-client` `4.0.0`;
   klient AMQP jest ukryty za projektowymi providerami publikacji i konsumentów.

   - publisher blokuje gotowe rekordy przez `FOR UPDATE SKIP LOCKED`, odzyskuje osierocone
     blokady i ustawia `published` oraz stan joba dopiero po confirm brokera;
   - niedostępny broker nie cofa transakcji HTTP: outbox przechodzi do `failed`, otrzymuje
     termin ponowienia i zostaje opublikowany po odzyskaniu połączenia;
   - wersjonowana envelope V1 zawiera `messageId`, `messageType`, `correlationId`,
     `causationId`, `traceparent`, `occurredAt`, wersję i zwalidowany payload;
   - provider konsumentów wymusza manual ACK, jawny `prefetch`, potwierdzoną publikację retry
     przed ACK oraz `nack(requeue=false)` do DLQ; krok 11 zarejestrował handler obrazu;
   - `consumed_messages` i `IdempotentMessageExecutor` wykonują zapis receipt oraz operację
     bazodanową w jednej transakcji, więc dostarczenie at-least-once nie powtarza skutku dla
     tej samej pary `consumerName + messageId`;
   - RabbitMQ ma prywatny wolumen, healthcheck TLS, nie uruchamia management i nie publikuje AMQP na
     hoście w zwykłym Compose. Integracja wystawia tymczasowo tylko port TLS i sprawdza dobrą
     CA, odrzucenie plaintext/obcej CA, confirms, quorum queues oraz odzyskanie outboxa po
     zatrzymaniu brokera. Testy jednostkowe i integracyjne utrwalają semantykę przetwarzania,
     retry/DLQ, idempotencji i odzyskania konsumenta.

10. **Wdrożone 2026-07-21 — osobny `media_worker`.** Powstał NestJS standalone application
    context przez `createApplicationContext`, bez adaptera HTTP, publicznego portu i Hono.
    Worker współdzieli `PlatformModule`, `DatabaseModule`, `JobsModule`, kontrakty i obraz
    builda z backendem, ale ma osobny proces, kontener, nazwę usługi w logach oraz limity
    `0.50 CPU`/`256 MiB`.

    - własny composition root nie importuje modułów domenowego HTTP, Authorization, LLM ani
      White-Label; od kroku 11 importuje wyłącznie neutralny moduł Object Storage;
    - gotowość wymaga rzeczywistego `SELECT 1` przez PgBouncer/TLS 1.3 oraz deklaracji
      topologii przez AMQPS/TLS 1.3 oraz dostępu do Object Storage; sonda plikowo-procesowa
      nie otwiera bocznego listenera;
    - utrata PostgreSQL, RabbitMQ lub Object Storage usuwa readiness, a cykliczna sonda
      samodzielnie odzyskuje stan po powrocie zależności;
    - `enableShutdownHooks()` i wspólny rejestr zamykają timer, usuwają readiness, a następnie
      zamykają kanały/połączenie RabbitMQ oraz pulę PostgreSQL;
    - Compose przekazuje workerowi tylko Database CA, Service CA, neutralne `S3_*` i niezbędne
      ENV. Worker nie otrzymuje sekretów Authorization ani `RUSTFS_*` i nie publikuje portu.

11. **Wdrożone 2026-07-21 — pipeline Sharp.** Worker pobiera oryginał przez neutralny adapter
    S3, sprawdza zgodność rozmiaru, checksum i MIME z kontraktem, rzeczywisty format dekodera,
    limit 5 MiB, 8192 px na wymiar i 32 MP oraz odrzuca animacje. Sharp normalizuje orientację,
    ogranicza dłuższy bok wyniku do 2000 px bez powiększania, konwertuje do sRGB/WebP
    quality 85 i domyślnie usuwa
    EXIF, ICC oraz XMP. Wynik ma deterministyczny key rewizji, własny checksum i metadane w
    PostgreSQL; po zatwierdzeniu wyniku oryginał jest usuwany, a cleanup ponawia błędy.

    - `sharp@0.35.3` jest przypięty dokładnie, ma wyłączony cache plików, ograniczoną pamięć
      cache i domyślną współbieżność `1`; kontener workera ma limit `512 MiB`;
    - konsument używa `prefetch=1`, manual ACK, retry 5 s/30 s/5 min oraz DLQ. Ponowna próba
      zwiększa `attempt`, a receipt i zmiana końcowego stanu są jedną transakcją;
    - nowsza rewizja i duplikat nie nadpisują wyniku, a zbędny zapis jest usuwany best-effort;
    - readiness obejmuje PostgreSQL, RabbitMQ i Object Storage. Klient konsumenta sam odtwarza
      subskrypcję po utracie kanału lub połączenia;
    - testy obejmują prawdziwe kodowanie, auto-orientację, usunięcie metadanych, limity,
      rozbieżność checksum/MIME/rozmiaru, retry, wyczerpanie prób, DLQ i pełny przepływ
      Object Storage -> RabbitMQ -> worker -> WebP -> PostgreSQL.

12. **Wdrożone 2026-07-21 — granica LLM; metoda zaktualizowana 2026-08-14.** Backend
    komunikuje się wyłącznie ze stabilnym `QUERY /classify-incident` w `llm_gateway` (Hono +
    Node 26 + TypeScript), zachowuje własny
    krańcowy timeout/fallback i nie zna endpointu runtime'u modelu. Gateway ma walidowany
    kontrakt, bezpieczne logi bez treści zgłoszenia, correlation ID i healthchecki. W Fazie 7
    przejściowy FastAPI został usunięty; pozostał `docker-model-runner` zgodny z OpenAI oraz
    domyślny `disabled`. Zmiana runtime'u nie zmienia kontraktu backendu. RabbitMQ pozostaje
    wyłącznie dla przyszłych asynchronicznych retry/enrichment.

13. **Wdrożone 2026-07-21 — OpenAPI i testy parytetu.** NestJS generuje dokument OpenAPI 3
    bez drugiego modelu DTO: requesty, odpowiedzi sukcesu i strukturalne błędy pochodzą ze
    wspólnych schematów Zod/Standard Schema w `@zglosto/contracts`. Surowy dokument jest
    dostępny w równoległym runtime pod `/openapi.json`, zawiera dokładnie 20 zachowywanych
    operacji i nie zawiera diagnostycznego `/protected`.

    Izolowany Compose uruchamia jednocześnie aktywny Express i `backend_nest`; wykonywalny
    manifest sprawdza 21 tras Express przez Nginx oraz 20 tras NestJS bezpośrednio na
    rzeczywistej bazie i zależnościach. Każdy błąd NestJS jest parsowany przez zamknięty
    kontrakt `errorCode`/`correlationId`. Bramka obejmuje ponadto lifecycle i graceful
    shutdown, Authorization mTLS, TLS PostgreSQL/PgBouncer, AMQPS, siedmiozadaniowy backlog,
    `prefetch=1`, zatrzymanie i ponowne uruchomienie workera, retry, końcowy DLQ,
    idempotentny receipt, niedostępność RabbitMQ oraz backup/restore. Pełne `pnpm check` i
    izolowany test integracyjny są bramką przed krokiem 14.

    NestJS 12 alpha serializuje tablice przez schemat pojedynczego elementu. Dekorator
    kontraktu rozdziela zatem schemat dokumentu całej tablicy od schematu serializacji
    elementu; oba nadal wskazują te same współdzielone kontrakty Zod. Należy ponownie
    zweryfikować to zachowanie przy aktualizacji prerelease i usunąć obejście, jeśli stabilne
    API zacznie walidować tablicę jako całość.

    Ponowna weryfikacja na stabilnym `12.0.1` potwierdziła, że interceptor nadal aplikuje
    przekazany schemat osobno do każdego elementu tablicy. Rozdzielenie schematu OpenAPI całej
    tablicy od schematu serializacji elementu pozostaje więc wymaganym użyciem finalnego API,
    a nie prerelease'owym adapterem zgodności.

14. **Wdrożone 2026-07-21 — kontrolowany cutover.** Aktywny `backend` w Compose i domyślne
    polecenie obrazu uruchamiają NestJS na niezmienionym porcie `3000`; Nginx nadal kieruje
    `/api/*` do tej samej nazwy usługi. Usunięto równoległy `backend_nest` i diagnostyczne
    `/protected` z wykonywalnego manifestu, który zawiera teraz dokładnie 20 tras.

    Pełny kontrakt NestJS, strukturalne błędy i `/api/openapi.json` są sprawdzane przez
    publiczny Nginx. `BACKEND_PORT` zastąpił przejściowe `BACKEND_NEST_PORT`, a kontener ma
    30-sekundowy budżet na shutdown. Integracja zatrzymuje proces przez `SIGTERM`, wymaga
    zakończenia kodem `0`, a testy lifecycle potwierdzają zamknięcie zasobów. Następnie
    przełącza tymczasowy override na stary runtime Express, po czym wraca na NestJS i
    potwierdza `404` dla `/api/protected`. Ten przejściowy mechanizm został następnie usunięty
    w kroku 15; w środowisku wdrożeniowym rollback oznacza wskazanie ostatniego niezmiennego
    obrazu, a nie utrzymywanie drugiego runtime'u w bieżącym artefakcie.

15. **Wdrożone 2026-07-21 — usunięcie ręcznego backendu Express.** Usunięto stary bootstrap
    `backend/index.ts`, `http.ts`, pięć routerów, middleware autoryzacji, ich testy i dokumenty,
    przejściowy parser requestów oraz override rollbacku. Manifest nie przechowuje już ścieżek
    do usuniętych źródeł Express i chroni bezpośrednio 20 tras NestJS.

    Usunięto bezpośrednie zależności `body-parser`, `cookie-parser`, `cors` oraz ich typy.
    Zachowano `@types/express` i `@nestjs/platform-express`; sam runtime Express jest
    dostarczany przechodnio wyłącznie przez oficjalny adapter NestJS i nie jest już bezpośrednią
    zależnością aplikacji. `database.ts` pozostał jako granica narzędzi operacyjnych Object
    Storage, a nie jako część runtime'u HTTP. Bramka obejmuje audyt
    zależności, `pnpm check`, build Compose, pełną integrację, graceful shutdown, trwałe `404`
    dla `/api/protected` i OpenAPI przez Nginx.

## Kryterium zakończenia Fazy 6

Faza 6 jest funkcjonalnie zakończona, gdy NestJS obsługuje 20 zachowywanych tras, osobny
`media_worker` przetwarza obrazy przez RabbitMQ i Sharp, backend korzysta wyłącznie z
`llm_gateway`, stary ręczny runtime Express został usunięty, a pełny zestaw testów przechodzi.
Stabilne NestJS 12 pozostaje osobną Fazą 13 i ostatnią bramką publicznego wydania, a nie
powodem do utrzymywania starego backendu ani blokowania Faz 7-12. Późniejsza Faza 14 rozwija
asynchroniczną kontrolę routingu przez LLM już na stabilnym fundamencie.
