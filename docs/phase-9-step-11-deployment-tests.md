# Faza 9 / krok 11 — automatyzacja testów deploymentu

## Wynik

Krok wdrożono 2026-07-24 i zamyka on Fazę 9. Trzy wspierane profile mają jedną,
wersjonowaną bramkę automatyzacji:

- Docker Compose: `pnpm test:deployment:compose`;
- Kubernetes na jednorazowym klastrze Kind: `pnpm test:deployment:kubernetes`;
- K3s na jednorazowym klastrze K3d: `pnpm test:deployment:k3s`.

Historyczny kontrakt ukończenia fazy został usunięty po zamknięciu migracji. Pierwotny
workflow GitHub Actions został usunięty w Fazie 11, kroku 9: projekt nie korzysta z runnerów
GitHub-hosted, a rzeczywisty runner self-hosted nie jest jeszcze dostępny. Wszystkie bramki
pozostają wykonywalne lokalnie tymi samymi komendami PNPM i skryptami. Wersje runtime'ów,
obrazów węzłów i kontrolerów są przypięte — aktualizacja jest świadomą zmianą kontraktu,
a nie efektem pobrania `latest`.

## Walidacja statyczna

`pnpm check:cluster-workloads-security` sprawdza bieżące wymagania bezpieczeństwa workloadów.
Bramka sprawdza:

- deterministyczny render Kustomize;
- brak obrazów `latest`, jawnych `Secret`, pgAdmin, starego FastAPI i plaintext Auth;
- resources oraz liveness/readiness dla Deploymentów i StatefulSetów;
- pod-level `seccompProfile: RuntimeDefault`;
- `allowPrivilegeEscalation: false` dla każdego kontenera;
- `enableServiceLinks: false`, aby nazwy Service nie nadpisywały kontraktu ENV aplikacji;
- zachowanie entrypointu obrazu `media_worker`, który ładuje sekrety z plików `*_FILE`;
- kompletne adnotacje Reloadera w głównym `metadata` workloadu dla sekretów wymagających
  restartu procesu.

Testy mutacyjne potwierdzają, że polityka odrzuca osłabienie zabezpieczeń workloadów,
certyfikatów i NetworkPolicy. Standardowe schematy zasobów sprawdza
`scripts/validate-cluster-schemas.sh` z kubeconform 0.7.0. Schematy CRD KEDA, KEDA HTTP
Add-on i cert-managera są sprawdzane dodatkowo przez server-side dry-run po zainstalowaniu
przypiętych kontrolerów w klastrze testowym.

## Test runtime profili klastrowych

`scripts/test-cluster-profile.sh` tworzy od zera:

- Kubernetes: Kind 0.31.0 z Kubernetes 1.35.0;
- K3s: K3d 5.9.0 z K3s 1.36.2+k3s1.

Harness buduje i importuje ten sam zestaw obrazów `phase9-baseline`, instaluje cert-manager,
Reloader, KEDA i KEDA HTTP Add-on, dostarcza wyłącznie testowe sekrety runtime'u, wykonuje
server-side dry-run, aplikuje overlay z RustFS i uruchamia wspólny smoke. Smoke obejmuje:

- readiness workloadów, certyfikatów i ScaledObjectów;
- routing same-origin, granicę anonimowego auth i poprawny health LLM zarówno przy aktywnej
  replice, jak i po zamierzonym scale-to-zero;
- aplikacyjny kontrakt połączenia z DB przez PgBouncera;
- ponowne utworzenie poda backendu;
- ponowne utworzenie poda PostgreSQL z zachowaniem markera na PVC;
- aktualizację danych Secretu TLS i rollout backendu przez Reloader.

Klastrowy `RABBITMQ_URL` używa pełnej nazwy
`rabbitmq.zglosto.svc.cluster.local`. Jest ona objęta SAN-em certyfikatu i może zostać
rozwiązana zarówno przez aplikacje w namespace `zglosto`, jak i operator KEDA działający
w namespace `keda`.

Podczas wykonania harnessu wykryto i usunięto także realne problemy startowe: kolizję
`BACKEND_PORT` z service links, pominięcie loadera sekretów przez `command` workera,
niespójne mapowanie kluczy S3, skróconą nazwę RabbitMQ niewidoczną dla KEDA oraz adnotacje
Reloadera umieszczone wcześniej w szablonie poda.

Compose zachowuje szerszy istniejący test integracyjny obejmujący m.in. TLS/mTLS negatywny,
RabbitMQ, worker, retry/DLQ, outbox, Object Storage, backup/restore i nieblokującą awarię
telemetryki.

## Wykonana weryfikacja

Końcowa bramka 2026-07-24 zakończyła się powodzeniem:

- `pnpm check`: polityki źródeł i wdrożeń, OxFmt, OxLint, TypeScript, 212 testów Vitest,
  buildy White-Label i build wszystkich workspace'ów;
- kubeconform 0.7.0: 12 overlayów, `0` zasobów niepoprawnych i `0` błędów; CRD przeszły
  dodatkowo server-side dry-run na obu klastrach;
- Docker Compose/OrbStack: pełny test integracyjny, w tym TLS/mTLS, PgBouncer, RabbitMQ,
  worker, Object Storage oraz backup/restore;
- Kind 0.31.0 / Kubernetes 1.35.0: wspólny smoke zakończony powodzeniem;
- K3d 5.9.0 / K3s 1.36.2: ten sam smoke zakończony powodzeniem na klastrze z serwerem i
  agentem.

## Granica zakończenia Fazy 9

Faza 9 dostarcza powtarzalne kandydaty, polityki oraz wykonywalne testy trzech profili. Nie
udaje końcowej certyfikacji konkretnej infrastruktury produkcyjnej. Faza 12 nadal obejmuje:

- awarię węzła w realnym klastrze wielowęzłowym;
- mierzone RTO/RPO i pełny disaster-recovery drill;
- testy obciążeniowe, soak i empiryczne strojenie PgBouncera;
- pomiary progów KEDA, cold startu LLM i finalnych CPU/RAM;
- finalne SLI/SLO, retencję i routing alertów.

Taki podział pozwala zakończyć implementację platformy bez przypisywania lokalnemu Kind lub
K3d gwarancji, które może potwierdzić dopiero docelowa infrastruktura.
