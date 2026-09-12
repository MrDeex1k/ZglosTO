# Plan migracji z Node.js i pnpm na Bun

Status: kierunek migracji zaakceptowany; implementacja i certyfikacja Bun przed nami.
Data przeglądu: 2026-09-12. Baza brancha migracji: `main` / `40cd505`.
Przegląd objął również lokalny projekt `docs-site` i wspólny build z frontendem,
zapisane następnie w stashu `WIP main before Bun migration branch 2026-09-12`.
Te zmiany nie należą do tego brancha; wskazania dotyczące docs-site opisują przyszłą
integrację po ich przywróceniu lub scaleniu. Bazowy workspace ma 6 wpisów; siódmy,
docs-site, pochodzi ze stasha.

## Cel i granice

Docelowo Bun zarządza zależnościami całego monorepo i uruchamia backend, media worker,
authorization oraz LLM gateway. Zmianę menedżera pakietów i zmianę runtime odbieramy
osobno, żeby odróżnić regresje grafu zależności i pakowania od różnic wykonania JS.

Frontend i dokumentacja pozostają statycznymi plikami serwowanymi przez nginx.
Bun zastępuje tam instalację zależności i, po weryfikacji, runtime buildów.
React Native zachowuje runtime mobilny; Bun nie zastępuje silnika aplikacji na telefonie.
PostgreSQL, PgBouncer, RabbitMQ, Redis, storage i silnik modeli pozostają poza zakresem.

