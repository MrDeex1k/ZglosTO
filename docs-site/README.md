# Dokumentacja pod /docs

Nimbus + Astro budują statyczną dokumentację. Obraz frontendu zawiera wynik w
`/usr/share/nginx/html/docs`; istniejący publiczny Nginx przekazuje `/docs` do frontendu.
Nie jest potrzebna nowa usługa. Działa to w Compose i klastrze po przebudowie obrazu frontendu.

## Treść

Źródłami artykułów są pliki Markdown w `docs/` oraz trzy jawnie dopuszczone instrukcje
`Mobile/`: `QUICK_START.md`, `CLIENT_CONFIGURATION.md` i `CLIENT_HANDOFF.md`.
Lista publikowanych dokumentów,
ich tytuły i grupy nawigacji są w `content-map.mjs`. Skrypt `scripts/sync-content.mjs`
generuje ignorowane pliki `src/content/docs/*.md` przed buildem, kontrolą typów i startem dev.
Nie edytuj wygenerowanych plików. Dodając stronę, dodaj źródło do mapy.

Sekcje „Dla programisty”, „Dla operatora” i „Dla klienta Mobile” obejmują kontrakty API,
toolchain, diagnostykę, monitoring, transport, Redis oraz konfigurację, build i odbiór
Mobile. Instrukcje Mobile są publikowane bez kopiowania ich źródeł do `docs/`.
Sekcja „Korzystanie z aplikacji” prowadzi przez osobne przepływy mieszkańca, służby i
administratora w WEB oraz mieszkańca i służby w Mobile. Macierz źródeł, opublikowanych
przewodników i świadomych wyłączeń znajduje się w
[audycie pokrycia](../docs/documentation-coverage-audit.md).
Przy zmianie listy źródeł spoza `docs/` uaktualnij także allowlistę walidatora,
`frontend/Dockerfile.dockerignore` oraz testy linków między katalogami.

Linki do opublikowanych instrukcji są przepisywane na `/docs/<slug>/`, pozostałe prowadzą
do plików w repozytorium. Archiwum faz nie jest automatycznie publikowane. Konfiguracja
miasta korzysta z przewodnika `docs/white-label-configuration.md`; procedura rollout
Fazy 12 pozostaje osobną checklistą odbioru produkcyjnego.

## Praca lokalna

Z katalogu głównego: `bun run dev:docs`. Podgląd: `http://localhost:4322/docs/`.
Po zmianie źródłowego Markdown uruchom ponownie proces dev. Po migracji z PNPM przenieś
stary `docs-site/node_modules` poza checkout przed `bun run deps:install`; pozostałe shimy
mogą przesłaniać CLI z nowej instalacji Bun.
Vite frontendu przekazuje `/docs` do portu 4322.

Pełna weryfikacja dokumentacji:

```bash
bun run check:docs
bun run --filter docs-site preview --host 127.0.0.1 --port 4322
```

## Bramka jakości i CI

`bun run check:docs` działa bez Dockera, sekretów i połączenia z produkcją. Wymaga wcześniej
zainstalowanych zależności z `bun.lock` oraz wersji Bun zapisanej w głównym
`package.json`. Wykonuje kolejno:

1. Kontrolę mapy stron, celów linków i braku poleceń PNPM w blokach shell publikowanych źródeł.
2. Testy generatora oraz testy negatywne walidacji treści i artefaktów.
3. Synchronizację Markdown i typów Astro, kontrolę `.ts`/`.tsx` przez TS7 oraz `.astro` przez TS6.
4. Pełny build wraz z Pagefind i lint Nimbus na aktualnej mapie tras.
5. Kontrolę HTML, kotwic, lokalnych zasobów, wersji Markdown, indeksu AI i plików wyszukiwarki.

