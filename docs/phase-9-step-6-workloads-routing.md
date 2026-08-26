# Faza 9 / krok 6 — workloady aplikacyjne i routing

## Status

Wdrożono 2026-07-24 dla profili Kubernetes i K3s.

## Zakres

Wspólna baza Kustomize uruchamia dziewięć workloadów: `frontend`, `nginx`,
`authorization`, `backend`, `media-worker`, `llm-gateway`, `pgbouncer`, `database` i
`rabbitmq`. `media-worker` jest oddzielnym Deploymentem, ale używa tego samego obrazu co
backend i uruchamia wyłącznie entrypoint workera Sharp. Nie wystawia Service ani endpointu
publicznego.

Frontend jest statycznym artefaktem TanStack Start SPA serwowanym przez Nginx w kontenerze.
Nie uruchamiamy procesu SSR. Publiczny ruch trafia najpierw do Ingressu, następnie do
wewnętrznego Nginx, który utrzymuje jeden kontrakt same-origin:

- `/` prowadzi do frontendu;
- `/api/auth/*` prowadzi po mTLS bezpośrednio do Authorization;
- `/api/*` prowadzi do backendu;
- `/llm/health` udostępnia wyłącznie bezpieczny healthcheck gatewaya;
- pozostałe `/llm/*` są odrzucane kodem `404`.

Backend oraz Nginx są jedynymi publicznymi pośrednikami do usług wewnętrznych. Nie ma
NodePort ani bezpośredniej ekspozycji Authorization, bazy, kolejki, PgBouncera,
`media-worker` lub Object Storage.

## Niezawodność

Każdy workload ma dedykowany ServiceAccount, requests/limits, readiness i liveness.
Workloady HTTP mają kontrolowany czas zakończenia, a worker zachowuje obsługę sygnałów
NestJS i zamknięcie konsumenta RabbitMQ. PDB chronią wieloreplikowe lub krytyczne
`backend`, `frontend`, `nginx`, `authorization` i `pgbouncer`. PDB nie jest dodawany do
jednoreplikowych usług, jeśli blokowałby planowe utrzymanie.

Skrypt `deploy.sh` przypina ten sam niezmienny tag obrazu backendu również do
`media-worker` i czeka na rollout wszystkich workloadów aplikacyjnych.

## Walidacja

`pnpm check:cluster-workloads-security` renderuje profile Kubernetes i K3s i sprawdza:

- komplet workloadów, ServiceAccount, zasoby i probes;
- brak Service dla `media-worker`;
- PDB;
- routing same-origin i brak dawnego plaintext `authorization:9955`;
- brak NodePort.

Pełny test publicznych ścieżek na rzeczywistym klastrze, z prawdziwym DNS i Ingressem,
wchodzi do certyfikacji profilu w Fazie 12.
