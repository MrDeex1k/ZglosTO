# Plan modernizacji ZglosTO

> **Status dokumentu:** skonsolidowany rejestr historyczno-planistyczny. Fazy 0–11 są
> zakończone; bieżący stan opisują [indeks dokumentacji](README.md),
> [audyt architektury](current-architecture-audit.md) i
> [roadmapa](roadmap-overview.md). Faza 12 jest certyfikacją per klient, nie warunkiem
> źródłowego wydania `1.0.0`.

## Cel

Plan zakłada uporządkowaną modernizację systemu ZglosTO do aplikacji White-Label dla miast.
Obecny system ma TanStack Start w trybie SPA, backend NestJS z `@nestjs/platform-express`,
osobny serwis auth Hono + Better Auth, PostgreSQL z PgBouncerem, provider-neutralny Object
Storage, RabbitMQ, `media_worker`, `llm_gateway`, opcjonalny Docker Model Runner, Docker
Compose, Kubernetes i Nginx. Fazy 0-11 są zakończone. Faza 11 dostarczyła
audyt, produkcyjny kontrakt, docelowe obrazy runtime, lokalny build ze źródeł z
Trivy/SBOM, modułowy produkcyjny Compose, hardening hosta, automatyzację wydania oraz
lokalne bramki. Faza 9 wdrożyła
kroki 1-11: baseline profili, produkcyjnego kandydata Compose, rozdzielone profile
Kubernetes/K3s, konfigurację, sekrety, usługi stanowe, komplet workloadów oraz
TLS/mTLS z izolacją sieciową, fundament obserwowalności, autoskalowanie workera i
scale-to-zero gatewaya oraz automatyczne testy wszystkich trzech profili. Faza 10 dodała
Redis, zawsze aktywny lokalny rate limiting, współdzielony cache publicznej listy,
kontrolowaną degradację i runbook operatorski. Faza 12 certyfikuje osobno każdą rzeczywistą
instancję klienta i nie blokuje publikacji samych źródeł. Faza 9 ustanowiła wspólny kontrakt trzech
produkcyjnych profili wdrożeniowych: Docker Compose,
Kubernetes oraz K3s. Profile mają identyczne funkcje aplikacyjne i bezpieczeństwo danych,
ale jawnie różne gwarancje HA, autoskalowania i rolloutów.

Najwazniejsze zalozenie: najpierw stabilizujemy kontrakty i dane, potem migrujemy runtime'y oraz frameworki, a dopiero pozniej dokladamy cache, serverless scaling, optymalizacje obrazow i klientow dodatkowych. RabbitMQ i kontrakty kolejek wprowadzamy razem z NestJS oraz workerem, nie jako osobna przedwczesna warstwe. Nie laczymy migracji auth, backendu, storage, LLM i deploymentu w jednym kroku.

## Zrodla prawdy

| Zakres                                                    | Dokument                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Aktualny stan repozytorium i wykryte ryzyka               | [Audyt obecnej architektury](current-architecture-audit.md)             |
| Biezace kontrakty HTTP, sesji, rol, statusow, zdjec i LLM | [Baseline kontraktow API](api-contracts-baseline.md)                    |
| Docelowy kierunek architektury White-Label                | [Docelowa architektura White-Label](target-white-label-architecture.md) |
| Kolejnosc faz, ich zakres i kryteria ukonczenia           | Ten dokument                                                            |
| Skrócony status i znaczenie wszystkich faz                | [Przegląd roadmapy](roadmap-overview.md)                                |
| Docelowe wymagania trzech profili wdrożeniowych           | [Modernizacja wdrożeń](k8s-k3s-modernization.md)                        |
| Kolejność wykonawcza i bramki Fazy 9                      | [Plan wykonawczy Fazy 9](phase-9-execution-plan.md)                     |
| Status zaakceptowanych, otwartych i odlozonych ustalen    | [Rejestr decyzji architektonicznych](architecture-decisions.md)         |

Dokument opisujacy stan obecny ma pierwszenstwo przy ocenie tego, co system robi dzisiaj. Dokument docelowy i ten plan nie sa dowodem implementacji. Rozbieznosci nalezy wpisac do rejestru decyzji i usunac przed zamknieciem odpowiedniej fazy.

## Docelowe decyzje

- Menedzer pakietow: PNPM wszedzie, najlepiej jako workspace obejmujacy `frontend`, `backend`, `authorization`, `llm_gateway` i wspolne pakiety.
- Jezyk aplikacyjny: TypeScript wszedzie tam, gdzie dziala aplikacja web/API.
- Runtime aplikacyjny: Node 26 dla `authorization`, `backend` i `llm_gateway`. Node 26 jest obecnie linia Current wedlug harmonogramu Node.js; przed produkcja trzeba potwierdzic status LTS, obrazy bazowe i kompatybilnosc bibliotek.
- Frontend: migracja z Vite React SPA do TanStack Start w trybie SPA została wykonana w
  Fazie 8 po optymalizacji React Doctor i osobnej migracji shadcn/Base UI. Następne kroki
  wydzielają routy, loadery, guardy oraz warstwę danych.
- Auth: Hono + Node 26 + TypeScript + Better Auth jest wdrozone; pozostale kroki dodaja
  mTLS/TLS, domykaja role i usuwaja zaleznosci kompatybilnosci po koncowej integracji.
- Backend: migracja ręcznego backendu Express do NestJS + Node 26 + TypeScript została
  ukończona w Fazie 6. Pozostaje oficjalny adapter `@nestjs/platform-express`; nie planujemy migracji na
  `@nestjs/platform-fastify`.
- LLM: dodajemy trzeci osobny serwis `llm_gateway` w Hono + Node 26 + TypeScript, ktory laczy backend Nest z silnikiem LLM.
- Uruchomienie modelu: Docker Model Runner działa wyłącznie przez opcjonalny wariant Compose;
  podstawowy start pozostawia model wyłączony.
- Deployment: Docker Compose, Kubernetes i K3s są trzema produkcyjnymi profilami
  wdrożeniowymi. Compose obsługuje małą instalację na pojedynczym hoście, Kubernetes profil
  ogólny, a K3s lżejszy profil klastrowy. Parytet dotyczy funkcji, kontraktów, bezpieczeństwa,
  danych, obrazów i telemetryki, nie identycznych gwarancji HA oraz automatyzacji.
- Autoskalowanie: KEDA/HPA i scale-to-zero są funkcjami profili Kubernetes/K3s. Produkcyjny
  Compose używa jawnie ustalonej liczby replik albo kontrolowanego skalowania ręcznego;
  `llm_gateway` działa w jednej replice lub jest wyłączony.
- Zadania asynchroniczne: RabbitMQ obsługuje trwałe zadania mediów oraz retry/enrichment LLM; Redis nie jest brokerem zadań.
- Dane tymczasowe: wybrano Redis dla współdzielonego cache’u i rate limitingu; ograniczony
  pamięciowo limiter lokalny działa zawsze, także bez Redisa.
- Storage zdjec: od razu przechodzimy z pustej bazy na referencje do provider-neutralnego Object Storage; lokalnym providerem jest opcjonalny RustFS.
- Obróbka zdjęć: osobny proces `media_worker` w TypeScript/NestJS standalone używa Sharp i zapisuje WebP poza procesem HTTP backendu.
- Polaczenia DB: dodajemy PgBouncer przed PostgreSQL.
- PgAdmin: usuwamy z Compose i manifestow.
- White-Label: konfiguracja miasta, dostepnych sluzb i logo ma wynikac z pliku konfiguracyjnego wskazywanego zmienna srodowiskowa, nie z hardcode'u w UI/API.
- Obrazy Docker: optymalizujemy na koncu, gdy kontrakty i runtime'y sa stabilne.

## Docelowy obraz uslug

| Usluga            | Docelowy stack                          | Odpowiedzialnosc                                                                         |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `frontend`        | TanStack Start, React, TypeScript, PNPM | UI, route loadery i wyłącznie cienkie BFF; bez logiki domenowej oraz dostępu do storage  |
| `authorization`   | Hono, Node 26, TypeScript, Better Auth  | logowanie, rejestracja, sesje, role i kontrakt auth dla frontendu oraz backendu          |
| `backend`         | NestJS, platform-express, Node 26, TS   | API domenowe incydentów, admina, służb, storage, integracja z auth i LLM gateway         |
| `media_worker`    | NestJS standalone, TypeScript, Sharp    | asynchroniczna walidacja i konwersja zdjęć do WebP                                       |
| `llm_gateway`     | Hono, Node 26, TypeScript               | cienki adapter między NestJS a modelem LLM, timeouts, fallbacki, normalizacja odpowiedzi |
| `model_runner`    | Docker Model Runner                     | opcjonalny lokalny runtime modelu, wlaczany flaga/profilami                              |
| `postgres`        | PostgreSQL                              | dane domenowe, auth i metadane plików; pozostaje źródłem prawdy                          |
| `redis`           | Redis                                   | opcjonalny wspólny cache i liczniki rate limitingu w trybie `local` lub `external`       |
| `pgbouncer`       | PgBouncer                               | pooling polaczen do PostgreSQL dla auth/backend/gateway                                  |
| `rabbitmq`        | RabbitMQ                                | trwałe kolejki zadań mediów i asynchronicznych operacji LLM                              |
| `object_storage`  | S3-compatible                           | prywatne zdjęcia; provider wybierany przez neutralne `S3_*`                              |
| `rustfs`          | RustFS                                  | opcjonalny lokalny provider Object Storage                                               |
| `nginx` / ingress | Nginx lub Ingress Controller            | wejscie HTTP, routing, TLS w srodowiskach produkcyjnych                                  |

## White-Label

Konfiguracja miasta ma byc pierwszoklasowym kontraktem aplikacji. Proponowany model:

- `WHITE_LABEL_CONFIG=/app/config/city.yaml` albo podobna zmienna wskazuje plik konfiguracji.
- Plik zawiera przynajmniej:
  - `city.key`;
  - `city.displayName`;
  - `branding.logoPath` i `branding.emblemAlt`;
  - kontrolowane kolory `branding.colors`;
  - publiczny `contact` oraz lokalizowane `localContent`;
  - `services[]` z kluczem, nazwa wyswietlana, opisem, opcjonalnym kolorem/ikona i flaga aktywnosci;
  - wymagany adres tekstowy zgłoszenia; frontend nie osadza mapy;
  - opcjonalne dane kontaktowe i stopka.
- Frontend nie powinien miec zahardcodowanej listy sluzb ani nazwy miasta.
- Backend i auth musza walidowac role oraz `serviceKey` wzgledem tej samej konfiguracji albo jej zsynchronizowanej reprezentacji w bazie.
- Logo i zasoby miasta powinny byc mountowane jako pliki albo serwowane z RustFS/CDN, ale kontrakt konfiguracji musi pozostac taki sam.

Przyklad minimalny:

```yaml
city:
  key: zglosto
  displayName:
    'pl-PL': 'Warszawa'
    en: 'Warsaw'

branding:
  logoPath: '/assets/city-logo.svg'
  emblemAlt:
    'pl-PL': 'Herb miasta Warszawy'
    en: 'Coat of arms of Warsaw'

services:
  - key: roads
    label: 'Zarzad Drog'
    enabled: true
  - key: transit
    label: 'Miejskie Przedsiebiorstwo Komunikacyjne'
    enabled: true
  - key: other
    label: 'Inne'
    enabled: true
```

## Zasady prowadzenia prac

- Każda faza kończy się działającym systemem uruchamianym przez bazowy Docker Compose.
  Fazy wdrożeniowe 9-12 dodatkowo utrzymują i osobno certyfikują produkcyjne profile Compose,
  Kubernetes i K3s.
- Duze zmiany musza miec testy integracyjne przynajmniej dla logowania, roli, tworzenia zgloszenia, listowania zgloszen, zmiany statusu, zapisu zdjecia i klasyfikacji LLM.
- Przed migracjami trzeba spisac kontrakty API: endpointy, payloady, cookies, role, statusy, format zdjec, format konfiguracji White-Label i kontrakt LLM gateway.
- Aktualizacje pakietow, migracje frameworkow i optymalizacje obrazow robimy osobnymi falami.
- Wszystkie wersje narzedzi oznaczone jako przyszle albo zmienne, w tym Node 26, TanStack Start, Docker Model Runner i serverless scaling, trzeba potwierdzic w dniu realizacji.
- PNPM workspace i wspolne typy powinny byc wprowadzone przed przepisywaniem glownego backendu, zeby nie dublowac kontraktow.

## Faza 0: Audyt, baseline i kontrakty

Stan: **zakonczona 2026-07-17**. Kroki 1-9 sa wdrozone i zweryfikowane. Audyt, baseline, routing same-origin, healthchecki i smoke Compose sa zgodne z kodem. Izolowany zestaw integracyjny pokrywa rejestracje, logowanie, potwierdzenie e-maila, przejecie anonimowej historii, wszystkie role, operacje incydentow, statusy, panel admina, zdjecia oraz kontrolowane warianty LLM. Konfiguracja ENV ma wersjonowany wzorzec, jawny podzial na uslugi, rozdzielone sekrety i walidacje startowe.

1. Przyjac i utrzymywac [audyt obecnej architektury](current-architecture-audit.md) jako baseline stanu obecnego.
2. Przyjac i utrzymywac [baseline kontraktow API](api-contracts-baseline.md) jako zrodlo prawdy dla obecnych kontraktow HTTP, sesji, rol, statusow, zdjec i LLM.
3. Utrzymywac zaakceptowany w ADR-003 model same-origin: Nginx dla Compose/K8s oraz zgodne prefiksy proxy w Vite dev.
4. Utrzymywac [healthchecki Fazy 0](healthchecks.md) dla `frontend`, `backend`, `authorization`, `database`, `llm_gateway` oraz publicznego Nginx.
5. Utrzymywac [smoke test startu Compose](compose-smoke-tests.md), obejmujacy build, healthchecki, brak restartow, routing same-origin i lekki tryb LLM bez modelu.
6. Utrzymywac [testy integracyjne Fazy 0](phase-0-integration-tests.md) dla:

- utrzymywac wdrozone statusy incydentow `reported`, `in_progress`, `resolved` zgodnie z ADR-007;
- przetestowac wdrozone anonimowe zgloszenia, chroniona liste profilu i bezpieczne przypisanie historii po potwierdzeniu e-maila zgodnie z ADR-004;
- przetestowac wdrozony strukturalny fallback `unknown` dla niedostepnego LLM zgodnie z ADR-009;
- rejestracji i logowania;
- potwierdzenia e-maila oraz przypisania wcześniejszych anonimowych zgloszen do nowego konta;
- sesji z rola `mieszkaniec`, `sluzby`, `admin`;
- dodania zgloszenia;
- listowania zgloszen;
- zmiany statusu;
- panelu admina;
- zapisu/odczytu zdjec;
- niedostepnego LLM.

7. Utrzymywac `.env.example`, [opis zmiennych](environment-variables.md), rozdzial sekretow i walidacje startowe.
8. Spisac docelowy kontrakt White-Label config.
9. Doprecyzowac kontrakt sesji dla web i przyszlego React Native:

- cookie dla web;
- oficjalny klient Better Auth Expo, SecureStore i jawny naglowek `Cookie` dla mobile;
- walidacja zawsze przez `authorization`.

### Zrealizowana kolejnosc domkniecia Fazy 0

