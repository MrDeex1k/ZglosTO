# Bun — faza 4: narzędzia, buildy i testy

Data: 2026-09-13. Branch: `chore/bun-migration`. Pin Bun: 1.4.2. Faza obejmuje aktywny checkout; docs-site pozostaje w stashu.

## Implementacja

- Skrypty TypeScript/JavaScript repo, walidatory, metadane wydania, skrypty operacyjne oraz wrapper Socket Firewall wykonuje Bun. Raport builda zapisuje rzeczywistą wersję Bun.
- TypeScript, Vite, Vitest, Knip, Oxlint/Oxfmt, Husky i commitlint są uruchamiane jawnie przez Bun. TypeScript 7 nadal używa własnego kompilatora natywnego; jego launcher działa na Bun. Mobile zachowuje TypeScript 6.
- Turbo startuje przez `bun ./node_modules/turbo/bin/turbo`, bez globalnego `--bun`. Wymuszenie runtime dotyczy konkretnych CLI i nie podmienia Node w procesach Expo.
- Vitest pozostaje runnerem testów aplikacji. Każdy workspace ma setup sprawdzający `process.versions.bun` wewnątrz workera. Inline Zod usuwa problem jego eksportów w loaderze Vitest/Bun. Frontend zachowuje izolację React i dotychczasowy inline zależności.
- Testy infrastruktury i polityki zależności używają `bun test` z jawną ścieżką i timeoutem 30 s. Zachowano kompatybilne API `node:test`.
- Buildery backendu, authorization, gateway i frontendu oraz obraz diagnostyczny używają obrazu Bun Alpine bez Node. Zachowano frozen install, produkcyjny staging, kontrolę symlinków, non-root i limity obrazów.
- Główny `bunfig.toml` wyłącza automatyczne ładowanie `.env` przez runtime. Ustawienia kontenerów nie trafiają przypadkowo do walidatorów, testów ani prerenderingu web. Compose i Expo zachowują własne mechanizmy konfiguracji.

## Weryfikacja

- Instalacja przez `bun run deps:install` (SFW pod Bun) zakończyła się bez zmian zależności. SHA-256 bun.lock: `9d3ef7a8cb011d5cd111a82ad5972f7631a47b4802c999036a9595c158f5befa`.
- Pełny `bun run check`: kontrole źródeł i wdrożeń, Knip, format/lint, typecheck, testy, dwa warianty white-label oraz buildy web i eksporty Android/iOS — kod 0.
- Vitest: 585 testów w 12 workspace; wszystkie przeszły pod Bun, bez pominięć. Dodatkowo 10 testów infrastruktury i 4 polityki zależności przeszło przez `bun test`.
- Commitlint poprawnie zweryfikował przykładowy komunikat `chore: verify Bun tooling` pod Bun.

- Integracja Compose z nowymi builderami i skryptami hosta Bun: kontrakty biznesowe, 22 trasy HTTP, mTLS, PostgreSQL/PgBouncer, RabbitMQ, media/WebP, retry/DLQ, backup/restore i shutdown. Collector potwierdził ślady między usługami, SQL, metryki i logi.
- Osiem obrazów zbudowano i sprawdzono na arm64 oraz amd64 (emulacja na arm64). Obrazy usług zachowują samodzielny graf zależności produkcyjnych i importy bez sieci, non-root, limity rozmiaru oraz brak binarki Node.

| Obraz            | arm64 MB | amd64 MB |
| ---------------- | -------: | -------: |
| backend + worker |    180.5 |    181.5 |
| authorization    |    125.1 |    125.7 |
| llm_gateway      |    117.2 |    117.8 |
| frontend nginx   |     14.3 |     13.9 |

## Odtworzenie kontroli

```sh
bun run deps:install
bun run check
INTEGRATION_OBSERVABILITY=1 bun run test:integration
# Powtórz dla authorization, llm_gateway i frontend oraz linux/amd64:
docker build --platform linux/arm64 -f backend/Dockerfile -t zglosto-bun-backend:arm64 .
```

`bun run test` ma wyłączony cache Turbo, a warunek runtime wykonuje się w każdym workerze Vitest. Test integracyjny używa wydzielonego projektu i syntetycznych fixture'ów; po zakończeniu usuwa swój stack.

## Jawne wyjątki i zakres kolejnej fazy

Node >=26.8.1 pozostaje dla Expo/Metro, Expo Doctor oraz natywnego toolchainu Mobile. Eksporty Android/iOS przeszły przez Expo na Node; testy i typecheck Mobile przez Bun. Runtime aplikacji na urządzeniu to Hermes. Natywnego builda i regresji na urządzeniach nie powtarzano w tej fazie.

Nie przywracano docs-site ze stasha; jego build i wyszukiwanie wymagają osobnej weryfikacji po przywróceniu. Historyczne próby porównawcze Bun/Node pozostają materiałem diagnostycznym. Importy `node:*`, typy Node, `NODE_ENV` i nazwa użytkownika kontenerów nie są zależnością od binarki Node.

Faza 5 obejmuje wdrożenie i rollback oraz pomiary wydajności, dłuższy soak i certyfikację profili docelowych. Otwarte bramki audytu zależności i Expo Doctor z fazy 2 pozostają bez wyjątków. Ta faza nie oznacza rolloutu produkcyjnego.
