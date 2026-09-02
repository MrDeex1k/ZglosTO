# Plan porządków przed wydaniem 1.0.0

## Cel i zasady

Celem jest usunięcie artefaktów migracji, nieużywanego API i lokalnych produktów
narzędzi bez naruszenia entrypointów operacyjnych, obrazów ani testów. Grupy porządków
mogą powstawać w osobnych commitach roboczej gałęzi. Jeśli właściciel zatwierdzi nową
historię, zostaną zastąpione jednym końcowym committem bazowym.

Nie należy usuwać pliku wyłącznie dlatego, że zgłasza go narzędzie do analizy
statycznej. Skrypty uruchamiane z shella, Dockerfile lub Compose nie tworzą importów,
które Knip potrafi automatycznie wykryć.

## Aktualny checkpoint — 2026-08-25

WEB, Mobile, usługi backendowe, pakiety współdzielone i profile wdrożeniowe tworzą jeden
kandydat źródłowy `1.0.0`. Mobile ma zamknięte Fazy 0–7 i status
`SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`: każdy licencjonowany klient buduje
własne binaria i uruchamia osobną, jednomiejską instancję systemu.

Przed publikacją pozostał jeden proces porządkowo-wydaniowy:

1. zamrozić zakres funkcjonalny `1.0.0` i nie dodawać nowych funkcji;
2. usunąć wyłącznie potwierdzone artefakty, martwy kod i historyczne duplikaty dokumentacji;
3. zsynchronizować README, changelog, roadmapy, instrukcje klienta i przykładowe ENV;
4. przejść pełną bramkę jakości, bezpieczeństwa, obrazów i izolowanego uruchomienia;
5. sprawdzić czystą kopię repozytorium bez lokalnych plików oraz danych demonstracyjnych;
6. przygotować finalny manifest plików pierwszego wydania;
7. dopiero po jawnej zgodzie właściciela przepisać historię do jednego commita zgodnego z
   Conventional Commits;
8. opublikować nową historię w tym samym repozytorium przez kontrolowany
   `force-with-lease`, a następnie utworzyć tag i GitHub Release.

Przepisanie historii nie jest zwykłym krokiem cleanupu. Przed operacją trzeba zachować
lokalną kopię starego tipa/tag bezpieczeństwa, zamknąć lub uprzedzić otwarte PR-y i
potwierdzić zasady ochrony gałęzi. Operacja wymaga osobnej zgody, ponieważ unieważnia stare
SHA, forki i odwołania do commitów.

## Stan bazowy z 2026-07-28

- Wszystkie bezpośrednie zależności NPM są aktualne.
- Lint, typecheck, 374 testy, build i dwa buildy white-label przechodzą.
- React Doctor nie zgłasza problemów w zmienionym kodzie.
- Pełny `pnpm check` blokują dwa zastane problemy:
  - formatowanie `frontend/src/components/LoginForm.tsx`;
  - niesemantyczne kolory statusu w
    `frontend/src/components/incident-status-styles.ts`.
- `pnpm peers check` zgłasza niespójne peer ranges pakietów NestJS 12 alpha.
- `pnpm audit --prod` zgłasza 3 podatności high i 2 moderate:
  - `multer@2.1.1` przez NestJS;
  - `js-yaml@4.1.1` przez `@nestjs/swagger`;
  - `brace-expansion@2.1.2` przez instrumentację OpenTelemetry.
- Knip nie znalazł nieużywanych zależności, ale wskazał 45 nieużywanych eksportów,
  7 eksportowanych typów i jeden duplikat eksportu.

## Etap 1 — higiena lokalnego workspace

1. Usunąć odtwarzalne, ignorowane produkty narzędzi:
   - zagnieżdżone `node_modules/`, szczególnie około 147 MB w `frontend/`;
   - wszystkie `dist/` i `*.tsbuildinfo`;
   - `.pnpm-store/`, `.playwright-cli/`, `.DS_Store`.