Całkowite usunięcie Node z toolchainu Mobile nie jest obecnie kryterium odbioru.
Expo dokumentuje wymóg Node LTS dla pobierania szablonów przy create/prebuild.
To będzie jawny wyjątek narzędziowy z przypiętą, sprawdzoną wersją.
[Expo: Using Bun](https://docs.expo.dev/guides/using-bun/).

Zachowujemy TypeScript, Turbo, Vitest, frameworki HTTP i drivery. Każde narzędzie
wymaga osobnego potwierdzenia działania pod Bun. Nie łączymy migracji z aktualizacją
bibliotek ani zmianą całego frameworka testowego.

### Zaakceptowane ustalenia dotyczące Mobile

Bun będzie jedynym menedżerem pakietów i domyślnym runtime narzędzi oraz usług,
również dla pracy z Mobile. Pozostawienie Node LTS jako zależności wybranych operacji
Expo jest zaakceptowane i nie blokuje migracji.

Expo wspiera instalowanie pakietów przez `bun install` i `bun expo install <pakiet>`
oraz wykonywanie skryptów, np. `bun run ios`. EAS wybiera Bun na podstawie `bun.lock`;
po przełączeniu usuwamy lockfile innych managerów. Wersję Bun można przypiąć polem
`bun` w profilu builda w `eas.json`. Konfigurację EAS dodać lub uzupełnić, jeśli będzie
używana do buildów klienta. Biblioteki wymagające lifecycle scripts uwzględnić w
`trustedDependencies`. Node LTS pozostaje wymagany dla create/prebuild korzystających
z `npm pack`. [Expo: Using Bun](https://docs.expo.dev/guides/using-bun/).

Obsługa Bun jako managera w EAS nie dowodzi, że każdy wewnętrzny proces builda
wykonuje się pod Bun. Potwierdzamy faktyczny runtime narzędzi, zachowując opisany
wyjątek Node. Na telefonie pozostaje silnik React Native. mTLS, OpenTelemetry i sharp
to próby zgodności do wykonania, a nie stwierdzone przeszkody uniemożliwiające migrację.

## Inwentaryzacja codebase

| Obszar          | Stan odczytany z repozytorium                                                                                                  | Zakres migracji                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Root            | [package.json](../package.json): Node `>=26.8.1`, pnpm `11.25.0`, Turbo `2.10.12`; [.node-version](../.node-version): `26.8.1` | Pin Bun, `packageManager`, engines i skrypty; wyjątek Node dla Mobile       |
| Workspace       | [pnpm-workspace.yaml](../pnpm-workspace.yaml): 7 wpisów, w tym `packages/*`; lockfile `9.0`                                    | Workspaces/reguły w package.json i bunfig.toml; jeden bun.lock              |
| Backend         | [manifest](../backend/package.json): NestJS `12.0.1`, Express, pg, AWS SDK S3                                                  | Bun uruchamia `dist/nest/main.js`; sprawdzić DI, middleware, I/O i shutdown |
| Media worker    | Wspólny obraz backendu, `dist/nest/media-worker/main.js`, sharp `0.35.4`, AMQP                                                 | Natywne binaria, obróbka plików, ack/retry/DLQ i restart                    |
| Authorization   | [manifest](../authorization/package.json): Better Auth `1.7.2`, Hono, @hono/node-server, pg                                    | `dist/server.js`; sesje, cookies, origins, provisioning i mTLS              |
| LLM gateway     | [manifest](../llm_gateway/package.json): Hono i adapter Node                                                                   | `dist/src/server.js`; mTLS, HMAC/replay, timeout i concurrency              |
| Telemetria      | [register.ts](../packages/observability/src/register.ts): NodeSDK, auto-instrumentations-node, eksportery OTLP                 | Preload, rzeczywista instrumentacja, propagacja kontekstu i flush           |
| Pakiety wspólne | `packages/*` eksportują dist, używają workspace:*; transient store: redis `6.2.1`                                              | Kolejność buildów, kompletny graf produkcyjny, reconnect/TLS                |
| Web             | [manifest](../frontend/package.json): Vite `8.2.2`, React `19.2.8`, Vitest `4.1.11`                                            | Build, React Compiler, testy i warianty white-label                         |
| Mobile          | [manifest](../Mobile/package.json): Expo `57.0.18`, RN `0.86.3`, React `19.2.3`, TS `6.0.3`                                    | Metro, izolacja, hooki pre*, export i native builds obu platform            |
| Docs            | `docs-site/package.json` (w stashu): Astro `7.2.7`, Nimbus, Pagefind, CanvasKit, skrypty .mjs i node:test                      | Sync, check, build, wyszukiwarka, OG, publikacja /docs/                     |
| Kontenery       | pnpm fetch/install offline/reinstall/deploy; binarka Node kopiowana do Alpine                                                  | Nowy staging zależności i runtime zgodny z ABI; healthchecki                |
| Operacje        | scripts/*, Compose i manifest workera w K8s wywołują node/pnpm                                                                 | Wywołania, kontrakty obrazów, walidatory i runbooki                         |

Te wersje są inwentaryzacją, nie deklaracją zgodności z Bun.
W `.github` nie znaleziono workflow CI; są szablony zgłoszeń i PR.
Obecny odbiór opiera się na skryptach repozytorium i release gates.

## Menedżer pakietów

### Lockfile i izolacja

Pierwszą konwersję wykonać w czystej kopii pełnego monorepo. Bun dokumentuje import
pnpm lockfile i workspace; nieudany import może przejść w rozwiązywanie od nowa.
Kontrolować logi, porównać wersje/integrity i nie akceptować niezamierzonych aktualizacji.
Kolejne instalacje: `bun install --frozen-lockfile`, z osobną kontrolą obecności
`bun.lock`. [Bun install](https://bun.sh/docs/pm/cli/install).

Punkt wyjścia to jawny `linker = "isolated"`, ograniczający przypadkowy dostęp do
niezadeklarowanych zależności.
[Bun: isolated installs](https://bun.sh/docs/pm/isolated-installs).

Sprawdzić osobno React web `19.2.8` i Mobile `19.2.3` oraz TypeScript `7.0.2`
w root/usługach i `6.0.3` w Mobile/docs. Odbiór wymaga właściwych wersji widocznych
z każdego workspace. Nie wymuszać jednej wersji React w całym repozytorium.
Jeżeli Metro wymaga innego układu, udokumentować błąd i rozwiązanie; nie maskować
brakujących zależności globalnym hoistingiem.

### Zachowanie polityki zależności

Obowiązuje [polityka zależności](dependency-policy.md). Zmiana managera ma zachować
kwarantannę, Socket Firewall i blokowanie advisory produkcyjnych.

| Reguła pnpm                                   | Docelowa implementacja lub wymagany dowód                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Dokładne wersje                               | Zachować piny i workspace:*; migracja nie aktualizuje bibliotek                                                                       |
| minimumReleaseAge: 1440                       | Bun używa sekund: minimumReleaseAge = 86400; sprawdzić piny i nowe resolution                                                         |
| Strict i odmowa przy braku czasu publikacji   | Test brakujących metadanych musi zakończyć się odmową; jeśli Bun przepuszcza, dodać walidator przed akceptacją lockfile               |
| allowBuilds                                   | Jawne trustedDependencies: kandydaci @nestjs/core, esbuild, protobufjs; @scarf/scarf nadal niedozwolony; osobno zbadać potrzeby sharp |
| injectWorkspacePackages i wymuszony reinstall | Usunąć po potwierdzeniu linków do gotowych dist wewnątrz obrazu                                                                       |
| resolvePeersFromWorkspaceRoot: false          | Sprawdzić rozwiązywanie peer dependencies z każdego workspace; sam linker nie dowodzi równoważności                                   |
| Socket Firewall                               | Potwierdzić obsługę Bun przez sfw 2.0.6; w razie braku przygotować równoważną integrację i test blokowania przed przełączeniem        |
| Audyt produkcyjny                             | Przepisać uruchamianie i parser scripts/check-release-dependency-risk.ts; błąd sieci, zły JSON i każde advisory mają blokować wydanie |

Próg wieku Bun dotyczy nowego rozwiązywania zależności; nie weryfikuje ponownie
całego istniejącego lockfile. Poniższy szkic wymaga uzupełnienia kontroli brakującego
czasu publikacji.
[Bun: minimum release age](https://bun.sh/docs/pm/cli/install#minimum-release-age).

```toml
[install]
linker = "isolated"
minimumReleaseAge = 86400
```

Jawne `trustedDependencies` zastępuje domyślną listę Bun. Sprawdzić faktycznie
wykonane lifecycle scripts na zimnej instalacji, root prepare/Husky i binaria natywne.
[Bun: lifecycle scripts](https://bun.sh/docs/pm/lifecycle).

Przenieść cztery overrides: `@babel/core`, `query-string>decode-uri-component`,
`xcode>uuid`, `xmlbuilder2>js-yaml`. Aktualne docs Bun opisują reguły z jednym
poziomem rodzica; wybrany pin musi je obsługiwać. Nie rozszerzać selektywnych reguł
na cały graf. Zweryfikować faktyczne wersje pod wskazanymi rodzicami.
[Bun: overrides](https://bun.sh/docs/pm/overrides).

`bun audit` ma własny interfejs. Nie zakładać zgodności JSON z polem `advisories`
aktualnego parsera pnpm. Przygotować fixtures: odpowiedź czysta, podatność, błędne dane;
sprawdzić zakres produkcyjny i workspace.
[Bun audit](https://bun.sh/docs/pm/cli/audit).

### Skrypty, Turbo i testy

Stosować `bun run build`, `bun run test`, `bun run check`: `bun test`
i `bun build` są poleceniami wbudowanymi. Samo `bun run` może uruchomić CLI przez
Node zgodnie z shebangiem; `--bun` wymusza Bun dla takiego CLI. Potwierdzić runtime
procesów potomnych. [Bun Runtime](https://bun.sh/docs/runtime).

Zachować graf `^build` w [turbo.json](../turbo.json). Nie przepisywać mechanicznie
selektorów pnpm `^...`/`...`, exec/deploy ani flag instalacji. Zweryfikować odpowiedniki
na wybranej wersji Bun. Sprawdzić invalidation cache po zmianie lockfile, miasta i docs.
Sprawdzić hooki Mobile prebuild/pretest/pretypecheck/preandroid/preios/predev/prestart,
które budują zależności przed właściwą komendą.

Vitest pozostaje runnerem aplikacji. W fazie managera może działać na Node;
w fazie runtime sprawdzić uruchomienie pod Bun i testy prawdziwych procesów Bun.
Zielony Vitest na Node nie certyfikuje runtime Bun.

`scripts/test-infrastructure.ts` i testy docs używają node:test. Bun dokumentuje
częściową zgodność oraz różnice CLI. Wybrać jawnie kompatybilny tryb bun test z listą
plików albo przenieść te testy do istniejącego Vitest. Porównać liczbę wykonanych
testów, hooki, skip i błędy.
[Bun: zgodność Node](https://bun.sh/docs/runtime/nodejs-compat).

## Runtime: próby zgodności

### NestJS i TypeScript

[backend/tsconfig.json](../backend/tsconfig.json) włącza experimentalDecorators
i emitDecoratorMetadata. Początkowo produkcja nadal wykonuje wynik tsc, z zachowaniem
ESM, rozszerzeń importów i eksportów dist. Nie zastępować kompilacji uruchamianiem .ts
bez testu DI i metadanych. Bun nie zastępuje sprawdzania typów przez TypeScript.
[Bun: TypeScript](https://bun.sh/docs/runtime/typescript).

Przykład docelowego startu do weryfikacji w katalogu backendu:

```sh
bun --preload @zglosto/observability/register dist/nest/main.js
```

Analogicznie worker: dist/nest/media-worker/main.js; authorization: dist/server.js;
gateway: dist/src/server.js. Dopiero po próbach dobrać watch dla developmentu.
Nie usuwać automatycznie node:*, @types/node ani NODE_ENV — opisują też API
i kontrakty bibliotek.

### mTLS i tożsamość usług — bramka krytyczna

[Authorization](../authorization/src/mtls-server.ts) i
[gateway](../llm_gateway/src/mtls-server.ts) używają node:https, TLSSocket,
getPeerCertificate().raw i X509Certificate.subjectAltName. Wymuszają TLS 1.3,
certyfikat klienta, dokładnie jedno URI SAN i kontrolę ścieżek per tożsamość.

Sprawdzić rzeczywisty handshake: poprawny klient, brak certyfikatu, obce CA,
wygasły certyfikat, zła tożsamość, kilka URI SAN, dozwolona i zabroniona ścieżka.
Objąć klientów mTLS backendu i healthchecki. Sam test app.fetch omija ten mechanizm.
Początkowo zachować adapter Hono; przejście na Bun.serve wymaga osobnego portu
tych samych zabezpieczeń.

### Telemetria — bramka krytyczna

Preload musi poprzedzać instrumentowane importy. Sprawdzić pełny trace HTTP →
authorization/SQL/LLM, metryki i logi w Collectorze, propagację kontekstu przy
współbieżności oraz flush po SIGTERM. Testować profile disabled/local/external
i niedostępny Collector. Jeśli auto-instrumentacja NodeSDK nie działa pod Bun,
uzupełnić ją jawną instrumentacją lub kompatybilnym rozwiązaniem przed rolloutem.
Brak błędu startowego nie dowodzi działającej telemetrii.

### I/O, native i shutdown

| Próba               | Dowód przed rolloutem                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| pg + PgBouncer      | TLS, transakcje, atomowy provisioning, limit połączeń, timeout i reconnect po restarcie DB  |
| Redis               | Disabled/local/external, TLS, limity rozproszone, awaria i odzyskanie połączenia            |
| S3/RustFS + AWS SDK | Upload/download stream, presigned URL, duży plik, anulowanie i błąd storage                 |
| AMQP + media        | Ack/nack, retry/DLQ, redelivery po SIGTERM, brak utraty zadania                             |
| sharp               | Ładowanie binariów i rzeczywista obróbka na Linux amd64/arm64, duże i błędne wejścia        |
| Auth                | Cookies, sesja/logout, origins/CORS, limit body, hasła i równoległy provisioning            |
| Zgłoszenia          | Zachowanie wybranej służby przy awarii LLM, komunikaty akceptacji/112, timeout i anulowanie |
| Procesy             | SIGTERM w trakcie pracy, zamknięcie pul/sockets, flush OTLP, readiness i poprawny exit      |

## Docker i operacje

Obecne pnpm deploy tworzy samodzielne /prod/<service> po buildzie workspace.
Bun musi zapewnić tę samą własność. Kopia samego lokalnego node_modules nie wystarcza:
symlinki mogą wskazywać na wspólny store lub workspace poza obrazem.

Proponowany pierwszy wariant: pusty staging z zachowaną strukturą wybranych workspace,
manifestami i kompletnym grafem zależności; instalacja produkcyjna z zamrożonym lockfile,
następnie dołożenie odpowiednich dist. Sprawdzić ograniczony zestaw manifestów na wybranej
wersji Bun; pruning optymalizować po próbie pełnego grafu. W obrazie sprawdzić wszystkie
symlinki i importy bez dostępu do repo oraz sieci. Nie kopiować developerskiego
node_modules i nie zakładać, że ponowne install --production je oczyści.

Przypiąć wydanie Bun oraz digest obrazu. Build/runtime muszą mieć zgodne ABI, libc
i architekturę; nie kopiować niesprawdzonych binariów Bun/sharp z glibc do Alpine/musl.
Oficjalny przewodnik pokazuje wieloetapowe buildy oven/bun; wariant dobrać i sprawdzić
na obu architekturach. [Bun: Docker](https://bun.sh/guides/ecosystem/docker).

Zachować non-root, read-only filesystem, capabilities, secrets entrypoint, porty
i limity. Sprawdzić obecny seccomp i noexec tmpfs. Produkcja nie może pobierać
zależności przy starcie ani zawierać toolchainu developerskiego.
Frontend i docs kończą jako statyczne pliki w nginx.

Pliki do skoordynowanej zmiany:

- backend/Dockerfile, authorization/Dockerfile, llm_gateway/Dockerfile,
  frontend/Dockerfile, ich .dockerignore i tests/integration/Dockerfile.llm-stub;
- Compose: komendy workera, healthchecki, development i integration overrides;
  k8s/base/services/media-worker-deployment.yaml: args i exec probe;
- deploy/image-production-contract.json, deploy/image-audit-baseline.json,
  scripts/check-image-contract.ts: klasy node/node-shared, inspector wykonywany przez
  node, ścieżki audytu, zakazane artefakty i nowe pomiary; nie omijać walidacji
  przez nadanie nieobsługiwanej klasy bun;
- scripts/check-docker-workspaces.ts, scripts/check-production-source-build.ts,
  scripts/check-deployment-baseline.ts, scripts/test-infrastructure.ts i kontrakty;
- scripts/production-build.ts, scripts/production-build.sh, deploy.sh, release gates,
  smoke/integration, backup/restore i Mobile/scripts/*: wywołania Node/pnpm;
- scripts/check-release-dependency-risk.ts i scripts/verify-release-source-copy.ts:
  npm_execpath + process.execPath nie może zakładać, że manager jest plikiem JS;
  użyć jawnego kontraktu wywołania Bun;
- .husky/commit-msg, root/workspace manifests, Turbo, dokumentacja lokalna,
  dependency policy, container images i runbooki produkcyjne.

Historyczne raporty i manifest wydania 1.0.0 zachowują historyczne wersje.
Nowy manifest i dowody pomiarów powstają dopiero dla sprawdzonej migracji.

## Etapy wykonania i odbiór

| Etap          | Zakres                                                                        | Kryterium wyjścia                                                                                 |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0. Baseline   | Utrwalić commit, potrzebne lokalne zmiany, narzędzia i wyniki obecnych bramek | Odtwarzalny Node/pnpm; wcześniejsze błędy oddzielone od regresji                                  |
| 1. Próby Bun  | Wybrać pin; import lockfile, polityka, mTLS, OTEL, sharp w izolowanej kopii   | Wyniki wszystkich krytycznych prób; brak niejawnego osłabienia polityki                           |
| 2. Manager    | Workspaces/lockfile, wrappery, Turbo, staging Docker; usługi jeszcze na Node  | Zimna instalacja i drugi frozen install bez diff; lint/typecheck/test/build, Mobile/docs i obrazy |
| 3. Runtime    | Kolejno gateway, authorization, backend i worker; preload i healthchecki      | Próby I/O/mTLS/shutdown oraz integracyjne każdej usługi                                           |
| 4. Narzędzia  | Skrypty repo, build web/docs, testy i operacje pod Bun                        | Pozostałe wywołania Node ograniczone do jawnych wyjątków                                          |
| 5. Wdrożenie  | Compose, Kubernetes, K3s, amd64/arm64, white-label, limity i rollback         | Dowody runtime, wydajności, audytu i odtworzenia poprzedniej wersji                               |
| 6. Domknięcie | Usunięcie aktywnych konfiguracji pnpm i workaroundów; instrukcje              | Jeden manager i bun.lock; Node wyłącznie w opisanym toolchainie Mobile                            |

Pin Bun nie został jeszcze wybrany ani zainstalowany w ramach tego dokumentu.
Przed implementacją ustalić stabilną wersję, zapisać ją w packageManager, konfiguracji
developerskiej i buildów oraz obrazach. Testy dotyczą dokładnie tego pinu.

Minimalna macierz wykorzystuje istniejące skrypty po ich portowaniu:

- check: docs, source, dead code, lint/format, typecheck, testy, white-label i buildy;
- test:infrastructure, test:auth-provisioning, test:integration,
  test:redis-failure, test:production-compose-policy;
- test:deployment:compose, test:deployment:kubernetes, test:deployment:k3s,
  release:production:* i właściwa certyfikacja instancji klienta;
- Mobile: doctor, export Android/iOS, development build obu platform i regresja
  resident/service/admin; sam export JS nie dowodzi poprawnego native builda;
- docs: kontrola treści, build, /docs/, Pagefind, OG i regresja statycznego frontendu.

Wyłączyć lub wyczyścić cache zadań przed porównaniem, żeby wynik Node nie został
uznany za dowód Bun. Dla usług potwierdzić process.versions.bun i brak binarki Node
w obrazie; dla CLI zapisać runtime procesów potomnych.

Porównać Node/Bun na tym samym hoście, danych i profilu: zimny start, czas instalacji
i builda, RSS, CPU, p50/p95/p99, błędy i opóźnienie kolejki. Zachować limity z
deploy/production-source-build.json, kontraktów obrazów i profili klastrowych.
Proponowany dodatkowy próg: brak wzrostu p95 i RSS o więcej niż 10% w powtarzalnych
próbach oraz brak nowych timeoutów i utraconych zadań. To propozycja odbioru migracji,
nie istniejący ani zmierzony SLO produktu.

## Rollout i rollback

Najpierw środowisko odbiorowe, potem wdrożenie według profilu klienta.
Zmiana runtime nie wymaga migracji schematu DB; jeśli taka potrzeba powstanie,
wydzielić ją i zapewnić zgodność z poprzednią wersją usług.

Obecny [kontrakt source build](../deploy/production-source-build.json) zachowuje
aktywne wydanie do przejścia smoke kandydata. Później rollback polega na odbudowie
dokładnego tagu (exact-git-tag-rebuild), bez stałej retencji poprzedniego wydania.
Przed rolloutem sprawdzić odtworzenie ostatniego tagu Node/pnpm i dostępność jego
przypiętych zależności i obrazów bazowych. Nie zakładać obecności starego obrazu na hoście.

Wycofać kandydata przy błędach mTLS/sesji, utracie telemetrii, problemach kolejki,
niespełnieniu limitów lub niedziałającym shutdown. Przywrócić komplet poprzednich
artefaktów i konfigurację startu, wykonać readiness/smoke, sprawdzić kolejkę i logowanie.
Nie zamieniać samej binarki w obrazie zawierającym nowy graf zależności.

## Dowody i niewiadome

Dokument opiera się na przeglądzie manifestów, kodu startowego/mTLS/telemetrii,
Dockerfile, skryptów i dokumentacji producentów. Nie wykonywano instalacji Bun,
konwersji lockfile, testów aplikacji pod Bun ani budowania obrazów Bun.

Etap 1 musi rozstrzygnąć: pin Bun, NodeSDK/instrumentację, TLSSocket/certyfikaty,
pełny import bieżącego lockfile, odmowę przy brakującym czasie publikacji, integrację
SFW, samodzielne pakowanie workspace i native dependencies na obu architekturach.
Każdy wynik zapisać z wersją Bun, platformą, komendą, kodem wyjścia i logiem.