1. **Wdrozone:** zmigrowano statusy w bazie, backendzie, frontendzie i wspolnym kontrakcie na `reported`, `in_progress`, `resolved`; polskie etykiety sa w warstwie prezentacji.
2. **Wdrozone:** kontrakt tozsamosci mieszkanca obejmuje znormalizowany e-mail, opcjonalne `reporter_user_id`, sesje opcjonalna przy tworzeniu, sesje wymagana dla prywatnej listy oraz przypisanie historii dopiero po potwierdzeniu e-maila.
3. **Wdrozone:** fallback LLM zapisuje strukturalne `municipal | emergency | unknown`, diagnostyczne `source`/`reason` i pokazuje osobny komunikat o recznej weryfikacji. Backend kieruje `unknown` wyłącznie przez `routing.fallbackServiceKey` z White Label; model runner nie posiada własnego klucza routingu.
4. **Wdrozone:** izolowane srodowisko Compose uzywa bazy w `tmpfs`, testowego outboxu Better Auth, danych dla rol `mieszkaniec`, `sluzby`, `admin` oraz kontrolowanego stubu LLM.
5. **Wdrozone:** zestaw integracyjny pokrywa wszystkie scenariusze kroku 6, w tym przejecie anonimowej historii, ochrone prywatnej listy, kody statusow, izolacje sluzb, zdjecia i awarie LLM.
6. **Wdrozone:** `.env.example` i dokumentacja opisuja wszystkie zmienne, Compose nie wstrzykuje calego `.env` do uslug, sekrety sa rozdzielone, a backend/authorization/LLM waliduja wymagane wartosci.
7. **Wdrozone:** smoke Compose, testy integracyjne, testy jednostkowe, typecheck, build, lint, format check zmienionych plikow i kontrola dokumentacji stanowia koncowa bramke Fazy 0.

Dlaczego teraz: bez baseline'u i kontraktow nie da sie bezpiecznie migrowac auth, backendu, storage, LLM i routingu.

## Faza 1: PNPM workspace, TypeScript i wspolne kontrakty

Stan: **zakonczona 2026-07-17**. Workspace, wspolne kontrakty, pelna migracja kodu i testow
do TypeScript, wspolny tryb strict, testy kontraktowe, baseline Oxfmt oraz koncowa bramka
jakosci zostaly wdrozone i zweryfikowane.

Krok wykonawczy 1 — zakres kontraktów i migracji TypeScript — został uporządkowany
2026-07-17 w [dokumencie Fazy 1](phase-1-contracts-typescript-scope.md). Przyjęto pełną
migrację kodu aplikacyjnego i testowego JavaScript do TypeScript, zakaz `any` w kodzie
pierwszej strony oraz jawny `null` albo unię dyskryminowaną zamiast `undefined` w kontraktach
i domenie.

1. **Wdrozone przed Faza 1, zaktualizowane 2026-09-02:** PNPM `11.25.0` jest jedynym package managerem JavaScript/TypeScript; zaleznosci bezposrednie sa przypiete dokladnie, aktualizacje maja 24-godzinna kwarantanne publikacji, a operacje na pakietach JavaScript chroni Socket Firewall (`sfw`).
2. **Wdrozone przed Faza 1:** workspace obejmuje `frontend`, `backend`, `authorization` i `packages/*`, a repozytorium ma jeden glowny `pnpm-lock.yaml`.
3. **Wdrożone 2026-07-17:** wspólny pakiet `packages/contracts` zawiera:

- role;
- statusy incydentow;
- typy sluzb;
- request/response API;
- kontrakt konfiguracji White-Label;
- kontrakt LLM gateway;
- kontrakt sesji web/mobile zgodny z [baseline kontraktow API](api-contracts-baseline.md).

  Pakiet jest podzielony na `common`, `auth`, `incidents`, `services`, `admin`, `images`, `llm`
  i `white-label`. Frontend oraz authorization używają zależności workspace zamiast lokalnych
  duplikatów. Odpowiedzi HTTP są przyjmowane jako `unknown` i walidowane parserami runtime
  przed wejściem do UI. Zasady i publiczne API opisuje
  [`packages/contracts/README.md`](../packages/contracts/README.md).

4. **Wdrozone:** wspolny toolchain repozytorium udostepnia:

- Oxlint jako podstawowy linter JavaScript/TypeScript;
- Oxfmt jako jedyny formatter;
- wspolne konfiguracje w katalogu glownym;
- `pnpm build`;
- `pnpm lint`;
- `pnpm format` i `pnpm format:check`;
- `pnpm test`;
- `pnpm typecheck`.
- `pnpm check`;
- `pnpm quality:phase1`.

  Wszystkie projekty dziedzicza `tsconfig.base.json`, a jednorazowy baseline Oxfmt objal cale
  repozytorium.

5. ESLint zostal usuniety po uruchomieniu natywnych pluginow Oxlint dla React, TypeScript, importow i accessibility. React Doctor pozostaje dodatkowa kontrola zmian React, a ostrzezenia wykryte przy migracji tworza jawny backlog do uporzadkowania.
6. TypeScript `7.0.2` jest uzywany jako natywny `tsc` do osobnego `pnpm typecheck`. Oxlint dziala bez type-aware lintingu i bez `oxlint-tsgolint`; dodac ten pakiet dopiero, jesli projekt zdecyduje sie na reguly zalezne od informacji typow.
7. **Wdrozone przed Faza 1:** usunieto lockfile innych managerow, a instalacje lokalne i kontenerowe uzywaja `pnpm install --frozen-lockfile`.
8. **Wdrozone przed Faza 1:** obrazy frontend/backend/authorization korzystaja z Node `26.5.0` i PNPM, wspolnego kontekstu workspace oraz produkcyjnego `pnpm deploy`. Migracje frameworkow do Hono, NestJS i TanStack Start pozostaja w swoich fazach.
9. **Wdrożone 2026-07-17:** cały kod aplikacyjny backendu Express, jego testy jednostkowe
   oraz izolowane testy integracyjne zostały przeniesione z JavaScript/MJS do TypeScript.
   Testy jednostkowe i kontraktowe używają Vitest, a integracja natywnego runnera Node 26.
   Backend używa ścisłego `tsconfig`, wspólnych kontraktów, parserów `unknown` dla
   HTTP/auth/PostgreSQL oraz produkcyjnego `dist/index.js`. Faza 6 zastąpi ten typowany
   backend Express przez NestJS.
10. **Wdrożone 2026-07-17:** frontend używa Tailwind CSS 4 w trybie CSS-first przez
    `@tailwindcss/vite`. Usunięto bezpośrednie zależności i konfigurację PostCSS,
    `autoprefixer` oraz osobny `tailwind.config.js`; motyw, wariant dark, kontener i animacje
    są definiowane bezpośrednio w `frontend/src/App.css`. Ewentualny wpis `postcss` w
    lockfile pozostaje wyłącznie zależnością wewnętrzną Vite.
11. **Wdrozone 2026-07-17:** kod pierwszej strony nie zawiera jawnego `any`. Dane z HTTP,
    ENV, bazy i bibliotek sa przyjmowane jako `unknown`, walidowane i zawezane. Kontrakty i
    domena nie uzywaja jawnego `undefined`; brak wartosci reprezentuje `null` lub wariant unii
    zgodnie z [ADR-021](architecture-decisions.md). Polityke egzekwuje
    `scripts/check-typescript-source.sh`.
12. **Wdrozone 2026-07-17:** osiem testow kontraktowych chroni sesje, role, DTO incydentow,
    katalog statusow i fallback LLM. `pnpm quality:phase1` uruchamia kontrole zrodel, Oxfmt,
    Oxlint, strict typecheck, 16 testow jednostkowych/kontraktowych, wszystkie buildy i pelny
    izolowany zestaw integracyjny Compose.

Dlaczego przed migracjami: wspolne typy i jeden package manager ogranicza rozjazdy miedzy frontendem, auth, backendem i gatewayem.

## Faza 2: White-Label config jako kontrakt produktu

Zaakceptowane decyzje wykonawcze sa opisane w [dokumencie Fazy 2](phase-2-white-label-decisions.md).

Stan: **zakonczona 2026-07-18**. Kroki 1-14 zakonczono: wspolny pakiet kontraktow zawiera
wersjonowany strict schema Zod, typy inferowane, walidacje relacji, osobna granice publiczna,
czytelne bledy parsera oraz testy pozytywne i negatywne. Model `single-city` jest jawnym
kontraktem runtime, a kontrola architektury blokuje identyfikatory tenantow i kolekcje
konfiguracji miast w kodzie, SQL oraz manifestach. Domyslny YAML ZglosTO jest ladowany przez
Node-only pakiet z `WHITE_LABEL_CONFIG`, walidowany przed uzyciem, identyfikowany checksumem
SHA-256 i cache'owany bez hot reloadu. Pakiet `@zglosto/i18n` udostepnia typowany katalog
`pl-PL`/`en`, resolver locale i formatowanie `Intl` w `Europe/Warsaw`; frontend uzywa
`i18next` oraz `react-i18next` do zmiany jezyka bez przeladowania strony.
Nazwa miasta, logo, favicon, alternatywny opis emblematu, kontrolowane kolory, publiczny
kontakt, metadane strony, stopka i komunikat prawny pochodza teraz z tego samego YAML-a.
Vite osadza jego zwalidowana publiczna czesc w artefakcie frontendu podczas buildu.
Lista sluzb, lokalizowane etykiety i skroty, prezentacja oraz kolejnosc pochodza z katalogu
YAML. Frontend, backend, authorization i PostgreSQL operuja stabilnymi `serviceKey`.
Tabela `service_types` zapewnia integralnosc referencyjna dla zgloszen i kont sluzb;
historyczny `typ_sluzby_enum` oraz pole `legacyDatabaseValue` zostaly usuniete po migracji danych.
Synchronizacja katalogu zachowuje rekordy nieobecne w nowym YAML-u jako nieaktywne, a
triggery PostgreSQL blokuja nowe przypisania do nieaktywnych uslug bez blokowania odczytu
i aktualizacji danych historycznych.
Fallback routingu jest pojedynczym polem `routing.fallbackServiceKey` w YAML-u. Serwis modelu
zwraca dla `unknown` wartosc `serviceKey: null`, a backend podstawia skonfigurowany, istniejacy
i aktywny klucz; nie istnieje juz rownolegla zmienna srodowiskowa ani hardcode `other` w runtime.
Publiczny `GET /api/config/public` zwraca jawna allowliste danych, tylko aktywne uslugi,
publiczny klucz fallbacku, wersje i checksum SHA-256. Silny ETag, `If-None-Match`, odpowiedz
`304` i krotki cache HTTP pozwalaja klientom bezpiecznie rewalidowac konfiguracje po rolloutach.
Granica konfiguracji blokuje pola sekretow, material kluczy/tokenow, URL-e z poswiadczeniami
i interpolacje ENV bez ujawniania znalezionej wartosci w bledzie. `pnpm check` waliduje kazdy
wersjonowany YAML miasta, a sekrety pozostaja w ENV lub Kubernetes Secret.
Backend i authorization laduja config przed otwarciem portu, a ich readiness laczy stan bazy
z wersja i checksumem zwalidowanej konfiguracji. Frontend Vite generuje ten sam typowany
artefakt podczas buildu, a Nginx nie startuje bez niego. Liveness pozostaje niezalezne.
Wersjonowany build przyjmuje jeden YAML i osadza go w obrazach
frontend/backend/authorization. Wersja, rewizja i checksum pozostają w manifeście lokalnego
builda; etykiety obrazów są odroczone do czasu rzeczywistego CI/CD. Skrypt wdrozeniowy
odrzuca `latest`, wymusza rollout adnotacja checksumy i sprawdza checksumy raportowane
przez wszystkie trzy warstwy.
Dwie odmienne konfiguracje testowe przechodza ten sam loader, publiczny kontrakt API oraz
pelny build frontendu, co chroni aplikacje przed ponownym hardcode'em miasta.

1. **Wdrozone 2026-07-18:** dodano wersjonowany, strict schemat konfiguracji miasta w Zod; typy TypeScript sa wyprowadzane ze schematu.
2. **Wdrozone 2026-07-18:** jeden config i jedno miasto na deployment; kontrakt i kontrola architektury nie dopuszczaja teraz wielodzierzawnosci runtime.
3. **Wdrozone 2026-07-18:** domyslny YAML obecnego ZglosTO jest wskazywany przez `WHITE_LABEL_CONFIG` i obslugiwany przez wspolny Node-only loader.
4. **Wdrozone 2026-07-18:** `pl-PL` jest locale domyslnym, wspierane sa `pl-PL` i `en`, a formatowanie lokalnego czasu zawsze wskazuje `Europe/Warsaw`.
5. **Wdrozone 2026-07-18:** nazwa miasta, logo, favicon, kontrolowane tokeny brandingu, publiczne dane kontaktowe, metadane i teksty lokalne sa czescia strict configu i zasilaja frontend.
6. **Wdrozone 2026-07-18:** lista sluzb i jej prezentacja pochodza z katalogu YAML; UI i requesty uzywaja stabilnych `serviceKey`; przejsciowa mapa starego enumu zostala usunieta w kroku 7.
7. **Wdrozone 2026-07-18:** dodano `service_types`, zmigrowano zgloszenia i przypisania kont metodą expand-migrate-contract, podlaczono klucze obce i usunieto stary `typ_sluzby_enum`.
8. **Wdrozone 2026-07-18:** nieaktywne i usuniete z YAML-a uslugi pozostaja w `service_types`; nowe zgloszenia i przypisania sa blokowane w aplikacji oraz PostgreSQL, a historia i ponowna aktywacja pozostaja obslugiwane.
9. **Wdrozone 2026-07-18:** `routing.fallbackServiceKey` jest jedynym zrodlem routingu awaryjnego; schemat wymaga aktywnej uslugi, backend stosuje klucz dla wszystkich awarii LLM, a model runner zwraca `serviceKey: null` i nie posiada osobnej konfiguracji fallbacku.
10. **Wdrozone 2026-07-18:** dodano publiczny, filtrowany `GET /api/config/public` z wersja, checksum SHA-256, ETagiem, cache HTTP i obsluga `304`; odpowiedz zawiera tylko aktywne uslugi oraz publiczny klucz fallbacku, ale nie ustawienia integracji.
11. **Wdrozone 2026-07-18:** White-Label YAML jest traktowany jako publiczny; kontrakt blokuje pola i wartosci sekretow oraz interpolacje ENV, bledy sa redagowane, a `pnpm check` waliduje wszystkie konfiguracje. Sekrety pozostaja w ENV/Secret.
12. **Wdrozone 2026-07-18:** backend i authorization waliduja config przed nasluchem, frontend waliduje go przy buildzie i wymaga artefaktu przy starcie Nginx; readiness raportuje wersje/checksum i nie moze byc poprawne dla blednej konfiguracji.
13. **Wdrozone 2026-07-18, zaktualizowane 2026-07-28:** build przyjmuje jeden zwalidowany YAML i niezmienny tag oraz osadza ten sam config w trzech warstwach. Manifest lokalnego builda zapisuje wersję, rewizję i checksum; etykiety obrazów są odroczone do rzeczywistego CI/CD. Deploy wymusza rollout checksumą, odrzuca `latest` i weryfikuje readiness wszystkich warstw. Panel admina i hot reload pozostaja niedostepne.
14. **Wdrozone 2026-07-18:** dodano niezalezne konfiguracje testowe Gdanska i Wroclawia; wspolne testy loadera, publicznego API i rzeczywiste buildy frontendu sprawdzaja odmienne nazwy, branding, locale, feature flags, katalogi uslug i fallback bez hardcode'u Warszawy.

Dlaczego tutaj: NestJS, TanStack Start i auth powinny od razu celowac w aplikacje White-Label, a nie przepisywac hardcode drugi raz.

## Faza 3: Baza, PgBouncer i RustFS

Szczegolowy kontrakt i kolejnosc wdrozenia opisuje
[dokument Fazy 3](phase-3-database-object-storage.md).

