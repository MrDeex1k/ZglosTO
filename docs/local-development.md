# Uruchomienie lokalne ZgłosTO

Ten dokument jest pełną instrukcją uruchomienia, sprawdzenia i zatrzymania lokalnego
środowiska ZgłosTO. Najkrótszy wariant znajduje się w głównym
[README](../README.md); tutaj opisane są również dane demo, profile opcjonalne, testy
oraz najczęstsze problemy.

## 1. Wymagania

Do uruchomienia pełnego WEB/API przez Docker Compose potrzebujesz:

- Node.js w wersji <code>>=26.8.1</code>;
- PNPM <code>11.25.0</code>;
- Docker Engine;
- <code>openssl</code> i <code>curl</code>.

Do uruchomienia klienta Mobile dodatkowo potrzebujesz:

- Xcode i iOS Simulator dla iOS;
- Java 17, Android SDK i Android Emulator dla Androida.

Sprawdź wersje przed pierwszym startem:

```bash
node --version
pnpm --version
docker compose version
openssl version
```

## 2. Start pełnego środowiska w trzech krokach

Wykonaj polecenia z katalogu głównego repozytorium:

```bash
# 1. Utwórz lokalny plik konfiguracji — pozostaje poza Git
cp .env.example .env

# 2. Zainstaluj zależności i wygeneruj ignorowane certyfikaty developerskie
pnpm install --frozen-lockfile && pnpm certs:dev

# 3. Zbuduj obrazy i uruchom cały stack
docker compose up -d --build
```

Po starcie otwórz:

- WEB: [http://localhost:1235](http://localhost:1235);
- health Nginx: [http://localhost:1235/health](http://localhost:1235/health);
- health API: [http://localhost:1235/api/health](http://localhost:1235/api/health);
- health LLM gateway: [http://localhost:1235/llm/health](http://localhost:1235/llm/health).

Pierwszy build może potrwać dłużej, ponieważ obrazy budują zależności monorepo. Kolejne
uruchomienia korzystają z cache BuildKit.

## 3. Co uruchamia bazowy Compose?

Bazowy <code>docker-compose.yml</code> składa się z następujących elementów:

| Usługa                     | Rola                                          |
| -------------------------- | --------------------------------------------- |
| <code>nginx</code>         | Jedyny publiczny punkt wejścia na porcie 1235 |
| <code>frontend</code>      | Zbudowany WEB serwowany przez Nginx           |
| <code>backend</code>       | Główne API domenowe NestJS                    |
| <code>authorization</code> | Better Auth, sesje, cookies i role            |
| <code>database</code>      | PostgreSQL z migracjami i TLS                 |
| <code>pgbouncer</code>     | Pooling połączeń aplikacyjnych do PostgreSQL  |
| <code>rabbitmq</code>      | Trwała kolejka zadań asynchronicznych         |
| <code>media_worker</code>  | Walidacja i konwersja zdjęć przez Sharp       |
| <code>rustfs</code>        | Lokalny S3-compatible Object Storage          |
| <code>llm_gateway</code>   | Opcjonalny adapter klasyfikacji LLM           |

Profil z pliku <code>.env.example</code> ma bezpieczne, lokalne domyślne ustawienia:

- <code>REDIS_MODE=disabled</code> — działają lokalne limitery, bez dodatkowego kontenera;
- <code>LLM_RUNTIME=disabled</code> — zapis zgłoszenia korzysta z fallbacku;
- <code>OBSERVABILITY_MODE=disabled</code> — bez lokalnego Collectora i Grafany;
- RustFS działa jako lokalny provider storage.

Jeśli używasz istniejącego pliku <code>.env</code>, sprawdź szczególnie trzy opcjonalne
tryby. Samo ustawienie <code>REDIS_MODE=local</code> wymaga jednocześnie profilu
<code>docker-compose.redis.local.yml</code> i plików sekretów Redis.

## 4. Sprawdzenie działania

Status kontenerów:

```bash
docker compose ps
```

Wszystkie usługi bazowego profilu powinny mieć status <code>healthy</code> albo
<code>running</code>. Sprawdź publiczne endpointy:

```bash
curl --fail http://localhost:1235/health
curl --fail http://localhost:1235/api/health
curl --fail http://localhost:1235/llm/health
```

Logi jednej usługi:

```bash
docker compose logs --tail=200 backend
docker compose logs --tail=200 authorization
docker compose logs --tail=200 media_worker
```

Śledzenie logów na żywo:

```bash
docker compose logs -f backend
```

Jeśli chcesz zweryfikować również routing, healthchecki, migracje i podstawowy przepływ
bez dotykania zwykłych wolumenów, uruchom izolowany smoke test:

```bash
./scripts/smoke-compose.sh
```

## 5. Lokalny scenariusz demo z danymi

Do prezentacji WEB i Mobile służy osobny projekt Compose. Używa portu <code>1236</code>,
oddzielnych wolumenów i pliku <code>.env.example</code>, więc nie miesza danych z bazowym
środowiskiem na porcie 1235.

```bash
pnpm mobile:demo:check
pnpm mobile:demo:up
```

Polecenie <code>mobile:demo:up</code> buduje i uruchamia izolowany stack, a następnie
tworzy trzy syntetyczne konta i przykładowe zgłoszenia. Demo jest dostępne pod
[http://localhost:1236](http://localhost:1236).

Do sprawdzenia statusu i ponownego zasilenia danych:

```bash
pnpm mobile:demo:status
pnpm mobile:demo:seed
```

Losowe hasła są zapisane wyłącznie lokalnie w
<code>.state/mobile-demo/credentials.env</code> z prawami <code>0600</code>. Nie kopiuj
ich do README, issue, logów ani commitów.

Jeśli port 1236 jest zajęty, wybierz inny port:

```bash
MOBILE_DEMO_HTTP_PORT=1237 pnpm mobile:demo:up
```

Pełny scenariusz prezentacji i zakres danych opisuje
[Mobile/SHOWCASE_DEMO.md](../Mobile/SHOWCASE_DEMO.md). Galeria gotowych materiałów
znajduje się w [Mobile/docs/screenshots/README.md](../Mobile/docs/screenshots/README.md).

## 6. Uruchomienie klienta Mobile

Po wykonaniu <code>pnpm mobile:demo:up</code> uruchom wybraną platformę:

```bash
pnpm mobile:demo:ios
```

albo:

```bash
pnpm mobile:demo:android
```

iOS Simulator łączy się z lokalnym API przez <code>127.0.0.1:1236</code>, a Android
Emulator przez <code>10.0.2.2:1236</code>. To demo nie wymaga domeny, EAS, kont
sklepowych ani tunelu internetowego.

Szczegółowe wymagania, prebuild, credentials i cleanup znajdują się w
[Mobile/QUICK_START.md](../Mobile/QUICK_START.md).

## 7. Profile opcjonalne

### Docker Model Runner / LLM

Bazowy profil celowo nie wymaga modelu. Jeśli Docker Model Runner jest dostępny, włącz
lokalny wariant:

```bash
docker compose -f docker-compose.yml -f docker-compose.llm.yml up -d --build
```

Sprawdź stan:

```bash
curl --fail http://localhost:1235/llm/health
```

Model jest pomocniczy. Niedostępność, timeout albo niepoprawna odpowiedź modelu nie
powinna blokować zapisania zgłoszenia — backend zapisuje je z fallbackiem do ręcznej
weryfikacji. Szczegóły i ograniczenia opisuje
[docs/docker-model-runner.md](docker-model-runner.md).

### Redis

Redis jest przeznaczony dla wspólnego cache i rozproszonego rate limitingu. Tryby
<code>local</code> i <code>external</code> wymagają plików sekretów oraz osobnego
override'u. Procedurę przygotowania i testowania opisuje
[runbook Redis](redis-operations.md).

Lokalny provider:

```bash
docker compose -f docker-compose.yml -f docker-compose.redis.local.yml up -d --build
```

Nie ustawiaj <code>REDIS_MODE=local</code> bez tego override'u i wymaganych plików
sekretów.

### Obserwowalność

Domyślnie telemetryka jest wyłączona. Tryb lokalny uruchamia Collector, Prometheus, Loki,
Tempo, Grafanę i Alertmanager:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.local.yml \
  up -d
```

Tryb z zewnętrznym OTLP:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.external.yml \
  up -d
```

Profile <code>local</code> i <code>external</code> są wzajemnie wyłączne. Wymagane
zmienne i pliki sekretów opisuje
[docs/environment-variables.md](environment-variables.md).

### Zewnętrzny Object Storage

Domyślny Compose używa RustFS. AWS S3, Cloudflare R2 albo inny S3-compatible provider
wymaga konfiguracji <code>S3_*</code>, wyłączenia lokalnego RustFS i walidacji
publicznego endpointu. Przed zmianą profilu przeczytaj
[docs/environment-variables.md](environment-variables.md) oraz
[kontrakt storage](phase-3-database-object-storage.md).

## 8. Praca nad kodem

Procesy developerskie uruchamia się z katalogu głównego:

```bash
pnpm dev:frontend
pnpm dev:backend
pnpm dev:authorization
```

Każdy proces działa w osobnym terminalu. Do szybkiego przeglądu całego produktu zalecany
jest jednak bazowy Compose, ponieważ odwzorowuje routing same-origin przez Nginx i
uruchamia komplet zależności infrastrukturalnych.

Najważniejsze polecenia repozytorium:

```bash
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

Pełna bramka jakości:

```bash
pnpm check
```

<code>pnpm check</code> obejmuje kontrolę źródeł, dead code, format, lint, typecheck,
testy, testy wariantów White-Label oraz build monorepo.

Pełny zestaw integracyjny uruchamia własny, izolowany Compose:

```bash
pnpm test:integration
```

## 9. Cleanup

Zwykłe zatrzymanie bazowego środowiska zachowuje wolumeny:

```bash
docker compose down
```

Zatrzymanie demo Mobile zachowuje jego dane i credentials:

```bash
pnpm mobile:demo:down
```

Pełne usunięcie wyłącznie izolowanego demo Mobile:

```bash
pnpm mobile:demo:clean
```

Jeśli chcesz wyzerować lokalną bazę bazowego Compose, możesz usunąć jego wolumeny:

```bash
docker compose down -v
```

Ta ostatnia komenda jest destrukcyjna dla lokalnych danych PostgreSQL, RabbitMQ, RustFS
i backupów tego projektu. Nie używaj jej na środowisku współdzielonym ani produkcyjnym.

## 10. Troubleshooting

### Kontener kończy się na starcie z błędem Redis

Jeśli widzisz komunikat o brakujących <code>REDIS_URL_FILE</code> albo
<code>RATE_LIMIT_HMAC_KEY_FILE</code>, istniejący <code>.env</code> ma
<code>REDIS_MODE=local</code>, ale uruchomiono bazowy Compose. Użyj świeżego
<code>.env.example</code> albo ustaw dla bazowego profilu:

```text
REDIS_MODE=disabled
LLM_RUNTIME=disabled
```

Profil Redis uruchamiaj wyłącznie z jego override'em i przygotowanymi sekretami.

### Port 1235 jest zajęty

Sprawdź proces albo kontener, który używa portu. Możesz zatrzymać lokalny stack, który
zajął port, lub przygotować osobny override Compose z innym portem Nginx. Nie zmieniaj
tylko <code>FRONTEND_ORIGIN</code> — publiczny port, Better Auth, S3 public endpoint
i routing muszą pozostać spójne.

### Kontenery są zdrowe, ale WEB nie odpowiada

Sprawdź po kolei:

```bash
docker compose ps
docker compose logs --tail=200 nginx
curl --fail http://localhost:1235/health
```

Nginx startuje dopiero po gotowości zależnych usług. Po zmianie certyfikatów albo
konfiguracji zbuduj i odtwórz kontenery:

```bash
pnpm certs:dev
docker compose up -d --build
```

### Mobile nie widzi API

- iOS Simulator używa <code>http://127.0.0.1:1236</code>;
- Android Emulator używa <code>http://10.0.2.2:1236</code>;
- sprawdź, czy działa <code>pnpm mobile:demo:status</code>;
- po zmianie modułu natywnego ponów <code>pnpm mobile:demo:ios</code> albo
  <code>pnpm mobile:demo:android</code>, ponieważ samo Metro nie przebudowuje
  CocoaPods ani Gradle.

### Demo nie może utworzyć danych

Sprawdź healthcheck i status bazy, a następnie ponów seed:

```bash
pnpm mobile:demo:status
pnpm mobile:demo:seed
```

Pamiętaj, że publiczny feed może być cachowany przez Nginx. Po reseedzie odczekaj na
wygaśnięcie cache albo odtwórz wyłącznie kontener Nginx projektu demo.

## 11. Dalsza dokumentacja

- [Indeks dokumentacji](README.md) — źródła prawdy, runbooki i archiwum;
- [audyt architektury obecnej](current-architecture-audit.md) — faktyczny runtime;
- [docelowa architektura White-Label](target-white-label-architecture.md) — kierunek
  rozwoju i granice usług;
- [zmienne środowiskowe](environment-variables.md) — ENV, sekrety i profile;
- [transport security](transport-security.md) — TLS/mTLS między usługami;
- [Kubernetes / K3s](../k8s/README_K8s.md) — wdrożenia klastrowe;
- [Mobile handoff](../Mobile/CLIENT_HANDOFF.md) — droga od lokalnego buildu do przekazania
  klientowi.
