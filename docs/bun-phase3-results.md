# Bun — faza 3: runtime usług

Data: 2026-09-12. Branch: `chore/bun-migration`. Gateway, authorization, backend HTTP oraz media worker używają Bun 1.4.2. Kompilacja TypeScript, Vitest i narzędzia repo pozostają na Node do fazy 4. Mobile nadal wykonuje aplikację na Hermes.

## Implementacja

- Polecenia startowe usług używają `bun --preload @zglosto/observability/register`. Nest wykonuje wynik `tsc`, zachowując metadane dekoratorów i DI. Development backendu najpierw kompiluje kod, potem obserwuje dist; procesy kompilatora i serwera są zamykane razem.
- Obrazy usług zawierają przypięty Bun dla Alpine/musl i nie zawierają binarki Node. Healthchecki, worker, narzędzia uruchamiane wewnątrz kontenerów oraz sondy Kubernetes/K3s używają Bun. Klasy audytu `bun` i `bun-shared` sprawdzają rzeczywistą wersję runtime oraz brak Node, zachowując limity i kontrolę zawartości.
- Authorization i gateway korzystają z `node:http2.createSecureServer` w trybie kompatybilnym z HTTP/1.1. Pozwala to Bun odczytać zweryfikowany certyfikat klienta. Zachowano TLS 1.3, zaufane CA, obowiązkowy certyfikat, kontrolę URI SAN i listy dozwolonych ścieżek.
- Listener nie jest w pełni objęty automatyczną instrumentacją Node SDK. Jawne spany serwera i propagacja nagłówków łączą backend z authorization/gateway. Middleware utrzymuje aktywny kontekst do zakończenia lub przerwania odpowiedzi. Zasoby OTEL zawierają nazwę i wersję rzeczywistego runtime.
- Integracja ma osobny lokalny Collector i kontrolę śladów między usługami, SQL, metryk i logów. Odczyt logów jest strumieniowy; duży debug export nie jest ładowany jednorazowo z deskryptora stdin.

## Dowody

- Próby Linux arm64 i amd64: po 13 przypadków mTLS dla authorization i gateway (w tym błędne CA, brak/wygasły certyfikat, niedozwolona tożsamość/ścieżka i TLS 1.2), rzeczywista obróbka sharp i izolacja 100 kontekstów AsyncLocalStorage.
- OTEL: eksport traces/metrics/logs, propagacja HTTP, jawny span serwera z przychodzącym traceparent i zakończenie po SIGTERM. Lokalny Collector potwierdza wspólne trace IDs backendu i usług downstream oraz spany SQL.
- Wyłączona telemetria nie blokuje operacji. Niedostępny zewnętrzny Collector nie blokuje wyniku operacji ani zakończenia procesu; flush raportuje ostrzeżenie o niedostępności zamiast pozornego sukcesu eksportu.
- Integracja obejmuje kontrakty biznesowe i 22 trasy HTTP, rejestrację/sesje/role, tożsamość mTLS, fallback LLM, PostgreSQL/PgBouncer, S3/RustFS, transactional outbox, publisher confirms, media WebP, retry/DLQ i idempotencję, awarię RabbitMQ, backup/restore i graceful shutdown.
- Osobny test Redis potwierdza degradację, fallback do PostgreSQL i powrót po restarcie.
- Pełny `bun run check` przeszedł: typecheck, testy wszystkich workspace, dwa buildy white-label, eksporty Android/iOS oraz polityki źródeł i wdrożeń. Końcowy przebieg integracji z Collectorem oraz osobny test awarii Redis zakończyły się kodem 0.

Macierz obrazów usług (MB dziesiętne):

| Obraz            | arm64 | amd64 | Limit |
| ---------------- | ----: | ----: | ----: |
| backend + worker | 180.5 | 181.5 |   275 |
| authorization    | 125.1 | 125.7 |   260 |
| llm_gateway      | 117.2 | 117.8 |   205 |

amd64 sprawdzono przez emulację na hoście arm64. Obrazy zachowują non-root, zamknięty graf zależności, read-only filesystem i działające importy bez sieci. Frontend pozostaje statycznym obrazem nginx.

## Odtworzenie kontroli

```sh
bun run check
INTEGRATION_OBSERVABILITY=1 bun run test:integration
bun run test:redis-failure
# Toolchain diagnostyczny, niezależny od obrazów produkcyjnych:
docker build --platform linux/arm64 -f scripts/bun-runtime.Dockerfile -t zglosto-bun-runtime:arm64 .
docker run --rm --platform linux/arm64 zglosto-bun-runtime:arm64
```

Do testu amd64 zmień platformę i tag. Testy integracyjne używają wyłącznie wydzielonego projektu oraz fixture'ów; nie uruchamiaj ich na produkcyjnych bazach.

## Pozostały zakres

To migracja runtime i lokalna weryfikacja, nie rollout produkcyjny. Certyfikacja rzeczywistego klastra, wydajność, długotrwały soak, rotacja certyfikatów i procedura rollback należą do fazy wdrożeniowej. Narzędzia wykonywane na hoście pozostają w zakresie fazy 4. Nie zmieniano wersji bibliotek, nie powtarzano natywnych buildów Mobile i nie przywracano docs-site ze stasha.

Otwarte bramki audytu zależności i Expo Doctor z [fazy 2](bun-phase2-results.md) pozostają aktualne; nie dodano wyjątków ani nie ogłoszono gotowości do wydania produkcyjnego.