Pierwszy błąd kończy bramkę niezerowym kodem. Zewnętrzne strony nie są odpytywane;
kotwice w niepublikowanych plikach repozytorium nie są sprawdzane. Testy linków używają
tej samej obsługi składni Markdown co generator i pomijają przykłady wewnątrz kodu.
Bramka nie zastępuje testu interakcji w przeglądarce ani renderowania Nginx.

Kontrola jest częścią głównego `bun run check`, a więc również lokalnej bramki wydania
`release:production:static`. Repozytorium nie ma aktywnego runnera CI; nie dodajemy
pozornego workflow oczekującego na nieistniejący self-hosted runner. Na przyszłym
izolowanym runnerze wystarczy instalacja zależności z `--frozen-lockfile` i
`bun run check:docs`. Nie podłączaj go do sekretów lub hosta produkcyjnego.

Dla rzeczywistego Nginx po buildzie:

```bash
DOCS_TEST_ORIGIN=https://domena-aplikacji bun run --filter docs-site check:build
```

Sprawdza to przekierowania, trasy stron, Markdown, plik wyszukiwarki oraz prawdziwe 404.
Nie używaj tego wariantu jako testu serwera Astro preview, którego routing różni się od Nginx.

Build, kontrolę typów i testy dokumentacji uruchamia Bun 1.4.2. Domyślnym kompilatorem
dokumentacji jest TypeScript 7.0.2 (`typecheck:ts`). Wyjątkiem jest `typecheck:astro`:
osobny proces używa API `AstroCheck` z `@astrojs/language-server` i aliasu
`typescript-astro` przypiętego do TS6.0.3. Volar także importuje kompilator bezpośrednio,
więc lokalny loader Bun podaje mu tę samą kopię TS6 wyłącznie w procesie checkera.
Nie zmienia to globalnej wersji TypeScript ani plików zainstalowanych pakietów.

TS7 widzi importy `.astro` jako komponenty frameworka; właściwe szablony, propsy i ich
kontrakty z importowanym kodem sprawdza drugi etap. TS6 musi więc umieć odczytać również
kod importowany przez komponenty Astro. Oba etapy są wymagane i przerywają bramkę przy
błędzie. Testy negatywne sprawdzają wykrywanie błędów TS i niepoprawnych propsów Astro.
`bun run check:workspaces` dodatkowo sprawdza wersje obu kompilatorów.

Używaj `bun run --filter docs-site typecheck`, nie surowego `astro check`, które może
załadować hoistowany TS7 bez wymaganego API. Wyjątek TS6 można usunąć, gdy Astro/Volar
obsłużą API TS7; warunkiem jest przejście testów negatywnych i całej bramki dokumentacji.
Node pozostaje wymagany dla Expo/Metro, nie dla dokumentacji. Importy `node:*` są
kompatybilnym API Bun i nie wymagają zastępowania.

Pagefind wymaga buildu; testuj wyszukiwanie w preview lub obrazie frontendu.
Linki Markdown w interfejsie są same-origin. `PUBLIC_SITE_URL` określa absolutny adres
dla metadanych, sitemap i indeksów AI; domyślnie jest to `http://localhost:1235`.
Nie ustawiaj tam sekretów. Przy samodzielnym buildzie produkcyjnym przekaż domenę instancji;
Dockerfile frontendu przyjmuje `--build-arg PUBLIC_SITE_URL=https://domena-aplikacji`.
Standardowy `bun run build:production` wymaga ustawienia `PUBLIC_SITE_URL` na origin
konkretnej instancji (np. `https://twoja-domena.pl`) i przekazuje go do obrazu frontendu.
Bez tego build kończy się błędem, zamiast publikować metadane z adresem localhost.

Konfiguracja Nginx obsługuje `/docs` → `/docs/`, podstrony, statyczne zasoby i prawdziwe 404. Nieistniejący dokument nie zwraca shella aplikacji. Stash pierwotnego PoC pozostaje
w Git jako kopia bezpieczeństwa; pliki `.astro`, `.nimbus` i `dist` nie są źródłami.