2. Rozstrzygnąć przeznaczenie `output/playwright/`:
   - jeżeli zrzuty są dowodami odbioru UI, przenieść wybrane pliki do wersjonowanego
     katalogu dokumentacji;
   - w przeciwnym razie usunąć katalog i dodać `output/` do `.gitignore`.
3. Usunąć lokalne, stare pliki środowiskowe takie jak `.env.stare` po potwierdzeniu,
   że ich wartości nie są już potrzebne. Nigdy nie przenosić ich do historii Git.
4. Usunąć pusty `.github/workflows/`, jeżeli nie będzie częścią konfiguracji CI.

## Etap 2 — pozostałości po migracjach

1. Przejrzeć 12 plików `frontend/.migration/*.md`.
   Po zakończeniu migracji Base UI:
   - zachować jeden dokument podsumowujący decyzje, jeśli ma wartość operacyjną;
   - pozostałe notatki usunąć.
2. Skrypty lokalnej certyfikacji Fazy 12 pozostają operacyjnymi entrypointami. Historyczny,
   niekompletny pakiet `phase-12-remote-handoff/` nie należy do wydania 1.0.0.
3. Skonsolidować dokumenty fazowe:
   - aktywne runbooki i kontrakty pozostawić w `docs/`;
   - dzienniki wdrożeń przenieść do jednego archiwum historii;
   - usunąć treści dublujące `README.md`, `docs/release.md` i aktualne runbooki.
4. Zweryfikować, czy usunięte stare implementacje Express, Vite SPA, Python LLM,
   PgAdmin i płaskie manifesty K8s nie są nadal wymieniane w dokumentacji.

## Etap 3 — nieużywane API i kod

1. Zacząć od najmniej ryzykownego API komponentów UI. Knip wskazuje nadmiarowe
   eksporty między innymi w:
   - `alert-dialog.tsx`;
   - `alert.tsx`;
   - `card.tsx`;
   - `dialog.tsx`;
   - `dropdown-menu.tsx`;
   - `select.tsx`.
2. Usuwać nieużywane eksporty partiami per komponent, po wyszukaniu dynamicznych
   użyć i przejściu React Doctor, testów oraz builda.
3. Zweryfikować i uprościć eksporty aplikacyjne:
   - nieużywane schematy środowiskowe backendu i gatewaya;
   - `loadIncidentImageRef`, `setupNestOpenApi`, `serviceCatalog`,
     `resolveService`, `authClient`;
   - nieużywane typy kontraktów i `AppLocals`.
4. Zostawić albo scalić tylko jedną nazwę eksportu w
   `frontend/src/utils/dateUtils.ts`: Knip wykrył duplikat
   `formatLocalizedDate`/`formatPolishDate`.
5. Nie usuwać plików zgłoszonych przez Knip jako „unused”, jeśli są entrypointami:
   - healthchecki Authorization i media workera;
   - CLI backupu, restore i audytu Object Storage;
   - skrypty fazy 12 i production build;
   - testy integracyjne uruchamiane z shella;
   - `tests/integration/llm-stub.ts`.
6. Dodać konfigurację Knip z jawnymi entrypointami shell/Docker. Dopiero ponowny
   czysty raport może być podstawą do usunięcia pozostałych plików.
7. Nie planować masowego usuwania komentarzy. Audyt nie znalazł zakomentowanego
   starego kodu; obecne komentarze głównie dokumentują celowe wyłączenia lintera.

## Etap 4 — manifesty i granice publikacji

1. Potwierdzić, czy `authorization` i `backend` mają być publikowane do NPM.
   Obecnie nie mają `private: true`, podczas gdy pozostałe usługi i pakiety
   workspace są prywatne.
2. Jeżeli to wyłącznie aplikacja wdrażana z obrazów, dodać `private: true` do obu
   usług, aby zapobiec przypadkowej publikacji.
3. Ujednolicić strategię wersji — wykonane: root, serwisy, prywatne pakiety i gotowa
   aplikacja `Mobile` mają wspólną wersję `1.0.0`.
