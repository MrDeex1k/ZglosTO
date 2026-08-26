# Faza 9 / krok 8 — fundament obserwowalności

## Status

**Wdrożony 2026-07-24.**

Krok ustanawia jeden kontrakt logów, metryk i distributed tracing dla Docker Compose,
Kubernetes oraz K3s. Nie jest jeszcze końcową certyfikacją SLO, retencji ani alert routingu;
te elementy pozostają bramką Fazy 12 po testach kompletnego systemu.

## Zrealizowany zakres

- dodano współdzielony pakiet TypeScript `@zglosto/observability`;
- SDK startuje przez `node --import @zglosto/observability/register` przed kodem aplikacji;
- `authorization`, `backend`, `media_worker` i `llm_gateway` eksportują OTLP/HTTP logi,
  metryki i ślady;
- W3C `traceparent` jest propagowany przez HTTP/mTLS oraz RabbitMQ;
- Authorization nie zapisuje już `auth_log.txt`; usługi emitują strukturalny JSON do
  `stdout`/`stderr`;
- dodano metryki RED HTTP oraz metryki bazy, storage, outboxa, RabbitMQ, Sharp i LLM;
- dynamiczne identyfikatory i dane prywatne są usuwane z logów oraz nie są etykietami
  metryk;
- lokalny stos zawiera przypięte wersje Collectora, Prometheusa, Loki, Tempo, Grafany i
  Alertmanagera;
- RabbitMQ udostępnia prywatny endpoint pluginu `rabbitmq_prometheus`;
- dodano provisioning źródeł Grafany, podstawowy dashboard i reguły alertów startowych;
- Faza 10 rozszerzyła dashboard o stan i p95 Redis oraz dodała alerty niedostępności,
  błędów operacji i wysokiego opóźnienia;
- shutdown usług opróżnia bufory telemetryki, ale awaria eksportera nie blokuje produktu.

## Wspierana modułowość

Obserwowalność ma dokładnie trzy tryby:

1. `disabled` — brak SDK, Collectora i lokalnych backendów;
2. `external` — aplikacje wysyłają do prywatnego Collectora, a Collector do jednego
   zewnętrznego endpointu OTLP;
3. `local` — Collector eksportuje do lokalnego Prometheusa, Loki i Tempo, a Grafana
   udostępnia widok operatorski.

Nie istnieje tryb `both`. Tryby są wzajemnie wyłączne, aby liczba wspieranych kombinacji była
ograniczona i testowalna. Obserwowalność jest niezależna od wyboru Object Storage:
zewnętrzne S3/R2 i RustFS mają zweryfikowane warianty klastrowe.

| Platforma  | `disabled`           | `external`                                       | `local`                                       |
| ---------- | -------------------- | ------------------------------------------------ | --------------------------------------------- |
| Compose    | `docker-compose.yml` | plus `docker-compose.observability.external.yml` | plus `docker-compose.observability.local.yml` |
| Kubernetes | `kubernetes`         | `kubernetes-observability-external`              | `kubernetes-observability-local`              |
| K3s        | `k3s`                | `k3s-observability-external`                     | `k3s-observability-local`                     |

Warianty klastrowe z RustFS dodają infiks `rustfs`, np.
`k3s-rustfs-observability-local`.

## Sekrety i dostęp

- `external` wymaga endpointu OTLP i sekretu autoryzacyjnego. Poświadczenia otrzymuje
  wyłącznie Collector.
- `local` wymaga sekretu hasła administratora Grafany.
- Compose publikuje Grafanę tylko na loopback hosta; Kubernetes/K3s nie wystawiają jej
  przez publiczny Ingress.
- Collector i wszystkie backendy są objęte wewnętrzną siecią lub NetworkPolicy.

## Walidacja

```bash
pnpm check:observability
pnpm check
```

Pierwsza komenda:

- renderuje trzy profile Compose;
- renderuje tryby `disabled`, `external` i `local` dla Kubernetes oraz K3s;
- sprawdza kompozycje z RustFS;
- pilnuje dokładnego składu każdego trybu i przypiętych obrazów;
- odrzuca `both`;
- sprawdza, że brak Collectora nie zatrzymuje procesu produktu;
- blokuje powrót plikowego loggera Authorization.

Kontrakt odporności Redis dodatkowo sprawdzają:

```bash
pnpm check:redis-resilience
pnpm test:redis-failure
```

Konfiguracje Collectora zostały zweryfikowane poleceniem `otelcol validate`, a konfigurację
i reguły Prometheusa sprawdzono przez `promtool`. Pełne ćwiczenia awarii, retencji,
kardynalności, korelacji `metryka -> trace -> log`, SLO i kanałów Alertmanagera należą do
Fazy 12.

## Następny krok

Faza 9 / krok 9 wdraża dokładne autoskalowanie `media_worker`: `1` replika dla backlogu
`0-3`, `2` dla `4-7`, `3` dla `8-11` oraz `4` dla `12+`, z powrotem do jednej repliki po
180 sekundach stabilnego niskiego backlogu.
