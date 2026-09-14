# Polityka zależności

Projekt używa Bun 1.4.2 jako menedżera pakietów. Bezpośrednie zależności mają dokładne wersje. Nowe wersje bezpośrednie i tranzytywne obowiązuje kwarantanna 24 godzin, bez wyjątków.

## Instalacja i aktualizacja

```bash
# Pierwsza instalacja sprawdzonego lockfile, również bootstrap SFW:
bun install --frozen-lockfile
# Kolejne instalacje przez Socket Firewall:
bun run deps:install
bun run deps:add nazwa-pakietu@wersja --workspace backend
bun run deps:add nazwa-pakietu@wersja --dev
bun run deps:update
# Aktualizacja tylko jednego workspace:
bun run deps:update --workspace Mobile
```

`package.json` zawiera workspaces, overrides i jawne trustedDependencies: `@nestjs/core`, `esbuild`, `protobufjs`. `@scarf/scarf` nie jest zaufany. `bunfig.toml` wymusza hoisted linker, dokładne wersje i `minimumReleaseAge = 86400` (sekundy).

Sam Bun akceptuje brak daty publikacji, dlatego add/update muszą przechodzić przez `scripts/dependencies.ts`. Wrapper tworzy kandydata manifestów i lockfile w katalogu tymczasowym przez SFW, bez instalacji i lifecycle scripts. Porównuje wszystkie wersje oraz integralności, również tranzytywne, i sprawdza pełne metadane npm. Brak lub błędna data, wiek poniżej 24 godzin, deprecated, niedostępny rejestr oraz nieobsługiwane źródło zależności blokują zmianę. Dopiero po kontroli całego grafu zapisuje manifesty i lockfile oraz wykonuje frozen install przez SFW. Błąd instalacji pozostawia sprawdzony kandydat do diagnozy i ponowienia przez `deps:install`.

Nie używamy bezpośrednio `bun add` ani `bun update`. SFW ocenia ryzyko pakietu, a wrapper egzekwuje kwarantannę; obie kontrole są wymagane. Zamrożona instalacja odtwarza zatwierdzony graf, nie dobiera nowych wersji. Po aktualizacji uruchamiamy `bun run check` i audyt wydaniowy.

## Audyt wydaniowy

`bun run audit:release` wywołuje `bun audit --prod --json`. Akceptuje wyłącznie poprawny, pusty obiekt i kod wyjścia 0. Każde advisory, błąd rejestru, brak odpowiedzi lub niepoprawny JSON blokuje wydanie. Nie ma wyjątków zależnych od severity. Historyczna akceptacja ryzyka image-size pozostaje wyłącznie zapisem poprzedniego wydania.

## Runtime

Od fazy 4 Bun 1.4.2 wykonuje usługi, skrypty repo, kompilatory, Vite, Vitest, Knip, Oxlint/Oxfmt oraz wrapper SFW i hooki Git. CLI uruchamiamy przez `bun run --bun <narzędzie>`, a Turbo bez globalnego `--bun`, przez jego plik wejściowy. Dzięki temu wymuszenie Bun nie przechodzi do procesów Expo.

Node >=26.8.1 pozostaje wymagany dla Expo/Metro, Expo Doctor i natywnego toolchainu Mobile. Testy Vitest i typecheck Mobile wykonuje Bun; aplikacja na urządzeniu nadal działa na Hermes. `node:*`, `@types/node` i `NODE_ENV` są kontraktami kompatybilnych API i nie oznaczają uruchomienia Node.

`env = false` w głównym `bunfig.toml` wyłącza automatyczne wczytywanie `.env` przez runtime i runner Bun. Narzędzia nie dziedziczą przypadkowo ustawień kontenerów. Przekazuj konfigurację jawnie przez środowisko lub `--env-file`; Compose oraz Expo zachowują własne mechanizmy konfiguracji. [Bun: env](https://bun.sh/docs/runtime/bunfig#env).

Knip ma jawne wpisy dla CLI wywoływanych przez `--bun` lub plik wejściowy (`@commitlint/cli`, `husky`, `oxfmt`, `oxlint`, `turbo`, `sfw`), których użycia nie rozpoznaje parser komend. Nie wyłączono kontroli pozostałych zależności.

Operacje `deps:install`, `deps:add` i `deps:update` używają wspólnej wyłącznej blokady
`.state/dependency-operation.lock`, utrzymywanej od odczytu manifestów do końca instalacji.
Druga operacja kończy się błędem bez zmian. Po przerwaniu procesu blokada może pozostać:
usuń ten katalog dopiero po potwierdzeniu, że wrapper i procesy instalatora już nie działają.
Kontrola ręcznych zmian manifestów przed zapisem nadal obowiązuje.