Stan: **zakres implementacyjny zakonczony 2026-07-18**. Kroki 1-2 oraz 4-10 sa wdrozone.
Krok 3 nie blokuje zakonczenia fazy: zostal przeniesiony do koncowej bramki Fazy 12, ponieważ
wartosci produkcyjne mozna ustalic dopiero dla kompletnego systemu. Aplikacje uzywaja wylacznie
`DATABASE_URL` wskazujacego PgBouncera, a migracje i operacje bazodanowe korzystaja z
`DATABASE_DIRECT_URL` wskazujacego PostgreSQL. Izolowany zestaw integracyjny potwierdza
pelne przeplywy przez pooler oraz brak bezposredniego URL-u w backendzie i authorization.
RustFS jest prywatnym lokalnym providerem, ale kod backendu zalezy wylacznie od neutralnego
`ObjectStorage`, `S3ObjectStorage` i konfiguracji `S3_*`.

1. **Wdrozone 2026-07-18:** rozdzielic kontrakt polaczen na aplikacyjny `DATABASE_URL` oraz
   bezposredni `DATABASE_DIRECT_URL`. Nie przekazywac adresu bezposredniego do backendu ani
   authorization.
2. **Wdrozone 2026-07-18:** dodano `edoburu/pgbouncer:v1.25.2-p0`, SCRAM-SHA-256,
   transaction pooling, healthcheck SQL i prepared statements; backend i authorization
   startuja dopiero po readiness poolera.
3. **Odroczone do końcowej bramki Fazy 12:** zweryfikowac limity polaczen dla kompletnego
   systemu. Testy obciazeniowe, test nasycenia i finalne strojenie PgBouncera wykonac dopiero
   na samym koncu prac, gdy wszystkie docelowe uslugi, endpointy, procesy asynchroniczne i
   zasoby infrastruktury beda gotowe oraz stabilne. Nie stroic PgBouncera pod przejsciowy
   Express. `llm_gateway` nie otrzymuje dostepu do bazy bez konkretnej potrzeby.
4. **Wdrozone 2026-07-18:** dodano ogolna granice kodu `ObjectStorage` oraz implementacje `S3ObjectStorage` oparta na
   `@aws-sdk/client-s3`. Nazwa, importy i ENV kodu aplikacyjnego nie moga zalezec od RustFS;
   `RustFsStorage` jest zabronionym kierunkiem implementacji.
5. **Wdrozone 2026-07-18:** dodano przypiety RustFS jako domyslny lokalny provider zgodny z
   S3, prywatny wolumen, healthcheck, inicjalizacje bucketu i test `put/get/head/delete`.
   Zewnetrzny bucket podlacza sie przez zmiane `S3_*` w ENV bez zmiany kodu.
6. **Wdrozone 2026-07-18:** wprowadzono bezposrednio docelowy model danych zdjec:

- osobna tabela `incident_images` trzyma referencje i metadane, nie binarne pliki;
- zdjęcie zgłoszone i zdjęcie rozwiązania są osobnymi obiektami z unikalnym rodzajem;
- model zawiera stan przetwarzania, klucze oryginału i WebP, rozmiar, wymiary, MIME,
  checksum oraz kod błędu;
- usunięto `bytea` bez migracji danych, dual-write i fallbacku; migracja DDL czyści wyłącznie
  usuwalne dane testowe poprzedniej wersji;
- backend zapisuje przez neutralny `ObjectStorage`, a odczyt realizuje kontrolowany endpoint
  API z autoryzacją i publicznym dostępem wyłącznie do zdjęcia rozwiązanej sprawy.

7. **Wdrozone 2026-07-18:** domyslny `docker-compose.yml` uruchamia pelny lokalny stack z
   RustFS. Samodzielny `docker-compose.no-rustfs.yml` jest provider-neutralny i nie definiuje
   RustFS, jego wolumenu ani zaleznosci backendu. AWS S3 i Cloudflare R2 działają przez
   `S3_*` bez uruchamiania RustFS, a backend nadal wykonuje fail-fast/readiness aktywnego
   bucketu.
8. **Wdrozone 2026-07-18:** zdefiniowano kontrakt V1 zadan i wynikow mediow, topologie
   exchange/queue/retry/DLQ, limity prób i backoff. `media_processing_jobs`, rewizje zdjęć i
   PostgreSQL outbox zapewniają idempotencję oraz atomowy zapis zdarzenia bez bajtów/base64.
   Osobny `media_worker` w TypeScript/NestJS ze Sharp, publisher i RabbitMQ powstają w Fazie 6.
9. **Wdrozone 2026-07-18:** przygotowano kompatybilny model danych lokalizacyjnych:

- `adres_zgloszenia` zostaje tekstem czytelnym dla uzytkownika;
- opcjonalna para `latitude` i `longitude` WGS84 pozostaje w kontraktach, API i bazie dla
  zgodności, ale formularz webowy od 2026-07-27 wysyła `null`;
- zakresy oraz kompletność pary są walidowane w aplikacji i PostgreSQL;
- brak pól w starszym kliencie jest normalizowany do `null`;
- zapis zgloszenia nie zależy od geokodowania.

10. **Wdrozone 2026-07-18:** wspólny backup obejmuje logiczny dump PostgreSQL, neutralne
    archiwum aktywnego Object Storage, audyt i sumy SHA-256. Restore zatrzymuje warstwę zapisu,
    omija PgBouncera, odtwarza obiekty przez S3 API i kończy audytem. Naprawiono również
    pgBackRest, archiwizację WAL, harmonogram oraz retencję. Izolowana integracja wykonuje
    destrukcyjny restore drill. Szczegóły: [backup-restore.md](backup-restore.md).

Dlaczego przed backendem: NestJS powinien od razu integrowac sie z docelowym storage, PgBouncerem i modelem danych.

## Faza 4: Usuniecie pgAdmin

**Status: wdrozone wyprzedzajaco 2026-07-17.** PgAdmin, jego routing, port, wolumeny, zmienne, konfiguracja Compose i zasoby K8s zostaly usuniete. Podstawowy workflow `psql` oraz zasady lokalnego klienta i polaczenia read-only opisuje `database/README_DATABASE.md`.

1. Usunac `pgadmin` z `docker-compose.yml`.
2. Usunac konfiguracje, wolumeny i manifesty K8s zwiazane z pgAdmin.
3. Zastapic pgAdmin operacyjnym workflow:

- `psql` przez Docker Compose;
- lokalny klient DB po stronie developera;
- skrypty diagnostyczne dla najczestszych zapytan;
- opcjonalne read-only connection stringi dla wsparcia.

4. Zaktualizowac README i dokumentacje developerska.

Dlaczego tutaj: po dodaniu PgBouncera i RustFS zmienia sie sposob pracy z danymi, wiec usuniecie pgAdmin ma jasny zamiennik.

## Faza 5: Auth na Hono + Node 26 + TypeScript

1. **Wdrozone 2026-07-18:** zamrozic obecny kontrakt Authorization przed zmiana frameworka.
   Dedykowany test kontraktowy sprawdza przez rzeczywisty Nginx i bezposredni listener:
   - `/api/auth/sign-up/email`, `/api/auth/get-session` i `/api/auth/sign-out`;
   - wewnetrzny `/api/verify-session` dla braku sesji, aktywnej sesji i wylogowania;
   - cookie Better Auth, CORS dla dozwolonego i obcego originu;
   - propagacje rol `mieszkaniec` i `sluzby` wraz ze stabilnym `serviceKey`;
   - `/health/live`, `/health/ready` oraz zgodnosciowy `/health`;
   - izolowane endpointy testowe i ich bledne dane.
2. **Wdrozone 2026-07-18:** wydzielic `createAuthorizationApp()` w `src/app.ts` od lekkiego
   procesu `server.ts` uruchamianego przez `@hono/node-server`. Aplikacja udostepnia Fetch API
   i moze byc testowana bez otwierania portu.
3. **Wdrozone 2026-07-18:** zachowac Better Auth `1.6.23` jako warstwe domenowa i podpiac
   `auth.handler(context.req.raw)` do Hono `4.12.30` na Node 26 bez zmiany modelu sesji,
   tabel ani publicznego prefiksu `/api/auth/*`. Warstwa zgodnosci utrzymuje body-less
   `POST /api/auth/sign-out` akceptowany przez poprzedni adapter.
4. **Wdrozone 2026-07-18:** przeniesc niestandardowe endpointy, CORS, logowanie requestow,
   JSON-owe `notFound`/`onError` i liveness/readiness z Expressa na middleware Hono.
   Zamrozony kontrakt i pelny test Compose przechodza po migracji.
5. **Wdrozone 2026-07-18:** zweryfikowano role oraz White-Label. `customSession` wystawia
   wyłącznie `uprawnienia` i `serviceKey`; domyślna rola to `mieszkaniec`, role
   `mieszkaniec`/`admin` zawsze otrzymują `serviceKey: null`, a `sluzby` dostaje klucz tylko
   dla aktywnej usługi zsynchronizowanej w `service_types`. Backend odrzuca przypisania spoza
   aktywnego katalogu, a testy obejmują propagację ról i izolację służb. Nazwę
   `typ_uprawnien` usunięto z runtime sesji, API i konsumentów; pozostaje wyłącznie w
   historycznej migracji schematu.
6. **Wdrozone 2026-07-18:** dodano `pnpm certs:dev`, który przez OpenSSL tworzy w ignorowanym
   `.certs/` oddzielne, 30-dniowe Service CA i Database CA oraz 7-dniowe certyfikaty ECDSA.
   Klucze mają prawa `600`, certyfikaty `644`, katalog nie trafia do kontekstu builda, a
   Compose montuje wymagane sekrety read-only. Service CA wystawia serwer Authorization oraz
   osobne klienty backendu i Nginx; Database CA przygotowuje certyfikaty PostgreSQL/PgBouncera
   dla kroków 11-12.
7. **Wdrozone 2026-07-18:** uruchomiono osobny wewnętrzny listener Authorization na `9956`,
   wymagający TLS 1.3, poprawnego certyfikatu klienta Service CA i dokładnie jednej dozwolonej
   tożsamości URI SAN. `backend-client` ma dostęp do `/api/verify-session` i health, a
   `nginx-client` do `/api/auth/*`. Test integracyjny pokrywa poprawny SAN serwera, rozdział
   endpointów, brak certyfikatu, obcą CA oraz zaufany, ale niedozwolony workload. Przejściowy
   Listener HTTP `9955` został usunięty po wdrożeniu kroków 9-10.
8. **Wdrozone 2026-07-18:** Backend łączy się z Authorization wyłącznie przez HTTPS/mTLS na
   `9956`. Natywny klient `node:https` przedstawia osobny certyfikat `backend-client`, ufa
   wyłącznie Service CA, wymaga TLS 1.3 i weryfikuje DNS `authorization`. Pełny nagłówek
   `Cookie` nadal jest przekazywany, a odpowiedź pozostaje `unknown` do przejścia przez
   `parseVerifiedAuthSession`; mTLS nie zastępuje kontroli sesji ani roli użytkownika.
9. **Wdrozone 2026-07-18:** Nginx proxyuje publiczne `/api/auth/*` do
   `https://authorization:9956` jako osobny klient `nginx-client`. Weryfikuje Service CA,
   DNS `authorization` i TLS 1.3, a jego kontener nie ma kluczy backendu ani serwera.
   Przeglądarka i Expo nadal korzystają z publicznego HTTPS bez certyfikatu klienckiego.
10. **Wdrozone 2026-07-18:** usunięto listener HTTP `9955`. Healthcheck Authorization
    przechodzi przez mTLS z dedykowaną tożsamością `authorization-healthcheck`, ograniczoną
    wyłącznie do `/health*`. Healthcheck Nginx odpytuje publiczne `/api/auth/get-session`,
    więc sprawdza również rzeczywisty kanał proxy mTLS. Test negatywny potwierdza odrzucenie
    plaintext na jedynym porcie Authorization `9956`.
11. **Wdrozone 2026-07-18:** włączono TLS 1.3 na obu niezależnych odcinkach
    `backend/authorization -> PgBouncer -> PostgreSQL`. Aplikacje ufają wyłącznie Database CA
    i weryfikują DNS `pgbouncer`; PgBouncer używa `server_tls_sslmode=verify-full` i weryfikuje
    DNS `database`. PostgreSQL dopuszcza zdalnie wyłącznie `hostssl` z SCRAM-SHA-256, a
    PgBouncer odrzuca klientów plaintext. Zgodnie z ADR-029 baza nie wymaga certyfikatów
    klienckich.
12. **Wdrozone 2026-07-18:** migracje, backup, restore, healthcheck i administracja przez
    `DATABASE_DIRECT_URL` korzystają z `PGSSLMODE=verify-full`, Database CA i DNS `database`.
    Test integracyjny sprawdza TLS 1.3 dla połączenia bezpośredniego i przez pooler oraz
    odrzucenie plaintext na PostgreSQL i PgBouncerze.
13. **Wdrozone 2026-07-18:** dodano negatywne testy transportu. Authorization odrzuca brak
    certyfikatu, klienta z obcej CA, rzeczywiście wygasły certyfikat podpisany przez Service CA
    oraz zaufany, ale niedozwolony workload. Klient odrzuca obcą CA serwera i błędny SAN
    `authorization`. PostgreSQL i PgBouncer odrzucają plaintext, obcą CA i niezgodną nazwę
    serwera przy `verify-full`.
14. **Wdrozone 2026-07-18:** pełna izolowana integracja przechodzi przez Nginx, Backend,
    Authorization, PgBouncer i PostgreSQL, łącznie z rejestracją, weryfikacją e-maila, sesją,
    rolami, CORS, cookies, zdjęciami, negatywnymi testami TLS/mTLS, migracjami, pgBackRest oraz
    backupem i odtworzeniem PostgreSQL + Object Storage.
15. **Wdrozone 2026-07-18:** po przejściu zamrożonych kontraktów usunięto z Authorization
    nieużywane `express`, `cors`, `@types/express` i `@types/cors`. Serwis używa wyłącznie Hono
    i `hono/cors`; kontrola polityki źródeł blokuje ponowne dodanie starych zależności.
    Express/CORS pozostają świadomie tylko w aktywnym backendzie do jego migracji na NestJS w
    Fazie 6. Kod aplikacyjny pozostaje TypeScript kompilowanym do JavaScript w obrazie.
16. **Wdrozone 2026-07-18:** zsynchronizowano dokumentację architektury, transportu,
    healthchecków, testów, zmiennych środowiskowych i zależności. Diagram transportu odpowiada
    runtime Compose; konfiguracja ENV nie wymagała nowych zmiennych. Fazę zamknięto przez
    `pnpm check`, walidację Compose i pełny izolowany test integracyjny z backup/restore.

Uzasadnienie: Hono pasuje do lekkiego serwisu HTTP, ma dobry model middleware i pozwala utrzymac auth jako osobna granice systemu.

## Faza 6: Backend na NestJS + Node 26 + TypeScript

Wiążący adapter HTTP backendu to `@nestjs/platform-express`. Zachowujemy go jako element
docelowego stacku NestJS; `@nestjs/platform-fastify` nie jest planowany ani w tej fazie, ani
jako późniejsza migracja. Usunięcie starego backendu Express oznacza usunięcie ręcznego
bootstrapu, routerów i middleware, a nie usunięcie Expressa używanego wewnętrznie przez NestJS.

Docelową linią frameworka jest NestJS 12. Ponieważ na 2026-07-20 dostępne jest dopiero
`12.0.0-alpha.5` (`next`), a stabilną linią pozostaje `11.1.28`, krok 2 zaczyna się od bramki
zgodności prerelease z Node 26, TypeScript 7/TSGO, ESM, platform-express, Vitest, Zod/Standard
Schema i OpenAPI. Pozytywny wynik pozwala rozwijać nieprodukcyjną aplikację bezpośrednio na
NestJS 12 prerelease; wynik blokujący uruchamia czasowy fallback do NestJS 11. Stabilne
NestJS 12 jest obowiązkową bramką przed deklaracją wspólnego, certyfikowanego baseline'u
produkcyjnego, ale nie blokuje publikacji źródeł ani realizacji kolejnych faz. Została ona
przeniesiona do Fazy 13; późniejsza Faza 14 opisuje rozwój produktu po tej migracji. Szczegółowy, wiążący plan
i kryteria Fazy 6 opisuje [plan Fazy 6](phase-6-nestjs-plan.md).

