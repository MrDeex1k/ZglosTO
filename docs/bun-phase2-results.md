# Bun — faza 2: menedżer pakietów

Data: 2026-09-12. Branch: `chore/bun-migration`. Bun 1.4.2 zastępuje pnpm; usługi, CLI i Vitest nadal wykonuje Node (lokalnie 26.8.2, obrazy 26.8.1). Mobile nadal używa Hermes. Faza 3 nie została rozpoczęta.

## Zmiany

- Jeden `bun.lock`, workspaces/overrides/trustedDependencies w `package.json`, pin `.bun-version` i konfiguracja `bunfig.toml`. Usunięto aktywne pliki pnpm i przeniesiono polecenia repo, hook commitlint, release gates oraz instrukcje.
- `bun run deps:install` odtwarza frozen lock przez SFW. Add/update przygotowują kandydat w pustym katalogu, weryfikują wiek i deprecated wszystkich nowych wersji tranzytywnych oraz dopiero potem zapisują zmiany. Brak daty lub błąd rejestru blokuje operację. Testy obejmują próg 24 godzin, zmianę integrity, advisory, błędy audytu i flagi omijające politykę.
- NativeWind otrzymał jawną devDependency `@babel/plugin-transform-react-jsx@7.29.7`, już obecną tranzytywnie. Nie podniesiono wersji zależności. Resolver usunął dwa nieużywane optional peers Base UI: `date-fns@4.4.0` i `@date-fns/tz@1.5.0`. Pozostałe 1415 tożsamości wersja/integrity odpowiada importowi fazy 1.
- Docker używa Bun z obrazu Alpine przypiętego digestem `sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f`. `stage-production.ts` kopiuje wyłącznie graf produkcyjny workspace i dist do pustego katalogu. Frozen/offline/production install zastępuje `pnpm deploy`. Authorization pomija opcjonalne i automatyczne peer dependencies, żeby nie dołączać TypeScript; wszystkie rzeczywiste importy przechodzą kontrolę.
- Graf produkcyjny pozostaje w `/app`, katalog roboczy wskazuje `/app/<service>`, zachowując komendy `dist/...`. Runtime Node, entrypoint sekretów, użytkownicy, healthchecki i porty pozostają zachowane.

## Linker i React

Próba `isolated` tworzyła oddzielne konteksty peer dependencies dla tych samych modułów Expo. Expo Doctor wykrywał duplikaty `expo-constants`, `expo-file-system`, `expo-font` i `@expo/log-box`. Docelowy `hoisted` usuwa tę kategorię błędów. Expo opisuje ograniczenia bibliotek przy isolated installs w [przewodniku monorepo](https://docs.expo.dev/guides/monorepos/#package-managers-with-isolated-dependencies).

Web i Mobile zachowują własne wersje: React 19.2.8 / 19.2.3, TypeScript 7.0.2 / 6.0.3. Nowy `check:workspaces` sprawdza te wersje oraz wszystkie scoped overrides. Frontend rozwiązuje React i React DOM względem własnego manifestu; jego kompilator używa odpowiadających im typów. Vite bundluje zależności SSR, a Vitest optymalizuje biblioteki korzystające z React, aby hoistowane biblioteki nie ładowały instancji Mobile. To naprawia rzeczywiście odtworzony błąd invalid hook call; testy komponentów i prerender sprawdzają rezultat.

## Weryfikacja

- Zimna instalacja z pustymi node_modules: 1248 zainstalowanych pakietów. Kolejny frozen install przez SFW: bez zmian.
- SHA256 `bun.lock` przed i po powtórzeniu: `9d3ef7a8cb011d5cd111a82ad5972f7631a47b4802c999036a9595c158f5befa`.
- `bun run check`: polityki źródeł i wdrożeń, testy infrastruktury i zależności, Knip, OxFmt, OxLint, typecheck, Vitest, dwa warianty white-label i buildy workspace, w tym eksport Android/iOS.
- Nowe skrypty sprawdzone dodatkowo przez TypeScript z `strict` i typami Node.
- Osiem obrazów zbudowanych lokalnie przez OrbStack. amd64 sprawdzono przez emulację na hoście arm64; to dowód zgodności builda/importów, nie natywny pomiar wydajności.
- Obrazy usług sprawdzone bez sieci, z read-only filesystem, odebranymi capabilities i no-new-privileges. Po usunięciu map/deklaracji wszystkie importy produkcyjne nadal działają, symlinki pozostają wewnątrz obrazu i nie ma narzędzi developerskich. Sprawdzono istniejące wzorce zabronionych plików, użytkownika oraz runtime Node 26.8.1.

| Obraz            | arm64 (MB) | amd64 (MB) | Dotychczasowy limit (MB) |
| ---------------- | ---------: | ---------: | -----------------------: |
| backend + worker |      253.6 |      256.6 |                      275 |
| authorization    |      198.2 |      200.7 |                      260 |
| llm_gateway      |      190.4 |      192.9 |                      205 |
| frontend         |       14.3 |       13.9 |                       65 |

## Otwarte bramki wydaniowe

`bun run audit:release` prawidłowo blokuje obecne advisory dla `@xmldom/xmldom`, `js-yaml`, `multer` i `qs`. Pakiety te należą do istniejącego grafu; nie dodano wyjątków ani nie obniżono progu audytu. Ich aktualizacja wymaga osobnej zmiany z kwarantanną i testami.

Expo Doctor: 17/21 kontroli. Kontrola duplikatów natywnych przechodzi. Trzy kontrole przerywa wewnętrzne `npm explain ... --json` dla nieobecnych pakietów, a jedna zgłasza 13 nowszych poprawek Expo dostępnych w rejestrze. Pełnego wyniku Doctor nie uznajemy za zielony i nie wyłączamy tych kontroli.

Eksport JS/Hermes nie zastępuje natywnego development builda. Buildów Xcode/Gradle oraz pełnej regresji na urządzeniach nie powtarzano w tej fazie. Dokumentacja `docs-site` nadal znajduje się w wcześniejszym stashu i nie należy do aktywnego workspace, więc jej build pozostaje do sprawdzenia po przywróceniu. Nie przeprowadzano rolloutów Compose/Kubernetes/K3s ani certyfikacji produkcyjnej.
