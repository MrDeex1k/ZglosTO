# Obserwowalność: OpenTelemetry i stos Grafana

**Status:** fundament wdrożony w Fazie 9 / kroku 8 dnia 2026-07-24; bramka produkcyjna
pozostaje w Fazie 12  
**Zakres:** logi, metryki, distributed tracing, dashboardy, alerty i korelacja sygnałów

## Decyzja

Docelowy, niezależny od dostawcy stos obserwowalności składa się z:

- OpenTelemetry SDK w usługach aplikacyjnych;
- OpenTelemetry Collector jako wspólnej warstwy odbioru, przetwarzania i eksportu;
- Prometheus jako magazynu metryk;
- Loki jako magazynu logów;
- Tempo jako magazynu distributed traces;
- Grafana jako wspólnego interfejsu do metryk, logów i śladów;
- Alertmanager jako mechanizmu routingu alertów Prometheusa.

Prometheus nie przechowuje logów. Grafana nie jest magazynem danych. OpenTelemetry nie
zastępuje backendów przechowywania, lecz zapewnia wspólny model instrumentacji i transportu.

```text
backend / authorization / llm_gateway / media_worker
                         |
                         v
              OpenTelemetry Collector
                 |         |         |
                 v         v         v
            Prometheus    Loki      Tempo
                 \         |         /
                          Grafana
```

## Logowanie

Każda usługa zapisuje strukturalne rekordy JSON do `stdout` albo `stderr`. Jest to podstawowy
kontrakt działający zarówno z `docker compose logs` i `kubectl logs`, jak i z późniejszym
Collectorem. Aplikacja nie zapisuje operacyjnych logów do plików wewnątrz kontenera i nie
wysyła ich bezpośrednio do Grafany, Prometheusa ani Loki.

Minimalny rekord zawiera:

- czas w UTC;
- poziom;
- `service.name`;
- stabilny `event.name`;
- `correlationId`;
- `traceId` i `spanId`, gdy istnieje aktywny span;
- kontrolowane dane zdarzenia bez sekretów i zbędnych danych osobowych.

Authorization używa tego samego kontraktu strukturalnego `stdout` co pozostałe usługi;
historyczny `auth_log.txt` i zależność loggera od systemu plików zostały usunięte. Logger
dodaje kontekst requestu
oraz propagację `X-Correlation-Id` i `traceparent`. Zdarzenia operacyjne i audytowe są jawnie
rozróżnione. Adresy e-mail, cookies, tokeny, treść zgłoszenia i sekrety nie trafiają do logów.
Identyfikator użytkownika może wystąpić wyłącznie w uzasadnionym zdarzeniu audytowym objętym
kontrolą dostępu i retencją.

SDK wysyła przez OTLP kopię rekordów aplikacyjnych do Collectora; ten wzbogaca je o
kontrolowane metadane środowiska, redaguje niedozwolone atrybuty i eksportuje do Loki.
Niezależny zapis JSON do `stdout`/`stderr` pozostaje źródłem dla `docker compose logs` oraz
`kubectl logs`; krok 8 nie wymaga privilegowanej kolekcji logów kontenerów z hosta. Awaria
Collectora albo backendu telemetrycznego nie może blokować requestu, zadania RabbitMQ ani
startu usługi.

## Metryki

Prometheus przechowuje wyłącznie numeryczne szeregi czasowe. W szczególności zbieramy:

- RED dla HTTP: rate, errors i duration;
- opóźnienie, timeouty, fallbacki oraz wynik dostępności LLM;
- backlog RabbitMQ, wiek najstarszej wiadomości, retry i DLQ;
- czas obróbki Sharp, liczbę wyników oraz zużycie CPU i pamięci `media_worker`;
- stan outboxa i opóźnienie publikacji;
- wykorzystanie puli PgBouncera i oczekujących klientów;
- PostgreSQL, Object Storage/RustFS i runtime Node.js;
- stan i odrzucenia pipeline'ów samego OpenTelemetry Collectora.

Adres e-mail, `userId`, `incidentId`, `correlationId`, `traceId`, object key i pełna ścieżka
HTTP nie mogą być etykietami Prometheusa. Dynamiczne ścieżki są normalizowane do nazw tras.
Takie identyfikatory należą do kontrolowanych logów albo śladów, ponieważ w metrykach
powodowałyby nieograniczoną kardynalność.

## Distributed tracing

Usługi propagują W3C Trace Context przez:

- REST/HTTPS i wewnętrzny REST/mTLS;
- Backend -> Authorization;
- Backend -> `llm_gateway` -> Docker Model Runner;
- envelope RabbitMQ wraz z istniejącymi `correlationId` i `causationId`.

Tempo przechowuje ślady. Trace nie zawiera treści zgłoszenia, obrazów, cookies, tokenów ani
pełnych payloadów. Grafana pozwala przejść pomiędzy metryką z exemplarem, śladem w Tempo
i logami Loki powiązanymi przez `traceId` albo `correlationId`.