1. **Wdrożone 2026-07-18:** zinwentaryzowano wszystkie 21 tras przejściowego backendu
   Express: 17 tras domenowych/konfiguracyjnych, 3 healthchecki i diagnostyczne `/protected`.
   Typowany manifest zamraża metody, ścieżki publiczne i wewnętrzne, dostęp, statusy oraz
   kontrakty request/response. Test jednostkowy porównuje manifest z rzeczywistymi
   deklaracjami Express, a integracja wykonuje probe każdej trasy przez Nginx. Podczas
   migracji zachowujemy 20 tras; nieużywane `/protected` usuwamy przy końcowym przełączeniu.
   Szczegóły: [kontrakt HTTP backendu Fazy 6](phase-6-backend-http-contract.md).
2. **Wdrożone 2026-07-20:** bramka zgodności przeszła na spójnej macierzy NestJS
   `12.0.0-alpha.5`, Swagger `12.0.0-alpha.2`, Node `26.5.0`, TypeScript/TSGO `7.0.2`,
   Express `5.2.1`, Zod `4.4.3` i Vitest `4.1.10`. Równoległy szkielet w `backend/nest`
   potwierdza DI, jawny `ExpressAdapter`, produkcyjny build ESM/NodeNext, natywny
   Standard Schema, generowanie OpenAPI oraz rejestrację i zwolnienie hooków `SIGTERM`.
   Skompilowany proces przeszedł probe HTTP i kontrolowane zakończenie. Fastify nie jest
   zależnością, a stary runtime pozostaje aktywny w Compose do cutoveru. Szczegóły i macierz:
   [plan Fazy 6](phase-6-nestjs-plan.md#kroki-realizacji). Pełne `pnpm check` i build obrazu
   backendu przechodzą.
3. **Wdrożone 2026-07-20:** wydzielono moduły:

- `IncidentsModule`;
- `ResidentsModule`;
- `ServicesModule`;
- `AdminModule`;
- `AuthBridgeModule`;
- `StorageModule`;
- `MediaModule`;
- `JobsModule`;
- `DatabaseModule`;
- `WhiteLabelModule`;
- `LlmGatewayModule`.

  `AppModule` składa pełny graf, a test topologii porównuje rzeczywiste metadata `@Module`,
  egzekwuje dokładne zależności, brak cykli i brak `forwardRef()`, po czym kompiluje cały graf
  przez Nest DI. Moduły infrastrukturalne są liśćmi, kolejne warstwy zależą wyłącznie w
  kierunku `Residents/Services/Admin -> Incidents -> Jobs/Media -> Database/Storage`, z
  osobnymi liśćmi `AuthBridge`, `WhiteLabel` i `LlmGateway`.
  Pełne `pnpm check`, 45 testów backendu i build obrazu backendu przechodzą. Compose nadal
  uruchamia dotychczasowy runtime.

4. **Wdrożone 2026-07-20:** dodano techniczny `PlatformModule`: Zod ENV, lokalny
   `BackendEnvironmentSchema` dla kompletnej konfiguracji usługi, globalną walidację
   request/response przez natywne Standard Schema oraz wspólny kontrakt błędów z zachowaniem
   `error` oraz nowymi `errorCode`, `message` i `correlationId`, middleware
   `X-Correlation-Id` oparte o UUID/`AsyncLocalStorage`, strukturalne logi JSON i idempotentny
   `GracefulShutdownRegistry`. Registry zamyka zasoby w odwrotnej kolejności i zostanie użyte
   przez adaptery PostgreSQL, RabbitMQ i outbox w krokach 8-9. Opcje konfliktów tras z roboczej
   wersji NestJS 12 pozostają odłożone do stabilnego API w Fazie 13. Testy obejmują także brak
   wycieku szczegółów 5xx, błędny response i awarię jednego z zamykanych zasobów. Pełne
   `pnpm check`, 35 testów kontraktów, 50 testów backendu i build obrazu przechodzą.
5. **Wdrożone 2026-07-20:** przeniesiono do NestJS `/health/live`, oba aliasy readiness i
   `/config/public`. `WhiteLabelModule` ładuje jedną aktywną konfigurację przed startem,
   a techniczny `HealthModule` składa podmienialne adaptery PostgreSQL TLS i S3. Readiness
   zachowuje odpowiedzi `200`/`503`, publiczny config zachowuje silny ETag, cache-control i
   puste `304`. Próby zależności są krótkotrwałe i zamykane po każdym sprawdzeniu; stałe
   providery infrastruktury powstaną w kroku 8. Schematy health są współdzielonymi kontraktami
   Zod, a testy obu runtime'ów korzystają ze wspólnej logiki publicznej projekcji i ETag.
   Przechodzi 38 testów kontraktów i 55 testów backendu; Compose nadal używa Express.
6. **Wdrożone 2026-07-20:** przeniesiono most mTLS do Authorization oraz autoryzację ról.
   Globalny guard NestJS jest bezpieczny domyślnie; wyjątki wymagają jawnego oznaczenia trasy
   jako publicznej lub z sesją opcjonalną. Pełny Cookie i correlation ID trafiają do
   `GET /api/verify-session`, a backend ufa wyłącznie zwalidowanej odpowiedzi Authorization.
   Odrzucona sesja daje `401`, rola `403`, a niedostępność, błąd TLS lub zły kontrakt usługi
   `503`. `serviceKey` istnieje wyłącznie dla roli `sluzby` i nie pochodzi z requestu klienta.
   Wspólna polityka dostępu do zdjęć izoluje właściciela, admina oraz dokładny klucz służby;
   ten sam kod jest używany przez Express i przyszły kontroler NestJS. Agent mTLS jest
   zamykany przez lifecycle hook. Guardy obejmują role `admin`, `sluzby` i `mieszkaniec`.
   Przechodzi 39 testów kontraktów i 64 testy backendu.

7. **Wdrożone 2026-07-20:** przeniesiono wszystkie 15 tras domenowych do cienkich kontrolerów
   NestJS oraz zwykłych klas use-case bez Express i dekoratorów frameworka: 3 mieszkańca, 6
   służb i 6 admina. Wspólne schematy Zod walidują requesty i parametry, use-case'y egzekwują
   e-mail mieszkańca, aktywny katalog usług, format zdjęcia, not-found i izolację
   `serviceKey`. Semantyczny `IncidentDomainPort` nie ujawnia SQL, `pg`, S3 ani LLM.
   Do kroku 8 domyślny adapter jest jawnie fail-closed i zwraca `503` zamiast fikcyjnych
   danych; testy podmieniają wyłącznie ten port. Test HTTP wywołuje wszystkie 15 ścieżek.
   Przechodzi 41 testów kontraktów i 68 testów backendu; Compose nadal używa Express.
8. **Wdrożone 2026-07-20:** podłączono stałą pulę PostgreSQL przez PgBouncer/TLS, współdzielony
   provider-neutralny klient Object Storage, rzeczywisty `PostgresIncidentAdapter` oraz
   `GET /images/:id` w NestJS. Wszystkie operacje domenowe korzystają z bazy i storage zamiast
   tymczasowego `503`; katalog usług White-Label jest synchronizowany przed pierwszą operacją.
   Upload zachowuje transakcję metadanych/job/outbox i kompensację obiektu, a odczyt zachowuje
   politykę dostępu, ETag/304, cache-control i weryfikację checksum. Binaria pozostają wyłącznie
   w Object Storage. Pula `pg` i klient S3 są zamykane przez lifecycle. Compose nadal wskazuje
   Express do kroku 14, a przejściowy classifier zostanie skierowany do `llm_gateway` w kroku 12.
9. **Wdrożone 2026-07-20:** dodano RabbitMQ `4.3.3` jako trwały broker asynchronicznych zadań:

- osobne, wersjonowane kolejki `media.image.process.v1` i `llm.classify.v1`;
- publisher confirms, manual ACK, kontrolowany `prefetch`, retry z backoffem i DLQ;
- PostgreSQL outbox dla atomowego zapisu stanu domenowego i publikacji;
- idempotentni konsumenci odporni na co najmniej jednokrotne dostarczenie;
- wyłącznie AMQPS/TLS 1.3, quorum queues, trwały wolumen i healthcheck brokera;
- natywnie typowany `@cloudamqp/amqp-client` `4.0.0` schowany za providerami brokera;
- wersjonowana envelope z korelacją/traceparent, integracyjne testy confirms, obcej CA,
  plaintext i odzyskania outboxa po awarii oraz jednostkowe testy semantyki retry/DLQ.

Warstwa konsumencka jest używana przez handler obrazu wdrożony wraz z Sharp w kroku 11;
pełny test integracyjny obejmuje zapis WebP, retry i DLQ.

10. **Wdrożone 2026-07-21:** dodano osobny proces i kontener `media_worker` w TypeScript jako
    NestJS standalone application context. Nie ma publicznego HTTP ani Hono, współdzieli
    platformę, PostgreSQL i RabbitMQ, ale ma oddzielny lifecycle, health, log identity oraz
    limity CPU/pamięci. Od kroku 11 readiness wymaga TLS do PgBouncera, AMQPS do RabbitMQ i
    dostępu do Object Storage. Worker nie dostaje sekretów Authorization ani `RUSTFS_*`.
11. **Wdrożone 2026-07-21:** `media_worker` konsumuje zadania z kontrolowanym prefetch i używa
    przypiętego `sharp@0.35.3`. Waliduje kontrakt obiektu, rzeczywisty MIME, dekodowalność,
    limity bajtów/pikseli/wymiarów i brak animacji; normalizuje orientację, rozmiar oraz sRGB,
    usuwa metadane i zapisuje prywatny WebP przez neutralny adapter S3. Aktualizacja stanu i
    receipt są idempotentne, retry przechodzi przez 5 s/30 s/5 min, a błędy trwałe lub
    wyczerpane próby trafiają do DLQ. Integracja sprawdza cały przepływ, obiekt wynikowy,
    checksum, zachowanie oryginału, retry, DLQ oraz odzyskanie konsumenta po restarcie brokera.
12. **Wdrożone 2026-07-21:** backend komunikuje się wyłącznie z Hono `llm_gateway` przez
    stabilny kontrakt. Gateway ma własny timeout/fallback, bezpieczne logi i adapter
    OpenAI-compatible dla Docker Model Runner. Klasyfikacja nie jest wystawiona publicznie
    przez Nginx. Przejściowy adapter FastAPI usunięto po weryfikacji Fazy 7.
13. **Wdrożone 2026-07-21:** OpenAPI 3 NestJS jest generowane bez dodatkowych DTO ze
    wspólnych schematów Zod/Standard Schema i opisuje dokładnie 20 zachowywanych operacji,
    requesty, sukcesy, strukturalne `errorCode` oraz cookie auth. Równoległy `backend_nest`
    przechodzi wykonywalny kontrakt HTTP na rzeczywistych zależnościach, podczas gdy Express
    nadal przechodzi pełne 21 tras przez Nginx. Izolowana integracja potwierdza także
    lifecycle, mTLS/TLS/AMQPS, backlog siedmiu zadań, `prefetch=1`, restart workera, retry,
    DLQ, idempotencję, odzyskanie po awarii RabbitMQ oraz backup/restore.
14. **Wdrożone 2026-07-21:** Compose i domyślny obraz `backend` uruchamiają NestJS na porcie
    `3000`; Nginx sprawdza 20 tras, strukturalne błędy i OpenAPI przez publiczne `/api/*`.
    Usunięto `/protected` z manifestu i równoległy `backend_nest`. Graceful shutdown oraz
    tymczasowy powrót do Express były częścią bramki cutoveru; przejściowy override usunięto
    w kroku 15.
15. **Wdrożone 2026-07-21:** usunięto ręczny bootstrap Express, routery, middleware, parsery
    i tymczasowy override rollbacku. Manifest chroni bezpośrednio 20 tras NestJS. Usunięto
    bezpośrednie `express`, `body-parser`, `cookie-parser`, `cors` i zbędne typy. Runtime
    Express pozostaje wyłącznie zależnością oficjalnej platformy `@nestjs/platform-express`,
    a `@types/express` obsługuje jawne typy adaptera. Audyt zależności, `pnpm check`, build
    Compose i pełna integracja są końcową bramką funkcjonalną Fazy 6.
    Dlaczego po auth i storage: NestJS powinien integrowac sie juz z docelowym auth, White-Label config, PgBouncerem, RustFS i LLM gateway.

## Faza 7: LLM gateway w Hono + Node 26 + Docker Model Runner

Stan: **zakończona 2026-07-21**. Podstawowy Compose uruchamia gateway z runtime'em
`disabled`; model jest opt-in przez `docker-compose.llm.yml`. Rzeczywisty Docker Model Runner
został uruchomiony i zweryfikowany na hoście bez GPU.

1. **Wdrożone w Fazie 6:** dodać `llm_gateway` w Hono + Node 26 + TypeScript.
2. **Wdrożone w Fazie 6:** zdefiniować stabilny kontrakt wewnętrzny dla backendu:

- `QUERY /classify-incident` (od 2026-08-14; przejściowy `POST` pozostaje tylko na czas
  zgodnego rolloutu);
- `GET /health`;
- jednoznaczne odpowiedzi, np. `municipal`, `emergency`, `unknown`;
- confidence/reason opcjonalnie, ale bez kruszenia podstawowego kontraktu.

3. **Wdrożone w Fazie 6:** `llm_gateway` ma:

- obslugiwac timeouts;
- normalizowac odpowiedzi modelu;
- dawac fallback, gdy model jest niedostepny;
- logowac bledy bez ujawniania danych wrazliwych;
- byc latwy do zastapienia innym providerem.

4. **Wdrożone w Fazie 6:** zachować istniejący synchroniczny timeout i fallback jako kontrakt
   przejściowy do Fazy 14. Ostrzeżenie 112 w UI nie może zależeć od odpowiedzi modelu. Dopiero
   po stabilnym NestJS 12 Faza 14 przeniesie przyszłą kontrolę routingu do RabbitMQ.

5. **Wdrożone 2026-07-21:** ustalono konfigurację inferencji: Gemma 3 1B QAT
   `ai/gemma3-qat:1B-Q4_K_M`, temperatura `0.1`, maksymalnie `64` tokeny odpowiedzi,
   kontekst `4096`, cache KV `K=q4_0` i `V=q4_0`.
6. **Wdrożone 2026-07-21:** `docker-compose.llm.yml` aktywuje
   `LLM_RUNTIME=docker-model-runner`; bazowy Compose działa bez DMR i zachowuje fallback
   `disabled`. Backend zna nadal wyłącznie `llm_gateway`.
7. **Wdrożone 2026-07-21:** wariant używa top-level `models`; Compose wstrzykuje do gatewaya
   OpenAI-compatible URL oraz dokładną nazwę modelu. Gateway obsługuje zarówno URL
   wstrzyknięty z końcówką `/v1/`, jak i jawny URL hosta z wyborem silnika llama.cpp.
8. **Wdrożone 2026-07-21:** potwierdzono digest modelu
   `sha256:9f84c113e1f1085bddaffad1acb07c90e59487f0c7e25028f1811e71efba9599`, około
   `950.82 MiB`, kontekst `4096` i argumenty procesu `--cache-type-k q4_0
--cache-type-v q4_0`. DMR otrzymuje 5 s, backend 7 s. Test CPU zwrócił `municipal`
   w około 392 ms i `emergency` w około 296 ms; brak GPU nie blokuje działania.
9. **Wdrożone 2026-07-21:** usunięto Python, UV, FastAPI, Transformers, osobny obraz
   `llm_service`, cache Hugging Face, zmienne/token oraz zależne zasoby Compose/K8s.
   Integracja korzysta z lekkiego stubu protokołu OpenAI-compatible DMR. Gateway akceptuje
   poprawny JSON i ścisłą ramkę kodu JSON emitowaną przez Gemmę, ale odrzuca prozę i
   niepoprawny kontrakt.

Dlaczego osobny gateway: backend domenowy nie powinien znac szczegolow modelu ani runtime'u. Gateway daje granice do serverless scale-to-zero i pozniejszej wymiany providera.

## Faza 8: Frontend: React Doctor, TanStack Start i warstwa danych

1. **Wdrożone 2026-07-23:** uruchomiono pełny React Doctor `0.9.1` na bieżącym frontendzie
   i zapisano [baseline Fazy 8](phase-8-react-doctor-baseline.md). Wynik to 99 surowych
   diagnostyk: 4 błędy i 95 ostrzeżeń. TypeScript 7 oraz produkcyjny build przechodzą bez
   błędów, OxLint przechodzi z 23 ostrzeżeniami, a główny chunk JS ma `616.59 kB`.
2. **Wdrożone 2026-07-23:** naprawiono największe problemy poprawności, wydajności,
   dostępności i architektury wykryte przez React Doctor. Pełny wynik zmniejszono z
   `4 błędów / 95 ostrzeżeń / 99 razem` do `0 / 62 / 62`. Fetchowanie i mapowanie danych
   wydzielono do typowanego hooka, usunięto lustrzany stan i callbacki sterowane efektami,
   naprawiono oczekiwanie na mutacje oraz przepływ obrazu rozwiązania, a `App`, formularz
   i panel administratora podzielono na mniejsze widoki. TypeScript, OxFmt, OxLint i build
   przechodzą; szczegóły zawiera [baseline Fazy 8](phase-8-react-doctor-baseline.md).
3. **Wdrożone 2026-07-24:** zaliczono
   [bramkę gotowości TanStack Start](phase-8-tanstack-start-readiness.md).
   TanStack Start `1.168.32` jest zgodny z Node 26, React 19 i Vite 8. Wybrano
   początkowy tryb SPA, który zachowuje statyczny nginx, publiczne ścieżki Better Auth
   i NestJS oraz build-time White-Label config. Podział routów i wprowadzanie warstwy
   danych pozostają osobnymi krokami.
4. **Wdrożone 2026-07-24:** zrealizowano osobną
   [Fazę 8A: migracja UI z Radix do shadcn/Base UI](frontend-ui-migration.md):

- dodano `frontend/components.json` z `base-nova`/Base UI;
- 12 używanych wrapperów zastąpiono oficjalnymi wariantami shadcn/Base UI;
- zachowano granicę `frontend/src/components/ui` i tokeny White-Label;
- usunięto 36 nieosiągalnych wrapperów, wszystkie importy i 26 zależności Radix oraz
  osiem osieroconych bibliotek;
- zależności instalowano przez Socket Firewall i przypięto dokładnie;
- poprawiono `asChild` na `render` oraz dodano kontrakty `items` wymagane przez select Base UI;
- TypeScript, OxFmt, OxLint i build przechodzą, a pełny React Doctor zwraca `0/0/0`;
- dialog, select, checkbox, Escape i powrót fokusu przeszły test przeglądarkowy.
- pełne `CI=true pnpm check` przechodzi, w tym 159 testów Vitest i testy buildów
  White-Label.

5. **Wdrożone 2026-07-24:** po osobnym zamknięciu Fazy 8A frontend został
   zmigrowany z Vite React SPA do TanStack Start `1.168.32` z TanStack Router
   `1.170.18`:

- uruchomiono tryb SPA i dodano generowany, typowany route tree, root document oraz
  trasę indeksową;
- zachowano obecny komponent `App`; podział widoków na adresy jest nadal krokiem 6;
- zachowano same-origin `/api/auth`, `/api` i `/llm`, przy czym certyfikaty mTLS proxy
  są wczytywane tylko przez serwer developerski, a nie przez preview prerenderingu;
- build-time config przekazuje wyłącznie publiczny kontrakt White-Label i filtruje
  wyłączone usługi;
- obraz Docker serwuje `dist/client`, a nginx używa natywnego fallbacku
  TanStack Start `_shell.html`;
- readiness White-Label, dwa warianty buildów miejskich, 159 testów Vitest,
  TypeScript, OxFmt, OxLint i pełne `pnpm check` przechodzą;
- React Doctor zwraca `0/0/0`, Docker build przechodzi, a test pełnego Compose w
  przeglądarce uruchamia stronę bez błędów i ostrzeżeń konsoli.

6. **Wdrożone 2026-07-24:** dotychczasowy przełącznik widoków w `App` zastąpiono
   rzeczywistymi, typowanymi trasami TanStack Router:

- `/` — strona główna i formularz zgłoszenia;
- `/login` — logowanie;
- `/register` — rejestracja;
- `/dashboard` — przekierowanie do panelu roli albo logowania;
- `/dashboard/admin` — panel administratora;
- `/dashboard/sluzby` — panel służb;
- `/dashboard/mieszkaniec` — panel mieszkańca.

Bezścieżkowy layout `_app` utrzymuje jedną instancję sesji Better Auth, danych
incydentów, dialogów i globalnych powiadomień podczas nawigacji. Wszystkie przejścia
korzystają z typowanego `useNavigate`, a odświeżenie i bezpośrednie wejście zachowują
adres widoku. Na tym etapie nieautoryzowany użytkownik jest kierowany do logowania,
a użytkownik niewłaściwej roli do własnego panelu na granicy komponentu. Przeniesienie
tych reguł do `beforeLoad`, loaderów i kontekstu routera pozostaje świadomie zakresem
kroku 7. Build tworzy osobne chunki tras; TypeScript, OxFmt, OxLint, React Doctor
`0/0/0` oraz testy wejść bezpośrednich przez nginx przechodzą.

7. **Wdrożone 2026-07-24:** kontrolę dostępu i dane sesji przeniesiono do
   TanStack Router:

- root route deklaruje typowany `AppRouterContext`, a instancja routera wstrzykuje
  adapter sesji Better Auth;
- layout `/dashboard` sprawdza sesję w asynchronicznym `beforeLoad`, zanim zostanie
  uruchomiony loader lub wyrenderowany panel;
- `beforeLoad` tras administratora, służb i mieszkańca egzekwuje dokładną rolę,
  a próbę wejścia do cudzego panelu przekierowuje do panelu zalogowanego użytkownika;
- `/dashboard` wybiera docelowy panel bez komponentowego `<Navigate>`;
- loadery przekazują trasom typowane dane zalogowanego użytkownika; panel mieszkańca
  i służb pobiera z loadera e-mail, status weryfikacji i przypisanie służby;
- login waliduje `redirect` jako lokalny URL tego samego originu, zachowuje zamierzoną
  trasę po uwierzytelnieniu i odrzuca adresy absolutne, protocol-relative oraz warianty
  z backslashem;
- po logowaniu, rejestracji i wylogowaniu wywoływane jest `router.invalidate()`, dzięki
  czemu guardy nie korzystają ze starego stanu sesji;
- usunięto komponentowe granice ról z `route-views`; autoryzacja następuje przed
  renderowaniem widoku, lecz ostatecznym źródłem bezpieczeństwa nadal pozostaje NestJS;
- dodano 11 testów Vitest dla bezpiecznego adresu powrotu i routingu ról. Łącznie
  monorepo wykonuje 170 testów.

Pobieranie incydentów pozostawało świadomie poza tym krokiem, aby w kroku 8 przenieść
je bezpośrednio do TanStack Query bez tworzenia tymczasowej, drugiej warstwy cache.

8. **Wdrożone 2026-07-24:** TanStack Query `5.101.4` stał się standardem dla stanu
   serwerowego, cache, invalidacji i stanu mutacji:

- `QueryClient` jest tworzony na instancję routera i dostępny w jego typowanym kontekście;
- ręczne pobieranie przez `useEffect` oraz lokalne kopie cache incydentów zostały usunięte;
- odczyty publiczne, mieszkańca, administratora i służb używają centralnych query options;
- tworzenie zgłoszenia oraz operacje administratora i służb używają `useMutation`;
- prywatne klucze zawierają właściciela sesji, a prywatny cache jest usuwany przy wylogowaniu;
- zapis aktualizuje właściwy cache, a następnie invaliduje domenę incydentów;
- wersję przypięto dokładnie po weryfikacji wieku ponad 48 godzin i instalacji przez SFW;
- dodano siedem testów jednostkowych warstwy Query; łącznie monorepo wykonuje 177 testów.

Szczegóły i granice względem loaderów z kroku 11 opisuje
[dokument wdrożenia TanStack Query](phase-8-tanstack-query.md).

9. **Zamknięte decyzją 2026-07-24 — TanStack Table obecnie porzucony.** Bieżące widoki
   prezentują incydenty jako karty i wymagają jedynie prostego filtrowania, sortowania
   oraz „pokaż więcej”. Dodanie modelu kolumn i wierszy nie przyniosłoby teraz korzyści
   proporcjonalnej do złożoności, dlatego nie instalujemy `@tanstack/react-table`.
   Do decyzji można wrócić dopiero po pojawieniu się rzeczywistego widoku tabelarycznego,
   paginacji lub sortowania po stronie serwera, operacji zbiorczych, konfigurowalnych
   kolumn, eksportu albo wirtualizacji dużych zbiorów. Faza 8 przechodzi do kroku 10.

10. **Wdrożone 2026-07-24:** TanStack Form `1.33.2` i Zod `4.4.3` stanowią wspólny
    standard wszystkich formularzy zapisujących dane użytkownika:

- zmigrowano logowanie, rejestrację, tworzenie zgłoszenia, dwie operacje uprawnień,
  przypisanie i aktualizację administratora oraz aktualizację służby;
- Zod odpowiada za walidację i normalizację, TanStack Form za wartości, błędy,
  `canSubmit`, reset i `isSubmitting`, a TanStack Query za mutacje domenowe i cache;
- każde pole ma jawną wartość początkową; brak obrazu jest reprezentowany przez `null`;
- adresy e-mail i tekst są normalizowane dopiero przez jawne `schema.parse` w `onSubmit`;
- usługi są sprawdzane względem aktywnego White-Label config, a statusy względem
  `@zglosto/contracts`;
- upload dopuszcza tylko PNG/JPEG do 5 MiB, pokazuje komunikat przed wysłaniem zbyt dużego
  pliku i odrzuca między innymi SVG;
- plik jest wysyłany binarnie przez presigned PUT, a JSON zawiera jednorazowy `uploadId`;
- Sharp tworzy WebP quality 85 z dłuższym bokiem maksymalnie 2000 px, po czym worker
  trwale usuwa oryginał i ponawia nieudany cleanup;
- błędy pól mają `aria-invalid`, `aria-describedby` oraz wspólny, bezpieczny renderer;
- pola pozostają edytowalne po nieudanej walidacji, a ich błędy znikają po poprawieniu
  wartości; przycisk zapisu blokuje nieprawidłowe i trwające wysłanie;
- walidacja serwerowa pozostaje obowiązkowa i nie jest zastępowana walidacją przeglądarki;
- zależności przypięto dokładnie po kontroli wieku ponad 48 godzin i instalacji przez SFW;
- dodano 12 testów schematów; łącznie monorepo wykonuje 189 testów.

Szczegóły opisuje [dokument wdrożenia TanStack Form i Zod](phase-8-tanstack-form.md).

11. **Wdrożone 2026-07-24:** prefetching publicznych i prywatnych zgłoszeń został
    przeniesiony do loaderów TanStack Router:
    - strona główna oraz panele mieszkańca, administratora i służby wykonują
      `queryClient.ensureQueryData`;
    - loadery i komponenty współdzielą te same typowane fabryki `queryOptions`, a `useQuery`
      pozostaje jedyną warstwą odczytu cache;
    - prywatny loader działa dopiero po sprawdzeniu sesji i dokładnej roli w `beforeLoad`,
      a klucz nadal zawiera właściciela sesji;
    - pomyślny prefetch nie powoduje drugiego requestu po renderze komponentu;
    - gałąź `_app` ma jawne `ssr: false`, więc loadery obecnego trybu SPA wykonują się
      wyłącznie w przeglądarce i nie uruchamiają API podczas builda/prerenderingu;
    - błąd loadera zachowuje App Shell i udostępnia ponowienie przez `router.invalidate()`;
    - mutacje nadal aktualizują aktywny cache i invalidują całą domenę incydentów;
    - nie dodano server functions ani drugiej warstwy danych;
    - dodano sześć testów prefetchingu, izolacji, endpointów ról, invalidacji i guardu;
      łącznie monorepo wykonuje 195 testów.

Szczegóły opisuje [dokument TanStack Query](phase-8-tanstack-query.md).

12. **Wdrożone 2026-07-24:** NestJS pozostaje jedynym API domenowym, a granica frontendu
    jest egzekwowana przez `pnpm check:source`:
    - frontend korzysta z same-origin `/api`, `/api/auth` i publicznych pakietów kontraktów;
    - manifest oraz źródła nie mogą zależeć od sterowników bazy, ORM, klientów S3/Object
      Storage, RabbitMQ ani implementacji innych usług workspace;
    - frontend nie może odczytywać sekretów PostgreSQL, PgBouncera, S3/RustFS ani RabbitMQ
      oraz nie może zawierać ich wewnętrznych URI;
    - `createServerFn`, moduły server-only i pliki `*.server.ts(x)` są dozwolone wyłącznie
      w zarezerwowanym `frontend/src/server/bff`;
    - nawet BFF nie może importować infrastruktury domenowej i może jedynie składać lub
      proxy'ować istniejące kontrakty HTTP;
    - dodano pozytywne i negatywne fixture polityki dla klienta HTTP, `pg`, SDK S3,
      `DATABASE_URL` i lokalizacji server function;
    - klient React Native/Expo nadal zależy od NestJS i Authorization, a nie od prywatnych
      server functions TanStack Start.

Szczegóły opisuje [kontrakt granicy frontendu](frontend-domain-boundary.md).

13. **Wdrożone 2026-07-24:** domknięto integrację White-Label we frontendzie:
    - publiczna projekcja jednego YAML-a pozostaje walidowana i osadzana podczas buildu;
    - jeden typowany model prezentacyjny udostępnia nazwę i stabilny klucz miasta, logo
      z lokalizowanym tekstem alternatywnym oraz posortowany katalog aktywnych służb;
    - nagłówek, emblemat, formularze i panele korzystają z tego modelu bez lokalnych kopii
      danych miasta lub katalogu służb;
    - po zmianie z 2026-07-27 model frontendowy nie udostępnia ustawień mapy, a aktywne
      YAML-e mają `features.map: false` i `map: null`;
    - testy rzeczywistych konfiguracji ZgłosTO, Wrocławia i Gdańska pokrywają tożsamość
      miasta, branding i katalog służb bez mapy.

Szczegóły opisuje
[dokument integracji White-Label we frontendzie](phase-8-white-label-integration.md).

14. **Zmienione 2026-07-27:** wycofano opcjonalną warstwę mapową z formularza:
    - usunięto Leaflet, React Leaflet, ich typy, komponenty oraz tłumaczenia mapy;
    - mieszkaniec podaje wyłącznie wymagany adres tekstowy, a współrzędne są wysyłane jako
      `null`;
    - administrator i użytkownik służby widzą klikalny adres otwierający Google Maps
      w trybie wyznaczania trasy;
    - cel trasy składa się z adresu i nazwy miasta z White-Label, a brak punktu początkowego
      pozwala Google Maps użyć lokalizacji urządzenia;
    - integracja korzysta ze standardowego Maps URL, bez osadzonego SDK, klucza API,
      geokodowania i billingu.

Szczegóły opisuje [dokument warstwy mapowej](phase-8-map-layer.md).

15. **Wdrożone 2026-07-24:** zachowano obecne tokeny i kierunek wizualny design systemu,
    bez utrzymywania Radix jako szczegółu implementacji:
    - shadcn pozostaje skonfigurowany jako `base-nova` na Base UI, a importy Base UI są
      zamknięte w lokalnych wrapperach `frontend/src/components/ui`;
    - usunięte Radix UI jest objęte trwałym zakazem zależności, importów i zmiennych CSS;
    - tokeny White-Label `brand-*` zachowano, a stany ujednolicono przez semantyczne
      `destructive`, `success` i `warning` wraz z wariantami tekstu;
    - komponenty przestały używać surowych palet `red-*`, `green-*` i `amber-*` dla
      stanów;
    - `pnpm check:source` egzekwuje konfigurację shadcn, granicę wrapperów, obecność
      tokenów i zakaz regresji przez pozytywne oraz negatywne fixture.

Szczegóły opisuje [kontrakt design systemu](phase-8-design-system.md).

16. **Wdrożone 2026-07-24 — Faza 8 zakończona:** na początku widoku dodawania zgłoszenia
    umieszczono stale widoczną informację, niezależną od dostępności i odpowiedzi LLM:
    „ZgłosTO nie służy do obsługi sytuacji alarmowych. Jeśli występuje bezpośrednie
    zagrożenie życia, zdrowia, mienia lub bezpieczeństwa, zadzwoń pod numer 112.”
    - wspólny katalog i18n zawiera równoważne wersje polską i angielską;
    - komunikat reaguje na zmianę języka bez przeładowania widoku;
    - nota nie zawiera pytania ani potwierdzenia i nie blokuje wysłania formularza;
    - test komponentu w obu językach sprawdza treść, semantykę i brak interaktywnego
      potwierdzenia;
    - przed zamknięciem fazy Authorization przeniesiono z ręcznie odtwarzanych
      `__filename`/`__dirname` na natywne `import.meta.dirname` Node 26, dzięki czemu
      pełny OxLint przechodzi bez ostrzeżeń.

Szczegóły opisuje [kontrakt stałej informacji 112](phase-8-emergency-notice.md).

Dlaczego po backend/gateway kontraktach: TanStack Start powinien celowac w stabilne API i stabilny White-Label config.

## Faza 9: Trzy profile wdrożeniowe, K8s/K3s i autoskalowanie

**Status:** zakończona; kroki 1-11 wdrożone 2026-07-24. Produkcyjny kandydat Compose jest
opisany w [dokumencie kroku 2](phase-9-step-2-production-compose.md). Szczegółowa kolejność, bramki każdego obszaru,
testy oraz kryteria ukończenia znajdują się w
[planie wykonawczym Fazy 9](phase-9-execution-plan.md). Poniższa lista pozostaje
zestawieniem wymagań zakresu.

1. **Wdrożone 2026-07-24:** zdefiniowano wspólną, maszynowo sprawdzaną macierz dla Docker
   Compose, Kubernetes i K3s:
   - identyczne obrazy, wersje, kontrakty API, White-Label, migracje i telemetryka;
   - identyczne wymagania TLS/mTLS, backupu, restore i ochrony danych;
   - jawnie różne mechanizmy HA, rolloutów, sekretów, storage i autoskalowania;
   - Compose jako wspierany profil pojedynczego hosta, bez obietnicy odporności na awarię
     całego hosta.
   - przyjęto Kustomize `base + overlays/kubernetes + overlays/k3s`;
   - dodano jednolite etykiety, dedykowane ServiceAccount i walidację renderowania;
   - bramka odrzuca `latest`, jawne Secret i historyczne komponenty;
   - baseline zapisał brakujące workloady jawnie; zostały uzupełnione w kroku 6.

   Szczegóły: [baseline Fazy 9 / kroku 1](phase-9-step-1-deployment-baseline.md).

2. Dodać produkcyjny override Compose bez lokalnego `build`, bind mountów kodu i
   developerskich wartości domyślnych. Profil używa przypiętych obrazów, restart policies,
   limits, rotacji logów, secrets, HTTPS, hardeningu kontenerów oraz automatyzacji hostowej.
3. Utrzymać ogólną ścieżkę Kubernetes i dodać K3s jako lżejszy runtime produkcyjny.
4. **Wdrożone 2026-07-24:** zaktualizowano konfigurację K8s/K3s:

- publiczne runtime ENV i White-Label są generowane jako immutable ConfigMapy z hashem;
- Authorization i backend montują ten sam `/app/config/city.yaml`;
- `deploy/cluster-secret-contract.json` opisuje zewnętrzne Secrety bez ich wartości;
- sekrety są nieopcjonalnymi plikami read-only, a bramka odrzuca `secretKeyRef`, `envFrom`
  oraz sekrety w ConfigMapach;
- `pnpm check:cluster-config` waliduje oba profile.

  Szczegóły: [konfiguracja i sekrety Fazy 9 / kroku 4](phase-9-step-4-cluster-configuration.md).

  Zestaw workloadów uzupełniony w kroku 6 obejmuje:

- `frontend`;
- `authorization`;
- `backend`;
- `media_worker`;
- `llm_gateway`;
- `postgres`;
- `pgbouncer`;
- `rustfs`;
- opcjonalny `model_runner`;
- `nginx` albo Ingress Controller.

5. Utrzymać wykonane usunięcie `pgadmin` ze wszystkich trzech profili.
6. Dodać konfigurację White-Label i sekrety właściwe dla profilu:

- nazwa miasta;
- logo/sciezka do logo;
- lista aktywnych sluzb;
- adresowy model lokalizacji bez osadzonej mapy;
- bezpieczne rozdzielenie danych publicznych i sekretow.

7. Ujednolicić nazwy usług, porty i zmienne środowiskowe między profilami.
8. Zaktualizować healthchecki/probes dla Node 26 i endpointów `/health`.
9. **Wdrożone 2026-07-24:** dodano usługi stanowe i trwały storage:

- PostgreSQL i RabbitMQ działają jako StatefulSety z retencją PVC `Retain/Retain`;
- PgBouncer ma dwie repliki, prywatny Service i PDB;
- aplikacje używają `DATABASE_URL` przez PgBouncera, bez dostępu do direct URL;
- pgBackRest ma osobny wolumen i scheduler backupów;
- domyślne profile używają zewnętrznego S3, a osobne overlaye opcjonalnie dodają RustFS;
- kontrakt i cztery rendery sprawdza `pnpm check:cluster-stateful`.

  Cache modeli pozostaje zakresem kroku runtime/LLM, a pełny restore drill Fazy 12.
  Szczegóły: [usługi stanowe Fazy 9 / kroku 5](phase-9-step-5-stateful-services.md).

9a. **Wdrożone 2026-07-24:** uzupełniono workloady i routing klastrowy:

- osobny `media-worker` uruchamia entrypoint Sharp z obrazu backendu i nie ma Service;
- wszystkie workloady mają dedykowane ServiceAccount, probes i zasoby;
- PDB chronią krytyczne lub wieloreplikowe warstwy;
- publiczny Ingress prowadzi do prywatnego Nginx, który zachowuje same-origin.

  Szczegóły: [workloady i routing Fazy 9 / kroku 6](phase-9-step-6-workloads-routing.md).

10. Zaktualizować izolację sieciową: osobne sieci i firewall hosta dla Compose oraz
    default-deny NetworkPolicy dla K8s/K3s:

- frontend -> auth/backend;
- backend -> auth/pgbouncer/rustfs/llm_gateway;
- llm_gateway -> model_runner;
- ruch do Postgresa tylko przez PgBouncer, poza migracjami/administracja;
- brak pgAdmin.

  **Wdrożone dla K8s/K3s 2026-07-24:** cert-manager utrzymuje rozdzielone CA i
  certyfikaty leaf, Stakater Reloader propaguje rotację, a default-deny NetworkPolicy
  dopuszcza tylko wymagane przepływy. Publiczny certyfikat wymaga zewnętrznego
  `ClusterIssuer/zglosto-public-issuer`. Szczegóły:
  [TLS/mTLS i izolacja Fazy 9 / kroku 7](phase-9-step-7-cluster-transport-security.md).

11. Dodać resource limits we wszystkich profilach oraz HPA/PDB w K8s/K3s.
12. **Wdrożone 2026-07-24:** dla `media_worker` dodano KEDA `ScaledObject` w K8s/K3s,
    a Compose zachowuje jawny kontrakt
    stałej lub ręcznie zmienianej liczby replik:

- utrzymywać co najmniej jedną i najwyżej cztery repliki;
- zachować `MEDIA_WORKER_PREFETCH=1` i `MEDIA_SHARP_CONCURRENCY=1` w każdej replice;
- osiągnięcie czterech oczekujących zdjęć uruchamia drugą replikę; podczas jej startu czwarty
  element może być nadal obsługiwany przez pierwszą;
- docelowy stan to 1 replika dla backlogu `0-3`, 2 dla `4-7`, 3 dla `8-11` i 4 od `12` wzwyż;
- traktować granice jako politykę desired replicas, a nie gwarancję natychmiastowego startu;
- nie używać scale-to-zero w profilu podstawowym; opcjonalny profil `minReplicaCount: 0` może
  powstać później dla środowisk testowych lub instalacji o bardzo małym ruchu;
- skalować w górę szybko; jeżeli przez pełne 180 sekund backlog pozostaje w zakresie
  wystarczającym dla jednej repliki (`0-3` oczekujące zdjęcia), ustawić desired replicas na
  `1`; okno musi rozpocząć się od nowa po każdym ponownym przekroczeniu progu;
- zrealizować okno `N -> 1` przez zachowanie HPA z
  `scaleDown.stabilizationWindowSeconds: 180`, ponieważ `cooldownPeriod` KEDA steruje
  zejściem do zera, a profil podstawowy ma `minReplicaCount: 1`;
- nie zakładać, że zwykłe `QueueLength value: 4` odwzoruje dokładnie granicę `4`; wdrożyć
  i przetestować funkcję `min(floor(backlog / 4) + 1, 4)` przez KEDA
  `scalingModifiers`, metrykę Prometheus albo równoważny adapter;
- podczas skalowania w dół nie przerywać wiadomości oczekujących na manual ACK i zakończyć
  aktywne zadanie w ramach graceful shutdown;
- ograniczyć maksymalną liczbę replik także budżetem CPU/RAM, pulą PgBouncera, RabbitMQ i
  przepustowością Object Storage;
- przed produkcją potwierdzić progi testem obciążeniowym i monitorować backlog, wiek najstarszej
  wiadomości, czas obróbki, retry/DLQ, CPU oraz pamięć.

13. **Wdrożone 2026-07-24:** `llm_gateway` używa KEDA HTTP Add-on 0.15.0,
    `InterceptorRoute` v1beta1 i skali `0-4` w K8s/K3s. Compose utrzymuje jedną replikę
    gatewaya albo wyłącza LLM.
14. Wybrano KEDA HTTP Add-on. Knative Serving odrzucono, ponieważ tworzyłby drugi,
    cięższy stos operacyjny, szczególnie dla K3s. Przed-1.0 linia dodatku i API v1beta1
    są przypięte wersją i podlegają końcowej certyfikacji w Fazie 12.
15. Zastosowane kryteria wyboru:

- kompatybilnosc z K3s;
- prostota operacyjna;
- cold start;
- obsluga HTTP;
- obserwowalnosc;
- latwosc lokalnego testu.

16. **Spełnione:** `backend` toleruje cold start albo brak gatewaya:

- timeout;
- retry z limitem;
- fallback klasyfikacji;
- brak blokowania zapisu zgloszenia.

17. Dla zwykłych usług zachować klasyczne Deployment/HPA w klastrach i stałe repliki w
    Compose, chyba że pomiary uzasadnią inny model.
18. Opisać strategię wdrożenia każdego profilu:

- stan obecny;
- zasoby usuwane;
- zasoby dodawane;
- różnice Compose vs K8s vs K3s;
- smoke test po wdrozeniu.

19. Wdrożyć produkcyjne zarządzanie certyfikatami zgodnie z ADR-029:
    - Compose: automatyzacja hostowa ACME/PKI, montowane secrets i procedura bezpiecznego
      reload/restart;
    - K8s/K3s: cert-manager albo równoważny kontroler;
    - oddzielne Service CA i Database CA;
    - cert-manager lub rownowazna automatyzacja wystawiania i rotacji;
    - osobne certyfikaty klienta dla backendu i Nginx;
    - certyfikaty serwera z SAN `authorization`, `pgbouncer` i `database`;
    - prywatne klucze w Secret/CSI, nigdy w obrazach ani ConfigMap;
    - NetworkPolicy zgodne z dozwolonymi tozsamosciami i przeplywami.

Dlaczego tylko gateway: to najbardziej naturalny kandydat do scale-to-zero, bo jest bocznym
adapterem do LLM i moze byc uruchamiany na zadanie.

20. **Wdrożone 2026-07-24:** fundament obserwowalności we wszystkich trzech profilach
    zgodnie z ADR-036 i
    [architekturą obserwowalności](observability.md):
    - ujednolicić strukturalne logi JSON do `stdout`/`stderr` dla backendu, Authorization,
      `llm_gateway` i `media_worker`;
    - usunąć `authorization/auth_log.txt` oraz plikowe logowanie z procesu Authorization;
    - dodać OpenTelemetry SDK i propagację W3C `traceparent` przez REST, mTLS i RabbitMQ;
    - uruchomić OpenTelemetry Collector w Compose, Kubernetes i K3s;
    - dodać Prometheus dla metryk, Loki dla logów, Tempo dla śladów, Grafanę dla wizualizacji
      i Alertmanager dla alertów;
    - dodać podstawowe metryki, eksportery i dashboardy developerskie;
    - przetestować, że awaria telemetryki nie blokuje produktu;
    - nie umieszczać danych osobowych, sekretów ani identyfikatorów wysokiej kardynalności
      w metrykach i logach operacyjnych.

    Wynik: `@zglosto/observability`, strukturalny JSON, OTLP/HTTP, W3C Trace Context,
    podstawowe metryki, lokalny stos Grafana oraz Collector eksportujący do zewnętrznego
    OTLP działają w Compose, Kubernetes i K3s. Dostępne są dokładnie tryby `disabled`,
    `external` i `local`; `both` jest zabroniony. Kontrakt i testy opisuje
    [Faza 9 / krok 8](phase-9-step-8-observability.md).

21. **Wdrożone i zweryfikowane 2026-07-24:** Fazę 9 zamyka wspólna automatyzacja
    deploymentu. Wszystkie 12 overlayów przeszło walidację statyczną i kubeconform bez
    błędów, a pełne scenariusze runtime zakończyły się powodzeniem na Compose/OrbStack,
    Kind/Kubernetes 1.35.0 oraz dwuwęzłowym K3d/K3s 1.36.2. Smoke obejmuje routing,
    granicę auth, PKI/KEDA, trwałość PostgreSQL, odtwarzanie podów i rollout po aktualizacji
    Secretu TLS. Szczegóły:
    [Faza 9 / krok 11](phase-9-step-11-deployment-tests.md).

## Faza 10: Redis, lokalny rate limiting i cache publicznej listy

Decyzję zamknięto 2026-07-25 na korzyść Redisa. PostgreSQL `UNLOGGED TABLES` nie będą
cache’em strony głównej ani magazynem rozproszonego rate limitingu. RabbitMQ nadal jest
brokerem trwałych zadań, PostgreSQL pozostaje źródłem prawdy, a sesje Better Auth nie są
przenoszone do Redisa.

Obsługiwane tryby:

- `disabled`: Redis nie działa, lecz lokalny limiter pozostaje obowiązkowy; pojedynczy
  Compose cache’uje publiczną listę w Nginx przez `900 s`;
- `local`: profil dostarcza Redis; lokalny limiter działa razem z limiterem rozproszonym,
  publiczny cache Redis ma TTL `900 s`, a Nginx microcache `30 s`;
- `external`: identyczny kontrakt aplikacyjny, ale Redis jest dostarczany zewnętrznie.

Kroki wykonawcze:

1. **Wdrożone 2026-07-25:** ADR-010 jest zamknięty; dodano typowany i testowany kontrakt
   trybów, timeoutów, sekretów, TTL cache’u oraz jawnych progów limiterów dla Authorization
   i backendu.
2. **Wdrożone 2026-07-25:** zawsze aktywny, ograniczony pamięciowo limiter lokalny chroni
   endpointy Authorization oraz publiczny zapis zgłoszenia. Używa zegara monotonicznego,
   okresowego sprzątania, HMAC identyfikatorów i jawnej liczby zaufanych hopów proxy;
   zwraca `429` z `Retry-After`.
3. **Wdrożone 2026-07-25:** dodano `@zglosto/transient-store` — provider-neutralny port
   cache’u, atomowego `increment` z TTL i dzierżaw oraz adapter oficjalnego klienta
   `redis@6.1.0`. Adapter używa atomowych skryptów Lua, pełnych timeoutów komend,
   plików sekretów i weryfikowanego TLS/SNI; błędy nie ujawniają adresu ani poświadczeń.
   Podłączenie do funkcji aplikacyjnych pozostaje krokami 4-6.
4. **Wdrożone 2026-07-25:** Better Auth używa jawnych reguł i pamięci w `disabled` oraz
   atomowego Redis `rateLimit.customStorage` w `local`/`external`. Nie używa globalnego
   `secondaryStorage`, ponieważ w Better Auth 1.6 przeniosłoby ono również odczyty sesji;
   sesje pozostają wyłącznie w PostgreSQL. `429` ma standardowy `Retry-After` i `no-store`.
5. **Wdrożone 2026-07-25:** `POST /api/mieszkaniec/incydenty` ma po lokalnym limiterze
   rozproszone liczniki globalny, IP i zalogowanego użytkownika. Tożsamości są HMAC-owane
   wspólnym sekretem z pliku, odpowiedź używa wspólnego kontraktu `RATE_LIMITED`, a awaria
   Redis degraduje ochronę do obowiązkowego limitera lokalnego.
6. **Wdrożone 2026-07-25:** `GET /api/mieszkaniec/incydenty/glowna` używa cache-aside
   Redis z TTL `900 s`, walidacją wspólnego kontraktu i kluczem zależnym od wersji, ETagu
   konfiguracji miasta oraz rewizji. Lokalny single-flight i rozproszona dzierżawa
   ograniczają stampede. Zmiana statusu, służby lub zdjęcia rozwiązania zwiększa rewizję,
   a awaria cache zawsze degraduje odczyt do PostgreSQL i nie cofa mutacji.
7. **Wdrożone 2026-07-25:** migracja `010` i inicjalizacja nowej bazy tworzą częściowy
   indeks B-tree rekordów `resolved`, zgodny z `DESC NULLS LAST`, deterministycznym UUID
   oraz `LIMIT 15` publicznego zapytania.
8. **Wdrożone 2026-07-25:** dokładna lokalizacja publicznego endpointu w Nginx używa
   ograniczonego cache’u, `proxy_cache_lock`, `X-Cache-Status` i TTL przekazywanego przez
   backend jako `X-Accel-Expires`: `900 s` w `disabled`, `30 s` w `local`/`external`.
   Credentials są usuwane przed upstream, a mutacje, błędy i `Set-Cookie` nie trafiają do
   cache’u.
9. **Wdrożone 2026-07-25:** dostarczono `local` i `external` dla Compose, Kubernetes i
   K3s wraz z plikowymi sekretami, ACL, NetworkPolicy, healthcheckami lokalnego Redis oraz
   automatycznym testem parytetu `pnpm check:redis`. Lokalny Redis 8.10.0 przechowuje
   wyłącznie odtwarzalne dane w pamięci; profil zewnętrzny wymaga `rediss://` i
   zweryfikowanego CA.
10. **Wdrożone i zweryfikowane 2026-07-25:** Authorization i backend raportują awarię
    wyłącznie Redisa jako `200` + `status: degraded`, zachowując lokalny limiter i fallback
    publicznego odczytu do PostgreSQL. Dodano metryki stanu, wyników i opóźnień operacji,
    alerty Prometheus, panele Grafany oraz maszynowy kontrakt odporności. Test
    `pnpm test:redis-failure` potwierdza sekwencję `ok -> degraded -> ok`, działanie odczytu
    podczas awarii i ponowne połączenie obu usług po restarcie Redisa.
11. **Wdrożone 2026-07-25:** dodano operatorski
    [runbook Redis](redis-operations.md), zsynchronizowano statusy roadmapy, audyt
    architektury, healthchecki, zmienne środowiskowe oraz instrukcje Compose/Kubernetes/K3s.
    Runbook obejmuje profile, sekrety i ACL, `degraded`, telemetrię, procedurę awarii,
    automatyczne odzyskanie i bezpieczny test. Faza 10 jest zakończona 11/11.

Znormalizowany e-mail jest sygnałem telemetrycznym, nie samodzielnym twardym kluczem
blokującym. Progi limitów są konfigurowalne, a ich finalne strojenie oraz przepustowość
pojedynczego Nginx pozostają bramką load testów Fazy 12. Szczegółowy kontrakt:
[phase-10-redis-cache-rate-limiting.md](phase-10-redis-cache-rate-limiting.md).

## Faza 11: Obrazy i produkcyjny profil Docker Compose

Status: **14/14 kroków wykonanych — Faza 11 zakończona**. Szczegóły:
[audyt obrazów i kontekstów builda](phase-11-image-audit.md) oraz
[kontrakt i budżety obrazów](phase-11-step-2-image-contract.md), a także
[wdrożenie obrazów runtime z kroków 3–8](phase-11-steps-3-8-runtime-images.md) oraz
[produkcyjny build ze źródeł](phase-11-step-9-source-build-plan.md).

1. **Wdrożone 2026-07-26:** zinwentaryzować Dockerfile, obrazy bazowe, konteksty,
   warstwy, rozmiary, użytkowników, entrypointy, healthchecki, zawartość runtime oraz
   obecny pipeline. Audyt wskazał usługi Node jako główne źródło narzutu i nie znalazł
   sekretów w finalnych obrazach.
2. **Wdrożone 2026-07-26:** ustalono maszynowe budżety rozmiaru i czasu builda,
   dwa poziomy egzekwowania, dozwoloną zawartość runtime oraz wspólny kontrakt
   bezpieczeństwa i platform dla ośmiu unikalnych artefaktów. Bramka baseline
   działa w `pnpm check:source`, a target będzie wymagana do zamknięcia fazy.
3. **Wdrożone 2026-07-26:** przygotowano wspólny wzorzec builda Node z `pnpm fetch`,
   cache BuildKit, minimalnym artefaktem, nie-root, sygnałami i targetami.
4. **Wdrożone 2026-07-26:** zastosowano wzorzec do `authorization`; runtime nie zawiera
   źródeł, lockfile ani narzędzi buildowych i mieści się w budżecie 260 MB.
5. **Wdrożone 2026-07-26:** zastosowano wzorzec do wspólnego obrazu
   `backend`/`media_worker`; zachowano Sharp, migracje i osobne komendy, a test wykonał
   rzeczywistą konwersję WebP.
6. **Wdrożone 2026-07-26:** zastosowano wzorzec do `llm_gateway`; zachowano adaptery
   disabled, lokalnego DMR i zewnętrznego providera oraz kontrolowaną degradację.
7. **Wdrożone 2026-07-26:** frontend działa jako nie-root na porcie `8080`; potwierdzono
   assety, readiness White‑Label i routing SPA na read-only rootfs.
8. **Wdrożone 2026-07-26:** utwardzono Nginx, PostgreSQL, PgBouncer i RabbitMQ bez
   naruszania trwałości, backupów, TLS/mTLS i healthchecków. PgBouncer działa stale jako
   UID 70 bez `su-exec`, a oba Nginx-y jako UID 101 bez capabilities.
9. **Wdrożone 2026-07-26:** zbudowano powtarzalny produkcyjny pipeline
   **lokalnego builda ze źródeł**. Host docelowy
   buduje natywnie osiem obrazów ZgłosTO dla własnej architektury (`amd64` albo `arm64`),
   bez centralnego registry, QEMU i GitHub-hosted runners. Build zapisuje wersję/revision,
   ID lokalnych obrazów, SBOM oraz wyniki lokalnego skanu podatności i sekretów. Metadane
   wydania pozostają w manifeście, a etykiety obrazów są odroczone do rzeczywistego CI/CD.
   Trivy 0.72.0 blokuje sekrety i naprawialne `CRITICAL`, generuje CycloneDX,
   a czysty test `linux/arm64` przeszedł dla wszystkich ośmiu obrazów. Szczegóły:
   [Faza 11 / krok 9](phase-11-step-9-source-build-plan.md).
10. **Wdrożone 2026-07-26:** produkcyjny Compose korzysta z wygenerowanego `images.env`
    i manifestu ośmiu lokalnych obrazów, które mają `pull_policy: never`. Modułowy
    selektor obsługuje 54 kombinacje: RustFS jest domyślnym Object Storage, zewnętrzny
    S3/R2 ma jawny egress, a Redis, obserwowalność i LLM zachowują niezależne tryby
    `disabled`, `local` oraz `external`. Zewnętrzny LLM używa adaptera
    OpenAI-compatible z kluczem montowanym jako plik. Szczegóły:
    [Faza 11 / krok 10](phase-11-step-10-production-compose-modules.md).
11. **Wdrożone 2026-07-26:** domknięto hardening opcjonalnych kontenerów: read-only
    rootfs, ograniczone tmpfs, drop wszystkich capabilities, `no-new-privileges`, jawni
    użytkownicy, limity, healthchecki, graceful shutdown i rotacja logów. Dodano
    firewall nftables z publicznym HTTPS i SSH ograniczonym do CIDR administratora oraz
    utwardzoną jednostkę systemd.
12. **Wdrożone 2026-07-26:** automatyzacja hostowa realizuje
    `validate -> backup -> migrate -> wait -> smoke -> promote`, ma prywatny lock z PID,
    retencję backupów, atomową promocję, odtworzenie ostatniego wydania po błędzie
    kandydata, rotację certyfikatów i start po restarcie. Po promocji zostają wyłącznie
    obrazy aktywnego wydania; migracje nie są automatycznie cofane.
13. **Wdrożone 2026-07-26:** dodano lokalne bramki `static`, `validate` i chronioną
    `runtime`, negatywne testy polityk oraz maszynowy kontrakt wydania. Pełna macierz 54
    kombinacji jest renderowana statycznie. Projekt nie wymaga GitHub-hosted runnera;
    rzeczywiste testy runtime/restore są uruchamiane na dedykowanym hoście akceptacyjnym.
14. **Wdrożone 2026-07-26:** dodano
    [runbook produkcyjnego Compose](production-compose-runbook.md),
    [handoff obrazów do K3s](k3s-local-images-handoff.md),
    [podsumowanie dowodów](phase-11-completion.md) i maszynowy kontrakt 14/14.
    Compose jest profilem głównym, K3s opcjonalnym następnym profilem, a rozbudowany
    Kubernetes pozostaje zamrożony.

Manifesty Kubernetes/K3s zostały zmodernizowane w Fazie 9. W Fazie 11 priorytetem jest
produkcyjny Compose budowany ze źródeł. K3s pozostaje opcjonalnym następnym profilem,
a rozbudowany Kubernetes nie blokuje pierwszych wdrożeń dla małych gmin i miast.

## Faza 12: Certyfikacja instancji klienta — Compose i opcjonalne K3s

Status: **pakiet gotowy / wykonanie per klient**. Kontrakt i automatyzację opisują
[plan certyfikacji Fazy 12](phase-12-certification-plan.md) oraz
[runbook wykonania](phase-12-operations-runbook.md). Adaptację nowego miasta prowadzi
[checklista White-Label](phase-12-white-label-rollout.md).

Automatyzacja ma status `automation-complete`, a
[lokalny preflight](phase-12-local-evidence.md) przeszedł dla obu profili, realnego DMR,
load testu i diagnostycznej obserwowalności. Końcowa certyfikacja nie jest wykonywana
centralnie: wymaga hosta, DNS/TLS, kopii poza hostem, godzinnego soak, RPO/RTO i podpisu
operatora konkretnego klienta.

Osobny host referencyjny nie jest obecnie dostępny. Wykonany
[lokalny pomiar CPU i RAM](phase-12-local-resource-sizing.md) ma status
`local-measured-provisional` i stanowi podstawę wstępnych wymagań per konfiguracja.

Uzgodnione profile:

- `minimal`: lokalny RustFS, Redis `disabled`, observability `disabled`, lokalny LLM przez
  Docker Model Runner z Gemma 3 1B;
- `recommended`: lokalny RustFS, lokalny Redis, observability `disabled`, LLM `disabled`.

Host produkcyjny to natywny Ubuntu Server `amd64`. Wstępne wymagania wynoszą od
`2 CPU / 4 GiB` bez lokalnego LLM i obserwowalności, przez `8 CPU / 8 GiB` z lokalnym DMR,
do `12 CPU / 12 GiB` przy jednoczesnym lokalnym DMR i observability. Zalecenia z pełnym
marginesem wynoszą odpowiednio `4/8`, `12/12` i `12/16`; dysk pozostaje na poziomie
`100–150 GiB` do czasu pomiarów retencji i wzrostu danych.
Windows `amd64` przez Docker Desktop/WSL2 jest profilem zgodności, ale nie otrzymuje
linuxowych gwarancji systemd/nftables. 32-bitowe x86 nie jest wspierane. Wszystkie
kombinacje external pozostają walidowane statycznie, a ich runtime będzie certyfikowany
dopiero z rzeczywistym S3/R2, Redis, OTLP albo OpenAI-compatible LLM.

1. **Kontrakt wdrożony 2026-07-26:** najpierw certyfikować Docker Compose single-host
   jako główny profil produkcyjny. Status końcowy wymaga dowodów z hosta referencyjnego.
2. Po przejściu bramek Compose opcjonalnie certyfikować K3s. Utrzymać parytet funkcji,
   kontraktów, danych, obrazów, bezpieczeństwa i telemetryki między zatwierdzonymi profilami.
3. Udokumentować różne gwarancje operacyjne:
   - Compose: pojedynczy host, stałe/manualne repliki, kontrolowany recreate i jawne RTO/RPO;
   - K3s: wariant single-node oraz rekomendowany wariant HA dla wymagań wysokiej dostępności.
4. Przetestowac storage:
   - wolumen Postgresa albo PVC, zależnie od profilu;
   - Object Storage oraz wolumen/PVC RustFS w wariancie lokalnym;
   - RabbitMQ persistence i odtworzenie zadań;
   - backup/restore.
5. Ustalić publiczny routing, TLS, DNS i sekrety osobno dla każdego profilu.
6. Dodać strategie rollout/rollback:
   - Compose: automatyzowany pull/migrate/recreate/smoke/rollback;
   - opcjonalny K3s: Deployment rollout, rollback oraz kontrolowane migracje.
7. Udokumentowac proces adaptacji White-Label dla nowego miasta.
8. Aplikacja React Native + Expo dla mieszkańców i służb jest wykonana; klient buduje ją
   lokalnie dla własnej instancji.
9. Dopiero po stabilizacji panelu web rozwazyc Electron dla admina/sluzb albo swiadomie zostac przy web panelu.
10. Domknąć produkcyjną obserwowalność rozpoczętą w Fazie 9:
    - przygotować dashboardy RED, RabbitMQ/outbox, `media_worker`, LLM, PgBouncer, PostgreSQL,
      Object Storage i Node.js;
    - zdefiniować SLI/SLO, alerty i routing Alertmanagera;
    - ustalić retencję, limity wolumenu i kardynalności oraz kontrolę dostępu;
    - zabezpieczyć Collector, Prometheus, Loki, Tempo i Grafanę przez sieć wewnętrzną,
      RBAC oraz TLS;
    - potwierdzić przejście `metryka -> trace -> log`;
    - przetestować przeciążenie, restart i niedostępność pipeline'u telemetrycznego.
11. Jako jedną z ostatnich bramek przedprodukcyjnych wykonać testy obciążeniowe kompletnego
    systemu osobno dla Compose i — jeśli został włączony do wydania — K3s oraz finalnie
    dostroić PgBouncera:
    - rozpoczac dopiero po ustabilizowaniu wszystkich uslug, endpointow, kolejek, workerow i
      docelowego profilu infrastruktury;
    - objac testami ruch synchroniczny i asynchroniczny, skoki obciazenia, nasycenie puli oraz
      zachowanie podczas restartow;
    - zmierzyc czasy odpowiedzi, bledy, czas oczekiwania klientow, wykorzystanie puli,
      PostgreSQL i pamieci;
    - na podstawie pomiarow ustalic `max_client_conn`, `default_pool_size`,
      `reserve_pool_size`, timeouty PgBouncera oraz `max_connections` PostgreSQL;
    - zapisać finalne wartości osobno dla każdego zatwierdzonego profilu produkcyjnego;
    - użyć telemetryki z OpenTelemetry, Prometheusa, Loki i Tempo do strojenia PgBouncera,
      autoskalowania workera oraz timeoutów LLM.
12. Wykonac koncowy test bezpieczeństwa transportu:
    - odrzucenie plaintext na chronionych polaczeniach;
    - odrzucenie obcej CA, niepoprawnego SAN, wygaslego i odwołanego certyfikatu;
    - rotacja certyfikatow bez przebudowy obrazow i bez utraty danych;
    - pelny przeplyw Nginx/backend -> authorization oraz uslugi -> PgBouncer -> PostgreSQL;
    - potwierdzenie, ze web i Expo nie wymagaja certyfikatu klienckiego.
13. Dla każdego profilu przeprowadzić od zera: instalację, upgrade, rollback, restart hosta
    lub węzła, backup/restore, rotację certyfikatów, utratę zależności, test bezpieczeństwa,
    load test i disaster recovery.

### Stan wykonania Fazy 12

- kroki 1, 3 i 7 mają kompletne kontrakty, runbooki oraz checklistę White-Label;
- krok 4 przeszedł lokalny destrukcyjny backup/restore PostgreSQL + Object Storage,
  RabbitMQ/outbox oraz oba profile; dowód poza hostem pozostaje wymagany;
- krok 5 ma automatyczną bramkę DNS/TLS/HSTS, ale wymaga prawdziwej domeny;
- krok 6 ma transakcyjny workflow deploy/recovery/rollback dokładnego tagu, lecz jego drill
  wymaga hosta Ubuntu i produkcyjnego kandydata;
- krok 10 przeszedł lokalny test `metryka -> trace -> log`, awarię Collectora i walidację
  12 reguł alertów; routing operatorski i external OTLP są zależne od docelowych usług;
- krok 11 przeszedł lokalnie z p95 `22 ms` dla 1000 publicznych odczytów i p95 `102 ms`
  dla 20 zapisów; godzinny soak i strojenie PgBouncera pozostają hostowe;
- krok 12 jest pokryty lokalnymi testami TLS 1.3, mTLS, obcej CA, SAN, plaintext i
  wygasłego certyfikatu; realna rotacja CA wymaga stagingu;
- krok 13 ma gotowy runner dowodów, ale podpis końcowy jest zablokowany do czasu wykonania
  na hoście referencyjnym;
- krok 2 (opcjonalne K3s) rozpoczyna się dopiero po podpisaniu Compose;
- kroki 8–9 pozostają świadomie odroczonymi decyzjami produktowymi i nie blokują wydania
  webowego.

Rozbudowany Kubernetes pozostaje zamrożony i nie blokuje Fazy 12 ani pierwszego wydania.
Wraca do planu dopiero wtedy, gdy rzeczywista skala wdrożeń uzasadni osobny koszt
certyfikacji i utrzymania.

## Faza 13: Ostateczna bramka certyfikacji produkcyjnej — stabilne NestJS 12

Status: **wdrożona 2026-09-02**. Backend i `media_worker` przeszły z alpha na spójną,
oficjalną macierz NestJS `12.0.1`. Usunięto prerelease'owe wyjątki peer dependency i
parent-scoped overrides NestJS, a bootstrap egzekwuje błąd dla duplikatów i shadowingu tras
oraz rozwiązuje je według specyficzności. Testy zachowują 20 operacji OpenAPI, kontrakty
Standard Schema, strukturalne `errorCode` i kontrolowany graceful shutdown.

Aktualizacja objęła również pozostałe zależności workspace, Node `26.8.1`, PNPM `11.25.0`
oraz bieżące obrazy Node, Nginx, Redis, RustFS, Loki, Grafana, Kind i K3s. Aktualizacja RustFS
została wykonana bez osobnego testu zachowania istniejących danych, zgodnie z decyzją
właściciela; pozostałe bramki statyczne i runtime pozostają wymagane. Certyfikacja konkretnego
hosta i jego danych nadal należy do Fazy 12.

Dziewięć poprawek Expo SDK 57 opublikowanych 2026-09-01 między `16:18Z` i `18:08Z` nie
spełniało jeszcze 24-godzinnej kwarantanny podczas zamknięcia tej migracji. Pozostają
odłożone do kolejnego zwykłego przebiegu `pnpm deps:update`; nie utworzono dla nich wyjątku.

Poniższa lista stanowi utrzymywany kontrakt bramki i została wykonana podczas tej migracji.

1. Rozpocząć bramkę dopiero po zakończeniu implementacji, optymalizacji infrastruktury,
   testów obciążeniowych i bezpieczeństwa transportu z wcześniejszych faz.
2. Potwierdzić dostępność stabilnego NestJS 12 i wybrać spójną macierz dokładnie przypiętych
   wersji `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing`,
   `@nestjs/swagger` oraz zgodnych zależności peer. Pakiety muszą być dostępne w npm przez co
   najmniej 24 godziny.
3. Przejrzeć oficjalny changelog i przewodnik migracji od używanego prerelease do stabilnego
   wydania. Udokumentować każdą zmianę wpływającą na Node 26, TypeScript 7/TSGO, ESM,
   dekoratory, metadata, Express 5, Standard Schema, OpenAPI i lifecycle.
4. Zaktualizować cały backend oraz `media_worker` do stabilnej macierzy NestJS 12. Adapterem
   HTTP pozostaje `@nestjs/platform-express`; nie otwierać ponownie migracji na Fastify.
5. Usunąć obejścia i adaptery potrzebne wyłącznie dla alpha/beta/RC, w szczególności
   zweryfikować obejście serializacji tablic OpenAPI. Włączyć zaakceptowane stabilne opcje
   wykrywania konfliktów i shadowingu tras oraz natywne mechanizmy Standard Schema i błędów,
   jeżeli finalne API je udostępnia.
6. Ponownie wygenerować OpenAPI i potwierdzić dokładnie 20 operacji, kontrakty request/response,
   strukturalne `errorCode`, cookie auth oraz brak publicznego endpointu klasyfikacji LLM.
7. Uruchomić pełną bramkę jakości: peer dependencies bez ostrzeżeń, audyt zależności,
   `pnpm check`, testy kontraktowe i backendu, produkcyjne buildy wszystkich obrazów oraz pełny
   izolowany test integracyjny przez Nginx.
8. Powtórzyć krytyczne scenariusze wydaniowe: graceful shutdown, RabbitMQ retry/DLQ/outbox,
   przetwarzanie zdjęć, fallback LLM, backup/restore, TLS/mTLS/AMQPS, testy obciążeniowe oraz
   rollout/rollback na docelowym profilu infrastruktury.
9. Zaktualizować dokumentację wersji, architektury i eksploatacji. Wspólny certyfikowany
   baseline produkcyjny wolno zadeklarować dopiero po przejściu całej bramki bez prerelease
   NestJS, przejściowych obejść i nierozwiązanych błędów krytycznych.

## Faza 14: Asynchroniczna kontrola właściwej służby przez LLM

Faza rozpoczyna się dopiero po przejściu Fazy 13 i migracji na oficjalne, stabilne NestJS 12.
Jest rozwojem produktu po podstawowej bramce wydaniowej. LLM pozostaje pomocnikiem i nie jest
źródłem prawdy routingu ani warunkiem przyjęcia zgłoszenia.

1. Oddzielić komunikat bezpieczeństwa 112 od klasyfikacji modelu. Frontend zawsze pokazuje
   stałą informację z Fazy 8, a utworzenie zgłoszenia nie czeka na LLM.
2. Po zapisaniu zgłoszenia i jego początkowym przypisaniu według danych mieszkańca oraz
   konfiguracji White-Label zapisać zdarzenie w PostgreSQL outbox.
3. Publikować wersjonowane zadanie `llm.routing.review.requested.v1` do RabbitMQ bez binariów i
   bez danych, które nie są potrzebne modelowi. Zachować correlation ID, causation ID i
   traceparent.
4. Uruchomić asynchronicznego konsumenta po stronie granicy LLM. Konsument wywołuje aktywny
   runtime przez provider-neutralny adapter, stosuje timeout i publikuje wersjonowany wynik
   albo jawny fallback.
5. Wynik ma zawierać co najmniej sugerowany `serviceKey`, confidence, wersję modelu i status
   `matched | mismatch | unknown`. Nie zmienia automatycznie przypisania zgłoszenia.
6. Backend konsumuje wynik idempotentnie. Dla `mismatch` ustawia `requires_review` i udostępnia
   sugestię uprawnionym pracownikom lub administratorowi; awaria modelu pozostawia dotychczasowy
   routing bez wpływu na mieszkańca.
7. Zapewnić publisher confirms, manual ACK, kontrolowany prefetch, retry z backoffem, DLQ,
   idempotencję oraz audyt decyzji człowieka względem sugestii modelu.
8. Zmierzyć skuteczność na rzeczywistych, zatwierdzonych rozstrzygnięciach. Automatyczne
   przekierowanie można rozważyć dopiero w osobnym ADR, dla zaakceptowanych kategorii i progów
   confidence; nie jest częścią tej fazy.
9. Przetestować backlog, restart brokera i konsumenta, niedostępny model, timeout, błędną
   odpowiedź, duplikat, rezultat po ręcznej zmianie przypisania oraz pełną izolację danych.

## Sugerowana kolejnosc skrocona

1. Audyt, kontrakty, healthchecki, smoke testy.
2. PNPM workspace, TypeScript i wspolne kontrakty.
3. White-Label config: miasto, logo, lista sluzb.
4. PgBouncer, provider-neutralny Object Storage, czysty model zdjec bez migracji danych oraz
   opcjonalny lokalny RustFS.
5. Usuniecie pgAdmin — wykonane wyprzedzajaco.
6. Auth na Hono + Node 26 + TypeScript + Better Auth.
7. Backend na NestJS + `@nestjs/platform-express` + Node 26 + TypeScript, RabbitMQ i osobny
   `media_worker` ze Sharp.
8. LLM gateway na Hono + Node 26 + TypeScript.
9. Docker Model Runner jako opcjonalny tryb wlaczany flaga/profilami.
10. React Doctor baseline i optymalizacja obecnego frontendu.
11. Migracja frontendu do TanStack Start.
12. Trzy profile produkcyjne; serverless scale-to-zero dla `llm_gateway` tylko w K8s/K3s.
13. Redis, zawsze aktywny lokalny rate limiting i cache publicznej listy.
14. Optymalizacja obrazow Docker i manifestow.
15. Produkcyjna gotowosc White-Label.
16. Aplikacja React Native + Expo dla mieszkańców i służb — wykonana; każdy klient buduje
    ją dla własnej instancji, bez centralnych binariów sklepowych. Electron pozostaje poza
    bieżącym zakresem.
17. Stabilne NestJS 12 i pełna regresja jako ostatnia bramka wspólnej certyfikacji
    produkcyjnej.
18. Asynchroniczna kontrola właściwej służby przez LLM jako rozwój po stabilnym NestJS 12.

## Najwieksze ryzyka

- Node 26 jest obecnie linia Current, wiec przed produkcja trzeba potwierdzic status LTS i kompatybilnosc obrazow oraz bibliotek.
- Migracja auth moze zepsuc cookies, CORS i role, dlatego musi miec osobna faze i testy integracyjne.
- TanStack Start zmienia model aplikacji z czystego SPA na full-stack React framework, wiec trzeba pilnowac granic server/client i deploymentu.
- Docelowy model zdjęć zmienia schemat i API, ale baza jest pusta, dlatego nie budujemy
  migracji danych, dual-write ani fallbacku dla `bytea`.
- Sharp uruchomiony w procesie HTTP mógłby zużywać jego CPU i pamięć; obróbka pozostaje w
  osobnym workerze ze ściśle ograniczoną współbieżnością.
- RabbitMQ zwiększa odporność, ale wymaga idempotencji, outboxa, retry/DLQ, monitoringu i
  testów restartu; sama kolejka nie ogranicza transferu HTTP do Object Storage.
- Docker Model Runner zalezy od wersji Dockera i wsparcia hosta, dlatego musi byc opcjonalny, a nie wymagany do startu calego systemu.
- Scale-to-zero dla HTTP gatewaya wprowadza cold start, wiec backend musi miec timeouty, retry i fallback.
- Produkcyjny Compose nie zapewnia HA pojedynczego hosta ani automatycznego autoskalowania;
  nie wolno przedstawiać go jako odpowiednika klastra bez jawnego SLA, RTO/RPO, backupu
  poza hostem i przećwiczonego disaster recovery.
- White-Label bez twardego schematu konfiguracji szybko doprowadzi do rozjazdu miedzy frontendem, backendem i baza.
- Redis jest kolejnym komponentem operacyjnym, dlatego musi mieć tryb `disabled` dla małego
  Compose, bezpieczny fallback, obserwowalność i testy awarii. Nie zastępuje RabbitMQ ani
  PostgreSQL.
- Optymalizacja obrazow przed stabilizacja runtime'ow bedzie praca powtarzana.

## Definicja gotowosci koncowej

- System ma trzy zatwierdzone profile produkcyjne: Docker Compose, Kubernetes i K3s.
- Compose ma osobny utwardzony override produkcyjny, automatyzację hostową, HTTPS,
  secrets, backup/restore, rollback i jawne RTO/RPO dla pojedynczego hosta.
- Aplikacyjne uslugi web/API sa w TypeScript.
- Auth dziala na Hono + Node 26 + Better Auth.
- Backend dziala na NestJS + `@nestjs/platform-express` + Node 26 i ma testy integracyjne dla
  krytycznych przeplywow; przed publikacją działa na stabilnym NestJS 12 bez obejść prerelease,
  a migracja na `@nestjs/platform-fastify` nie jest planowana.
- `llm_gateway` dziala na Hono + Node 26 i jest jedyna granica backendu do LLM.
- Docker Model Runner dziala jako opcjonalny tryb wlaczany flaga/profilami.
- Frontend dziala na TanStack Start, po baseline i optymalizacji React Doctor.
- White-Label config steruje nazwa miasta, logo i lista sluzb; frontend nie osadza mapy.
- Pliki sa w aktywnym providerze S3-compatible (lokalnie RustFS), a Postgres trzyma metadane.
- Osobny `media_worker` przetwarza zdjęcia do WebP przez Sharp, a RabbitMQ steruje trwałymi
  zadaniami bez przesyłania binarnych plików w wiadomościach.
- PgBouncer obsluguje polaczenia do Postgresa.
- PgAdmin jest usuniety z runtime'u.
- K8s i K3s mają gotowe, przetestowane manifesty, a `llm_gateway` ma wariant scale-to-zero.
- Macierz zgodności potwierdza identyczne funkcje, kontrakty, bezpieczeństwo i dane we
  wszystkich profilach oraz jawnie dokumentuje różnice HA i autoskalowania.
- Redis działa w trybach `local` i `external`, a mały Compose może użyć `disabled` bez
  wyłączania lokalnego rate limitingu.
- Obrazy Docker sa zoptymalizowane po stabilizacji stacku.
