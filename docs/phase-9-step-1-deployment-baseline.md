# Faza 9 / krok 1 — baseline profili wdrożeniowych

## Status

**Wdrożony 2026-07-24.**

Krok ustanawia jedno maszynowo sprawdzane źródło prawdy o bieżącym pokryciu Docker Compose,
Kubernetes i K3s. Nie dodaje jeszcze brakujących workloadów ani produkcyjnego override'u
Compose — to zakres kolejnych kroków Fazy 9.

## Źródła prawdy

- `deploy/deployment-baseline.json` — wersjonowana macierz profili, usług, nazw i polityk;
- `k8s/base/kustomization.yaml` — wspólna baza manifestów;
- `k8s/overlays/kubernetes/kustomization.yaml` — ogólny overlay Kubernetes;
- `k8s/overlays/k3s/kustomization.yaml` — overlay K3s;
- `scripts/check-deployment-baseline.ts` — automatyczna walidacja baseline'u;
- `pnpm check:deployment-baseline` — samodzielna komenda;
- `pnpm check:source` — obowiązkowa bramka repozytorium obejmująca baseline.

## Inwentaryzacja

| Komponent     | Compose | Kubernetes | K3s | Status klastrowy po kroku 1 |
| ------------- | ------- | ---------- | --- | --------------------------- |
| authorization | tak     | tak        | tak | istniejący workload         |
| backend       | tak     | tak        | tak | istniejący workload         |
| database      | tak     | tak        | tak | istniejący workload         |
| frontend      | tak     | tak        | tak | istniejący workload         |
| llm_gateway   | tak     | tak        | tak | nazwa DNS `llm-gateway`     |
| nginx         | tak     | tak        | tak | istniejący workload         |
| media_worker  | tak     | nie        | nie | do dodania w Fazie 9        |
| pgbouncer     | tak     | nie        | nie | do dodania w Fazie 9        |
| rabbitmq      | tak     | nie        | nie | do dodania w Fazie 9        |
| rustfs        | tak     | nie        | nie | opcjonalny overlay później  |

Różnica `_` kontra `-` nie oznacza dwóch kontraktów domenowych. Macierz utrzymuje nazwę
logiczną `llm_gateway`/`media_worker`, nazwę usługi Compose oraz poprawną nazwę DNS
Kubernetes `llm-gateway`/`media-worker`.

## Przyjęta struktura

```text
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── serviceaccounts.yaml
│   ├── config/
│   ├── ingress/
│   ├── network/
│   ├── services/
│   └── storage/
├── overlays/
│   ├── kubernetes/kustomization.yaml
│   └── k3s/kustomization.yaml
└── examples/
    └── README.md
```

Każdy istniejący Deployment używa dedykowanego ServiceAccount. Wspólne etykiety
`app.kubernetes.io/part-of` i `app.kubernetes.io/managed-by` pochodzą z bazy, a overlay
dodaje `app.kubernetes.io/platform`.

## Polityka bezpieczeństwa baseline'u

Walidator odrzuca:

- rozbieżność między usługami Compose a macierzą;
- rozbieżność między wyrenderowanymi Deploymentami a macierzą;
- obraz z tagiem `latest`;
- `Secret` renderowany bezpośrednio przez Kustomize;
- pgAdmin, stary `llm-service`, `llm_service` lub FastAPI;
- brak wspólnych etykiet albo dedykowanego ServiceAccount;
- niedeterministyczny/błędny render overlayu.

Pierwotny krok 1 pozostawił niewdrażany przykład zbiorczego Secretu. Krok 4 zastąpił go
maszynowym kontraktem `deploy/cluster-secret-contract.json`: oddzielne zasoby są
dostarczane zewnętrznie i montowane do workloadów jako pliki read-only.

## Świadome luki przekazane następnym krokom

- `phase9-baseline` jest jawnym tagiem technicznym bez `latest`; docelowe obrazy z registry
  przypięte digestem powstaną w krokach 2 i 11.
- Produkcyjny Compose powstaje w kroku 2.
- Brakujące workloady klastrowe powstaną w krokach 5-6.
- Aktualne wartości ENV, TLS/mTLS, sekrety, storage, routing i NetworkPolicy przejdą
  właściwe modernizacje w krokach 4-7.
- Krok 3 rozdzielił już ingress i storage overlayów oraz zapisał jawne wymagania
  Metrics Server, KEDA i cert-manager w `deploy/cluster-profiles.json`.

## Wynik bramki

Po wdrożeniu kroku:

- Compose raportuje 10 usług;
- overlay Kubernetes raportuje 6 obecnych Deploymentów;
- overlay K3s raportuje te same 6 obecnych Deploymentów;
- oba overlaye renderują się deterministycznie;
- render nie zawiera `latest`, jawnego Secretu ani historycznych komponentów.

To historyczny wynik bramki kroku 1. Po kroku 5 oba overlaye raportują osiem workloadów:
sześć pierwotnych oraz PgBouncera i RabbitMQ; PostgreSQL i RabbitMQ są teraz
StatefulSetami.