## Wdrożenie

### Faza 9 — wdrożony fundament

Kolejność wdrożenia i test nieblokującej awarii opisuje
[plan wykonawczy Fazy 9](phase-9-execution-plan.md).

Wdrożono współdzielony pakiet `@zglosto/observability`, inicjalizowany przed modułami
aplikacji w `authorization`, `backend`, `media_worker` i `llm_gateway`. Zapewnia on
automatyczną instrumentację Node.js, OTLP/HTTP dla logów, metryk i śladów, własne metryki
RED i operacyjne oraz propagację W3C Trace Context przez HTTP i envelope RabbitMQ.
Instrumentacja jest bezpiecznym dodatkiem: błędny albo niedostępny Collector nie blokuje
startu usługi ani przepływu produktu.

Każdy profil wdrożeniowy oferuje dokładnie jeden z trzech wzajemnie wyłącznych trybów:

| Tryb       | SDK w aplikacji | Collector       | Lokalne backendy                                        |
| ---------- | --------------- | --------------- | ------------------------------------------------------- |
| `disabled` | wyłączony       | brak            | brak                                                    |
| `external` | włączony        | lokalny gateway | brak; Collector eksportuje do wskazanego endpointu OTLP |
| `local`    | włączony        | lokalny gateway | Prometheus, Loki, Tempo, Grafana i Alertmanager         |

Tryb `both` nie istnieje. W `external` wyłącznie Collector zna endpoint oraz nagłówek
autoryzacyjny z Secretu; aplikacje wysyłają OTLP tylko do prywatnego Collectora. W `local`
Grafana jest jedynym interfejsem użytkownika, a pozostałe backendy pozostają w sieci
wewnętrznej. Zdecydowano się na centralny Collector jako Deployment/kontener zamiast
agenta DaemonSet: obecny SDK eksportuje również logi aplikacyjne, a ten układ zachowuje
identyczny kontrakt na pojedynczym hoście i w mniejszych klastrach.

Docker Compose:

```bash
# disabled — domyślny profil podstawowy
docker compose up -d

# external — wymagane OTEL_EXTERNAL_ENDPOINT i plik autoryzacji
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.external.yml up -d

# local — wymagany plik z hasłem administratora Grafany
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.local.yml up -d
```

W trybie lokalnym Grafana jest dostępna wyłącznie z hosta pod
`http://127.0.0.1:${GRAFANA_PORT:-3001}`. Kubernetes i K3s wybierają odpowiadający overlay
`*-observability-external` albo `*-observability-local`; overlay podstawowy oznacza
`disabled`. Dostęp operatorski do lokalnej Grafany odbywa się przez port-forward:

```bash
kubectl -n zglosto port-forward service/grafana 3001:3000
```

Maszynowym źródłem prawdy jest `deploy/observability-contract.json`, a
`pnpm check:observability` renderuje wszystkie wspierane warianty Compose/Kubernetes/K3s,
także połączenia z RustFS, odrzuca `both` oraz sprawdza nieblokującą awarię Collectora.
Szczegółowy wynik wdrożenia opisuje
[Faza 9 / krok 8](phase-9-step-8-observability.md).

### Faza 12 — bramka produkcyjna

Uzgodnione profile `minimal` i `recommended` mają `OBSERVABILITY_MODE=disabled`.
Nie oznacza to usunięcia stosu. Lokalny profil observability pozostaje trybem
diagnostycznym uruchamianym podczas certyfikacji i strojenia, natomiast nie jest
obowiązkowym kosztem małego wdrożenia.

- dashboard rozszerzono o RED, bazę przez PgBouncera, Object Storage, RabbitMQ/outbox,
  `media_worker`, LLM, Redis i cache; bezpośrednie metryki eksportera PgBouncera/PostgreSQL
  można dodać dopiero po pomiarze ich kosztu na hoście referencyjnym;
- dodano i zwalidowano `promtool` 12 reguł alertów; docelowy receiver i routing
  Alertmanagera wymagają danych operatora;
- retencja, limity wolumenu i kardynalności;
- RBAC, TLS i brak publicznego dostępu do backendów telemetrycznych;
- lokalny test korelacji `metryka -> trace -> log` przeszedł z 22 wspólnymi trace ID;
- wykorzystanie telemetryki podczas testów obciążeniowych i strojenia PgBouncera,
  autoskalowania workera oraz timeoutów LLM;
- osobny test awarii, przeciążenia i restartu Collectora oraz backendów dla Compose;
- opcjonalne powtórzenie na K3s po zakończeniu Compose. Rozbudowany Kubernetes pozostaje
  zamrożony.

Pakiety npm i obrazy fundamentu są przypięte do dokładnych wersji. Zależności npm zostały
dodane zgodnie z projektową kwarantanną publikacji i przez Socket Firewall; ich dalsze
aktualizacje podlegają tej samej polityce.
