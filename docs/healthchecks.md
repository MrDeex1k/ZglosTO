# Healthchecki Fazy 0

## Cel

Healthchecki rozrozniaja proces, ktory zyje, od uslugi gotowej do obslugi ruchu. Nie sa testami przeplywow biznesowych; te naleza do smoke testow i testow integracyjnych.

## Kontrakt

| Usluga          | Liveness           | Readiness                   | Compose                     | Uwagi                                                                                                              |
| --------------- | ------------------ | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `frontend`      | `GET /health/live` | `GET /health/ready`         | `GET /health/ready`         | Build waliduje YAML, a start Nginx wymaga artefaktu readiness z wersja i checksumem.                               |
| `backend`       | `GET /health/live` | `GET /health/ready`         | `GET /health/ready`         | Sprawdza PostgreSQL, Object Storage i opcjonalny Redis; publiczna ścieżka to `/api/health/ready`.                  |
| `authorization` | `GET /health/live` | `GET /health/ready`         | mTLS `GET /health/ready`    | Sprawdza PostgreSQL i opcjonalny Redis; probe ma osobną tożsamość ograniczoną do `/health*`.                       |
| `database`      | proces PostgreSQL  | TLS `SELECT 1`              | TLS `SELECT 1`              | Używa `DATABASE_DIRECT_URL`, `verify-full`, Database CA i DNS `database`.                                          |
| `pgbouncer`     | proces PgBouncer   | TLS `SELECT 1`              | TLS `SELECT 1`              | Klient weryfikuje pooler, a pooler weryfikuje PostgreSQL; oba odcinki wymagają TLS 1.3 i SCRAM.                    |
| `rabbitmq`      | diagnostics ping   | AMQPS/TLS handshake         | ping + zweryfikowany TLS    | Listener AMQP plaintext jest wyłączony; probe weryfikuje Service CA i DNS `rabbitmq`.                              |
| `media_worker`  | proces Node        | PostgreSQL + RabbitMQ + S3  | prywatny artefakt plikowy   | Brak HTTP; artefakt zawiera PID, a zależności są sprawdzane przez TLS 1.3, AMQPS i neutralną sondę Object Storage. |
| `rustfs`        | `GET /health/live` | `GET /health/ready`         | `GET /health/ready`         | Opcjonalny lokalny override S3-compatible pozostaje dostępny wyłącznie w sieci wewnętrznej.                        |
| `llm_gateway`   | `GET /health/live` | `GET /health/ready`         | `GET /health/live`          | Liveness gatewaya nie zależy od modelu; readiness inferencji zwraca `503`, gdy aktywny runtime jest niedostępny.   |
| `nginx`         | `GET /health`      | `GET /api/auth/get-session` | `GET /api/auth/get-session` | Sprawdza proces proxy oraz jego rzeczywisty kanał mTLS do Authorization.                                           |

## Odpowiedzi

Poprawny liveness ma kod `200` i minimalna odpowiedz:

```json
{
  "status": "ok",
  "service": "backend"
}
```

Readiness backendu i authorization zwraca `200` z `database: "up"` i stanem konfiguracji:

```json
{
  "status": "ok",
  "service": "backend",
  "database": "up",
  "objectStorage": "up",
  "redis": "up",
  "config": {
    "status": "valid",
    "configVersion": "zglosto-2026-07-18-step9",
    "checksum": "sha256"
  }
}
```

Przy `REDIS_MODE=disabled` pole `redis` ma wartość `disabled`. Gdy wyłącznie Redis jest
niedostępny, endpoint pozostaje gotowy do obsługi ruchu i zwraca kod `200`:

```json
{
  "status": "degraded",
  "service": "backend",
  "database": "up",
  "objectStorage": "up",
  "redis": "down",
  "config": {
    "status": "valid",
    "configVersion": "zglosto-2026-07-24-phase8-step14",
    "checksum": "sha256"
  }
}
```

Nie należy usuwać takiego poda z ruchu: lokalny rate limiting nadal działa, a publiczna
lista przechodzi do PostgreSQL. Niedostępność PostgreSQL lub Object Storage backendu nadal
zwraca `503` i `status: error`; Authorization zwraca `503` przy niedostępnej bazie.

Backend i authorization startuja po gotowosci PgBouncera, a ich `SELECT 1` przechodzi przez
pooler po zweryfikowanym TLS. Healthcheck PostgreSQL nie używa samego `pg_isready`: wykonuje
rzeczywiste zapytanie przez `DATABASE_DIRECT_URL` z `verify-full`. Backend dodatkowo wykonuje neutralne `HeadBucket`; przy niedostępnym aktywnym
providerze zwraca `503` i `objectStorage: "down"`.

Readiness zależne od bazy korzysta z tej samej zweryfikowanej ścieżki co ruch aplikacyjny.
Probe Authorization przechodzi przez mTLS z dedykowaną tożsamością, a probe Nginx przez jego
publiczną trasę Better Auth i certyfikat `nginx-client`. Nie istnieje boczny listener HTTP.
Testy negatywne TLS/mTLS opisuje
[kontrakt bezpieczeństwa transportu](transport-security.md).
Bledny albo brakujacy
White-Label YAML zatrzymuje backend i authorization przed otwarciem portu, wiec readiness nie
moze zwrocic sukcesu. Odpowiedz nie zawiera danych polaczenia ani pelnego komunikatu bledu.

Frontend statyczny nie ma runtime Node. Vite waliduje YAML i emituje `health/ready.json`, a
skrypt startowy obrazu odmawia uruchomienia Nginx bez poprawnego artefaktu. `GET /health/ready`
zwraca wersje oraz checksum; liveness sprawdza wylacznie proces Nginx.

`media_worker` nie otwiera listenera tylko dla healthchecka. Po poprawnym `SELECT 1` przez
PgBouncer/TLS, deklaracji topologii RabbitMQ przez AMQPS i sondzie aktywnego Object Storage
zapisuje prywatny artefakt z czasem i PID-em. Awaria dowolnej zależności usuwa artefakt;
cykliczna sonda odtwarza go po powrocie usługi. Shutdown usuwa readiness przed zamknięciem
transportów.

`llm_gateway` normalizuje stan aktywnego runtime'u:

```json
{
  "status": "ok",
  "service": "llm_gateway",
  "model": "ai/gemma3-qat:1B-Q4_K_M",
  "enabled": true,
  "loaded": false,
  "error": "model_unavailable"
}
```

Przy wyłączonym runtime pola mają `enabled: false`, `loaded: false` i
`error: "model_disabled"`. Brak modelu nie oznacza awarii procesu gatewaya ani nie blokuje
healthchecka Compose, ale `/health/ready` zwraca `503`. W wariancie DMR readiness sprawdza
OpenAI-compatible `GET /v1/models` i obecność skonfigurowanego modelu.

## Uruchomienie

Po zbudowaniu i uruchomieniu srodowiska statusy sa widoczne przez:

```bash
docker compose ps
curl --fail http://localhost:1235/health
curl --fail http://localhost:1235/api/health
curl --fail http://localhost:1235/llm/health
```

Automatyzacje opisuje [smoke test startu Compose](compose-smoke-tests.md).
Odporność opcjonalnego Redisa sprawdza:

```bash
pnpm test:redis-failure
```