4. Usunąć pola publikacyjne (`files`, `main`) tylko z pakietów, które na pewno nie
   będą pakowane ani używane w runtime obrazu.

## Etap 5 — zależności i bezpieczeństwo

1. Wykonane 2026-09-02: cały backend przeszedł na stabilną macierz NestJS `12.0.1`, a
   prerelease'owy wyjątek `peerDependencyRules.allowedVersions` został usunięty.
2. Preferowana naprawa:
   - przejść na spójną, wspieraną linię NestJS, która dostarcza
     `multer >=2.2.0` i `js-yaml >=4.3.0`;
   - albo zaczekać na zgodne wydanie NestJS 12, jeżeli alpha jest świadomym
     wymaganiem produktu.
3. Dla `brace-expansion` najpierw podnieść nadrzędny łańcuch
   OpenTelemetry → GCP detector → gaxios/rimraf/glob. Nie wymuszać globalnie
   `brace-expansion@5`, ponieważ `minimatch@9` oczekuje linii 2.x.
4. Dodano dokładne, parent-scoped overrides dla `multer@2.2.0` pod
   `@nestjs/platform-express` oraz `js-yaml@4.3.1` pod `@nestjs/swagger` i `xmlbuilder2`.
   Wersje usuwają znane podatności DoS bez globalnej zmiany innych linii zależności;
   pozostają objęte pełnymi testami i audytem wydaniowym.
5. Release gate: surowy `pnpm audit --prod` oraz `pnpm audit:release`. Ten drugi dopuszcza
   wyłącznie dokładne, wygasające wyjątki z kontrolami kompensującymi; każde inne
   high/moderate blokuje wydanie. `pnpm peers check` musi być czysty lub świadomie
   udokumentowany.

## Etap 6 — obrazy Docker

1. Redis został podniesiony do `8.10.1-alpine3.23`.
2. Tempo zostało podniesione z `2.10.8` do `3.0.3`; przed wydaniem wymaga
   testu startu i odczytu istniejących danych.
3. Pozostałe sprawdzone obrazy są aktualne w przypiętych liniach:
   Node 26.8.1, Alpine 3.24.1, Nginx 1.31.4, PostgreSQL 18.6,
   PgBouncer 1.25.2-p0, RabbitMQ 4.3.5, RustFS 1.0.0-rc.5,
   OpenTelemetry Collector 0.159.0, Prometheus 3.14.0, Loki 3.7.7,
   Alertmanager 0.34.0 i Grafana 13.2.1.
4. Po zmianie zbudować wszystkie obrazy, uruchomić target size contract oraz
   smoke/integration. Trivy i generowanie SBOM zostały usunięte z zakresu wydania decyzją
   właściciela z 2026-08-26. Lokalny audyt targetów rozmiaru
   wymaga wcześniejszego zbudowania obrazów `zglosto-phase0-*`.

## Kolejność commitów

1. `chore: remove local and generated artifacts`
2. `docs: consolidate migration and phase history`
3. `refactor: remove verified unused exports`
4. `chore: define package publication boundaries`
5. `fix: resolve dependency audit and peer conflicts`
6. `chore: update and certify container images`
7. `release: certify 1.0.0`

## Końcowy release gate

1. Czysty `git status` poza świadomie wybranymi plikami wydania.
2. `pnpm check`.
3. React Doctor bez nowych diagnostyk.
4. Knip bez niewyjaśnionych unused files/dependencies/exports.
5. `pnpm peers check`.
6. `pnpm audit --prod` i zawężona polityka `pnpm audit:release`.
7. Build wszystkich obrazów i image target contract.
8. Compose smoke, pełne testy integracyjne oraz testy profili produkcyjnych.
9. Przegląd sekretów, danych demo i plików `.env`; Trivy oraz SBOM nie są wymagane.
10. Tag `1.0.0` dopiero po zachowaniu wyników certyfikacji.
