# Bun — domknięcie migracji (faza 6)

Migracja kodu na branchu `chore/bun-migration` jest zakończona. Bun 1.4.2 zarządza
zależnościami całego aktywnego monorepo i wykonuje usługi oraz narzędzia. Jedynym
lockfile jest główny `bun.lock`; konfigurację workspace i reguły zależności zawiera
`package.json`, a instalacji — `bunfig.toml`.

## Stan końcowy

- Backend, media worker, authorization i LLM gateway działają pod Bun. Obrazy
  produkcyjne usług i buildy nie potrzebują Node.
- TypeScript, Vite, Vitest, analiza statyczna i skrypty operacyjne używają Bun.
- Mobile instaluje zależności przez Bun. Expo/Metro, eksporty i komendy natywne
  zachowują Node `>=26.8.1`; pin minimalnej wersji jest w `.node-version`.
  Aplikacja na urządzeniu nadal działa pod Hermes. Nie należy uruchamiać całego
  toolchainu Mobile z globalnym `--bun`.
- Instrukcje Mobile, główny README i szablon PR wskazują Bun.
- `bun run check:workspaces`, włączony do `bun run check`, sprawdza zgodność pinów,
  obecność jednego lockfile, brak konfiguracji pnpm i wywołań innych menedżerów
  w skryptach manifestów, izolację wersji React/TypeScript oraz scoped overrides.
- Dodawanie i aktualizacja zależności nadal przechodzą przez `bun run deps:add`
  oraz `bun run deps:update` (SFW i kontrola wieku publikacji co najmniej 24 h).
  Powtarzalna instalacja używa `bun install --frozen-lockfile`.

## Celowo zachowane elementy

`linker = "hoisted"`, aliasy React web, osobne wersje TypeScript/React dla Mobile,
plugin Babel NativeWind i inline Zod w Vitest są sprawdzonymi wymaganiami zgodności.
Nest nadal wymaga kompilacji TypeScript z metadanymi dekoratorów. Zachowujemy jawne
mTLS, instrumentację HTTP/OTel i kontrolę runtime workerów testowych.

Wykluczenia `.pnpm-store` i starych logów w plikach ignore chronią przed dodaniem
istniejącego lokalnego cache do repozytorium lub kontekstu obrazów. Nie konfigurują
aktywnego menedżera pakietów. Historyczne raporty i prototypy `scripts/bun-phase1*`
zachowują dawne komendy Node/pnpm jako materiał porównawczy; rollback buduje obrazy
z oryginalnego taga i jego oryginalnego toolchainu.

Stash `WIP main before Bun migration branch 2026-09-12`, zawierający m.in. docs-site,
pozostaje poza migracją. Po jego przywróceniu trzeba osobno zweryfikować ten workspace.

## Weryfikacja i granice odbioru

Końcowy `bun run check` zakończył się kodem 0: 585 testów Vitest, 10 testów
infrastruktury, 4 testy polityki zależności i 3 testy odbioru wdrożenia, analiza
statyczna, format, lint, typecheck, dwa buildy white-label oraz build monorepo
z eksportami Mobile Android/iOS. Turbo wykorzystało cache części zadań.
`git diff --check` również przeszedł. Log lokalny: `/tmp/bun-phase6-check.log`.

Zmiany tej fazy
nie zmieniają grafu zależności ani obrazów. Testy Compose, Kubernetes i K3s, rollback,
metryki i audyt ośmiu obrazów opisuje [raport fazy 5](bun-phase5-results.md);
nie są ponawiane dla samego uporządkowania dokumentacji i walidatora workspace.

Zamknięcie migracji nie jest certyfikacją produkcyjną. Nadal otwarte są advisory
`@xmldom/xmldom`, `js-yaml`, `multer`, `qs`, odbiór na natywnym amd64, godzinny soak
na docelowym hoście oraz pełny odbiór profilu klienta, sesji i rotacji certyfikatów.
Wcześniejsze uwagi Expo Doctor i brak powtórnego native builda po fazie 2 opisuje
[raport fazy 2](bun-phase2-results.md). Procedura dalszego odbioru znajduje się
w [runbooku wdrożenia](bun-deployment-runbook.md).
