# ZglosTO — bieżący deployment testowy Kubernetes

Ten plik zawiera pełne, krok po kroku instrukcje uruchomienia aplikacji ZglosTO na Kubernetes (lokalnie i w prostym środowisku testowym). Jeśli chcesz wykonać szybkie lokalne uruchomienie bez Kubernetesa, zobacz główny `README.md` (sekcja Docker Compose).

> **Status:** zakończona Faza 9 / kroki 1-11 ustanowiły neutralną bazę, jawne overlaye
> Kubernetes/K3s, pełne workloady, wspólny kontrakt konfiguracji i sekretów, usługi stanowe,
> PKI, izolację sieci, opcjonalną obserwowalność, autoskalowanie workera i scale-to-zero
> gatewaya oraz automatyczne testy Kind/Kubernetes i K3d/K3s. Końcowa certyfikacja na
> docelowej infrastrukturze pozostaje Fazą 12. Faza 11 ujednolici
> obrazy, a Faza 12 przeprowadzi osobną certyfikację. Docelowe wymagania opisują
> [plan Fazy 9](../docs/phase-9-execution-plan.md) oraz
> [modernizacja profili wdrożeniowych](../docs/k8s-k3s-modernization.md).

## Struktura katalogu

```
k8s/
├── base/              # Wspólne zasoby, ConfigMaps, PVC, workloady i polityki
├── overlays/
│   ├── kubernetes/    # ingress-nginx, standard, zewnętrzny Metrics Server
│   ├── kubernetes-rustfs/ # Kubernetes z lokalnym RustFS
│   ├── kubernetes-observability-{external,local}/
│   ├── kubernetes-redis-{external,local}/
│   ├── k3s/           # pakietowy Traefik, local-path i Metrics Server
│   ├── k3s-rustfs/    # K3s z lokalnym RustFS
│   ├── k3s-observability-{external,local}/
│   └── k3s-redis-{external,local}/
├── components/
│   ├── rustfs/        # opcjonalny, provider-neutralny komponent Object Storage
│   ├── observability-external/
│   ├── observability-local/
│   ├── redis-external/
│   └── redis-local/
├── examples/          # Informacje o zewnętrznym provisioningu sekretów
└── README_K8s.md      # Ten plik
```

## Wymagania wstępne

- `kubectl` z Kustomize v5 zainstalowany i skonfigurowany
- `docker` lub `podman` (obrazy będą budowane lokalnie)
- Lokalny klaster Kubernetes: preferowane `minikube` lub `kind` dla testów
- dla overlayu Kubernetes: ingress-nginx, klasa storage `standard` i Metrics Server
- dla overlayu K3s: niewyłączone pakietowe Traefik, `local-path` i Metrics Server
- dla obu profili: cert-manager, Stakater Reloader, CNI egzekwujące NetworkPolicy,
  KEDA `>=2.20.0` oraz KEDA HTTP Add-on `0.15.0` w namespace `keda`
- `ClusterIssuer/zglosto-public-issuer` i prawdziwa domena publiczna zamiast
  `zglosto.example.invalid`

Maszynowy kontrakt wyborów platformowych znajduje się w
`deploy/cluster-profiles.json`. K3s single-node nie zapewnia odporności na utratę hosta.
Rekomendowany wariant HA wymaga minimum trzech serwerów, stałego adresu rejestracji oraz
replikowanego albo zewnętrznego storage dla danych aplikacji. Szczegóły opisuje
[krok 3 Fazy 9](../docs/phase-9-step-3-kustomize-profiles.md).

## Profile Redis

Bazowe overlaye zachowują `REDIS_MODE=disabled`. Wariant z lokalnym Redis:

```bash
kubectl apply -k k8s/overlays/kubernetes-redis-local
kubectl apply -k k8s/overlays/k3s-redis-local
```

Wariant z usługą zewnętrzną:

```bash
kubectl apply -k k8s/overlays/kubernetes-redis-external
kubectl apply -k k8s/overlays/k3s-redis-external
```

Przed wdrożeniem operator dostarcza `zglosto-redis-credentials`; profil lokalny dodatkowo
`zglosto-redis-acl`, a zewnętrzny `zglosto-redis-external-ca`. Dokładne klucze opisuje
`deploy/redis-profile-contract.json`. Zewnętrzny URL musi używać `rediss://`; domyślna
NetworkPolicy dopuszcza porty `6379` i `6380`, a niestandardowy port lub CIDR wymaga
świadomego patcha operatora. Komponenty Redis można dołączyć do własnego overlayu razem z
komponentem RustFS i dokładnie jednym profilem obserwowalności.

```bash
pnpm check:redis
pnpm check:redis-resilience
```

Probe lokalnego Redisa uwierzytelniają się URL-em z `zglosto-redis-credentials`; użytkownik
`default` w ACL powinien być wyłączony. Awaria wyłącznie Redisa daje w Authorization i
backendzie HTTP `200` z `status: degraded`, dlatego zdrowe pody pozostają w routingu.
Diagnostykę, metryki, alerty i procedurę odzyskania opisuje
[runbook Redis](../docs/redis-operations.md).

## Bezpieczeństwo, Autoskalowanie i Load Balancing

### Pod Security Standards (PSS)

Wdrożone zostały **Pod Security Standards** - nowoczesny mechanizm bezpieczeństwa Kubernetes, który kontroluje politykę bezpieczeństwa na poziomie namespace'ów.

**Konfiguracja:**

- **Enforce:** `baseline` - blokuje uprzywilejowane kontenery, host namespaces i inne
  podstawowe naruszenia;
- **Warn:** `restricted` - wskazuje pozostałe odstępstwa, głównie kontrolowany root-init
  PostgreSQL/RabbitMQ.

**Poziomy bezpieczeństwa:**

- **Privileged:** Maksymalne uprawnienia (wyłącznie obecny tryb testowy)
- **Baseline:** Standardowe zabezpieczenia (blokuje privileged i host namespaces)
- **Restricted:** Maksymalne bezpieczeństwo (wymaga ścisłego security context)

### Horizontal Pod Autoscaler (HPA) - Autoskalowanie Podów

**Horizontal Pod Autoscaler** automatycznie skaluje liczbę podów w odpowiedzi na obciążenie CPU.

**Konfiguracja dla poszczególnych serwisów:**

| Serwis            | Próg CPU | Min Replik | Max Replik | Opis                     |
| ----------------- | -------- | ---------- | ---------- | ------------------------ |
| **Backend**       | **70%**  | 2          | 8          | Główna logika aplikacji  |
| **Frontend**      | **70%**  | 2          | 6          | Interfejs użytkownika    |
| **Authorization** | **80%**  | 1          | 5          | Autoryzacja użytkowników |

**Warunki skalowania:**

- **Skalowanie w górę:** Gdy średnie wykorzystanie CPU przekroczy próg przez co najmniej 60 sekund
- **Skalowanie w dół:** Gdy wykorzystanie CPU spadnie poniżej progu przez co najmniej 300 sekund
- **Stabilizacja:** Zapobiega zbyt częstemu skalowaniu (thrashing)

**Mechanizm działania:**

1. Metrics Server zbiera dane o wykorzystaniu CPU
2. HPA porównuje z zadanymi progami
3. Automatycznie dodaje/usuwa pody zgodnie z potrzebami

### Load Balancing

**Rodzaje load balancing w konfiguracji:**

#### 1. Service-level Load Balancing

- **Typ:** ClusterIP (wewnętrzny)
- **Algorytm:** Round-robin (domyślny)
- **Konfiguracja:** `sessionAffinity: None` - równomierny rozkład ruchu

#### 2. Ingress Load Balancing

- **Controller:** NGINX Ingress Controller
- **Algorytm:** `least_conn` - ruch kierowany do najmniej obciążonych podów
- **Timeout'y:** Skonfigurowane dla stabilności połączeń

#### 3. Network Policies

- **Izolacja:** Ruch między serwisami jest kontrolowany
- **Bezpieczeństwo:** Tylko niezbędne porty są otwarte
- **Egress:** Reguły `llm-gateway` ograniczają komunikację z opcjonalnym runtime'em modelu

Docker Model Runner nie korzysta ze starego HPA Python LLM. `llm_gateway` używa KEDA HTTP
Add-on i `InterceptorRoute`; sam model runtime pozostaje wymiennym providerem za gatewayem.
Połączenie backend → KEDA używa TLS, KEDA → gateway używa mTLS, a podpis HMAC chroni
integralność i autentyczność żądania end-to-end. Zewnętrzny provisioner musi utworzyć
`Secret/zglosto-llm-auth` z kluczem `hmac-key` (co najmniej 256 bitów w base64url).
Cert-manager wystawia `zglosto-keda-http-tls` w namespace `zglosto`; kontroler synchronizacji
sekretów musi kopiować jego `tls.key` oraz łańcuch `tls.crt` + `ca.crt` do sekretu o tej samej
nazwie w namespace `keda`. KEDA HTTP Add-on należy instalować z
`k8s/keda-http-values.yaml`. Skrypt `scripts/test-cluster-profile.sh` wykonuje ten krok
automatycznie w klastrze testowym.

### Wymagania dla Autoskalowania

**Przed uruchomieniem autoskalowania:**

1. **Metrics Server** musi być zainstalowany w klastrze
2. **KEDA 2.20+** i **KEDA HTTP Add-on 0.15.0** muszą działać w namespace `keda`
3. **Resource limits** muszą być zdefiniowane we wszystkich kontenerach
4. **Health checks** (liveness/readiness probes) muszą być skonfigurowane

**Monitorowanie autoskalowania:**

```bash
# Sprawdź status HPA
kubectl get hpa -n zglosto

# Sprawdź źródła KEDA i trasę interceptora
kubectl get scaledobject,triggerauthentication,interceptorroute -n zglosto

# Szczegóły skalowania
kubectl describe hpa backend-hpa -n zglosto
kubectl describe scaledobject media-worker -n zglosto
kubectl describe scaledobject llm-gateway -n zglosto

# Monitoruj wykorzystanie zasobów
kubectl top pods -n zglosto
```

## 1) Przygotowanie obrazów

Bazowe manifesty zawierają jawny tag `phase9-baseline`, a polityka repozytorium odrzuca
`latest`. `deploy.sh` przed rolloutem nadal przypina wybrany, niezmienny tag wydania.
Pozostawienie placeholdera w manifestach jest rozwiazaniem przejsciowym dla lokalnego klastra,
nie produkcyjna polityka wydan.

Frontend osadza publiczną konfigurację w artefakcie wydania. Kustomize generuje immutable
`ConfigMap` z tego samego zwalidowanego White-Label YAML i montuje go read-only jako
`/app/config/city.yaml` do Authorization i backendu. Hash treści w nazwie ConfigMap
automatycznie wymusza rollout po zmianie konfiguracji.

Przed pierwszym wdrożeniem produkcyjnym trzeba wprowadzić profesjonalny pipeline obrazów:
release registry, niezmienne tagi wersji i Git SHA, przypięcie digestów w manifestach, skan
podatności, SBOM, podpis obrazów, kontrolowany rollout/rollback oraz politykę retencji.
Tag `phase9-baseline` służy wyłącznie do renderowania i inwentaryzacji kroku 1.

- Najszybciej: uruchom w katalogu projektu:

```bash
./build-images.sh zglosto-2026-07-18-step9 config/white-label/zglosto.yaml
```

- Dla `minikube` przed budową wykonaj (zwróć uwagę na shell):

```bash
eval "$(minikube docker-env --shell zsh)"
./build-images.sh zglosto-2026-07-18-step9 config/white-label/zglosto.yaml
```

- Dla `kind` zbuduj obrazy lokalnie, potem załaduj do klastra:

```bash
./build-images.sh zglosto-2026-07-18-step9 config/white-label/zglosto.yaml
kind load docker-image zglosto/database:zglosto-2026-07-18-step9
kind load docker-image zglosto/backend:zglosto-2026-07-18-step9
# i tak dalej dla pozostałych obrazów
```

## 2) Konfiguracja (Secrets i ConfigMaps)

- `config/white-label/zglosto.yaml` pozostaje źródłem prawdy miasta. Po zmianie wykonaj
  `pnpm config:k8s:sync`; `pnpm check` wykrywa nieaktualną kopię.
- `k8s/base/config/runtime.env` zawiera wyłącznie publiczną konfigurację runtime.
- Kustomize generuje obie ConfigMapy jako immutable z hashem treści w nazwie.
- Przed wdrożeniem utwórz wszystkie zasoby opisane bez wartości w
  `deploy/cluster-secret-contract.json`, używając External Secrets, Sealed Secrets, CSI
  albo innego zatwierdzonego mechanizmu.
- Workloady montują sekrety jako nieopcjonalne pliki read-only `0440`; nie używają
  `secretKeyRef`, `envFrom` ani cichego fallbacku.

Sprawdzenie kontraktu:

```bash
pnpm check:cluster-config
```

## 3) Szybkie wdrożenie (skrypt)

- W repozytorium jest pomocniczy skrypt `deploy.sh`, który:
  - tworzy namespace (z PSS - Pod Security Standards)
  - wymaga wszystkich Secretów z `deploy/cluster-secret-contract.json`
  - renderuje i aplikuje overlay `k8s/overlays/kubernetes`
  - przypina niezmienny tag i wymusza rollout przez adnotacje wersji/checksumy
  - czeka na readiness i porownuje checksumy frontendu, backendu oraz authorization

Uruchom:

```bash
./deploy.sh zglosto zglosto-2026-07-18-step9 config/white-label/zglosto.yaml external disabled

# Wariant z RustFS:
./deploy.sh zglosto zglosto-2026-07-18-step9 config/white-label/zglosto.yaml rustfs disabled

# Z lokalnym stosem obserwowalności:
./deploy.sh zglosto zglosto-2026-07-18-step9 config/white-label/zglosto.yaml external local

# Z Collectorem eksportującym do zewnętrznego OTLP:
./deploy.sh zglosto zglosto-2026-07-18-step9 config/white-label/zglosto.yaml external external
```

Skrypt zakłada, że obrazy są dostępne w demonie Dockera klastra (patrz punkt 1). Automatycznie konfiguruje autoskalowanie CPU-based dla wszystkich serwisów.

## 4) Ręczne wdrożenie krok-po-kroku

Jeśli chcesz przejść krok po kroku:

```bash
# 1. Namespace (z PSS - Pod Security Standards)
kubectl apply -f k8s/base/namespace.yaml

# 2. Provisionuj zewnętrznie wszystkie Secrety i klucze opisane w:
#    deploy/cluster-secret-contract.json

# 3. Sprawdź deterministyczny render wybranego profilu
kubectl kustomize k8s/overlays/kubernetes

# 4. Zastosuj cały profil: ConfigMaps, PVC, workloady, Ingress i NetworkPolicy
kubectl apply -k k8s/overlays/kubernetes
```

**Uwaga:** Overlay wdraża HPA oparte na CPU, a `media_worker` używa wdrożonego w Fazie 9
skalowania KEDA według backlogu RabbitMQ.

## 4a) Usługi stanowe i wybór Object Storage

Wspólna baza zawiera:

- `StatefulSet/database` z PVC `20Gi` na PGDATA i `40Gi` na repozytorium pgBackRest;
- dwie repliki `Deployment/pgbouncer` i PDB;
- `StatefulSet/rabbitmq` z PVC `10Gi`;
- prywatne Service; plugin i port management RabbitMQ są wyłączone.

PVC utworzone przez StatefulSety mają retencję `Retain` zarówno przy usunięciu, jak i
scale-down. Usunięcie workloadu nie usuwa danych automatycznie.

Domyślne overlaye wymagają zewnętrznego S3/R2:

```bash
kubectl apply -k k8s/overlays/kubernetes
kubectl apply -k k8s/overlays/k3s
```

Opcjonalne warianty z RustFS:

```bash
kubectl apply -k k8s/overlays/kubernetes-rustfs
kubectl apply -k k8s/overlays/k3s-rustfs
```

K3s `local-path` nie zapewnia HA danych. Wariant wielowęzłowy musi używać replikowanego
storage albo zewnętrznych PostgreSQL, RabbitMQ i Object Storage.

Kontrakt sprawdza:

```bash
pnpm check:cluster-stateful
```

## 4b) Obserwowalność

Piąty argument `deploy.sh` wybiera jeden z trzech wzajemnie wyłącznych trybów:

- `disabled` — bazowy overlay, bez Collectora i backendów;
- `external` — Collector jako prywatny gateway do zewnętrznego OTLP; wymagany
  `Secret/zglosto-otel-external` z kluczem `AUTHORIZATION`;
- `local` — Collector, Prometheus, Loki, Tempo, Grafana i Alertmanager; wymagany
  `Secret/zglosto-grafana-admin` z kluczem `ADMIN_PASSWORD`.

Tryb `both` nie istnieje. `external` wymaga podmiany placeholdera endpointu OTLP w
komponencie przed wdrożeniem. Warianty z RustFS mają osobne złożone overlaye, np.
`k8s/overlays/k3s-rustfs-observability-local`.

Lokalna Grafana nie jest wystawiana przez Ingress. Operator otwiera ją tymczasowo:

```bash
kubectl -n zglosto port-forward service/grafana 3001:3000
```

Walidacja wszystkich kombinacji:

```bash
pnpm check:observability
```

## 5) Sprawdzanie statusu i debug

Podstawowe komendy:

```bash
kubectl get all -n zglosto
kubectl get pvc -n zglosto
kubectl get events -n zglosto --sort-by='.lastTimestamp' | tail -n 50
kubectl logs -n zglosto deployment/backend --tail=200
kubectl describe pod -n zglosto <pod-name>
```

**Autoskalowanie i bezpieczeństwo:**

```bash
# Sprawdź status Horizontal Pod Autoscaler (HPA)
kubectl get hpa -n zglosto

# Szczegóły autoskalowania
kubectl describe hpa backend-hpa -n zglosto

# Monitoruj wykorzystanie CPU/pamięci
kubectl top pods -n zglosto
kubectl top nodes

# Sprawdź politykę bezpieczeństwa namespace
kubectl get ns zglosto --show-labels

# PodSecurityStandards - sprawdź naruszenia
kubectl get events -n zglosto --field-selector reason=FailedPostStartHook
```

## 6) Dostęp do aplikacji

- Jeśli używasz Ingress: dodaj wpis do `/etc/hosts` (np. `127.0.0.1 zglosto.local`) i otwórz `http://zglosto.local`.
- Bez Ingress (NodePort): sprawdź `kubectl get svc nginx -n zglosto` i użyj `minikube ip:NODEPORT` lub `minikube service nginx -n zglosto --url`.

## 7) Najczęstsze problemy i wskazówki

- Obrazy niedostępne: pamiętaj o `eval $(minikube docker-env)` lub `kind load docker-image`.

**Problemy z autoskalowaniem:**

- `TARGETS: <unknown>` w HPA - czekaj na zebranie metryk przez Metrics Server (1-2 minuty)
- HPA nie skaluje - sprawdź czy Metrics Server jest uruchomiony: `kubectl get pods -n kube-system | grep metrics-server`
- Brak resource limits - HPA wymaga requests/limits w kontenerach

**Problemy bezpieczeństwa:**

- PSS blokuje deployment - sprawdź `kubectl get events -n zglosto` dla błędów bezpieczeństwa
- Ostrzeżenia PSS - sprawdź logi dla sugestii poprawy bezpieczeństwa
- Security Context problemy - upewnij się że obrazy obsługują wymagane ustawienia

**Load balancing:**

- Ruch nierównomierny - sprawdź `sessionAffinity` w Service'ach
- Ingress timeout - dostosuj `proxy-connect-timeout` w ingress annotations
- NetworkPolicy blokuje ruch - sprawdź reguły w
  `k8s/base/network/network-policies.yaml`

## 8) Aktualizacje i rollouts

- Aby zaktualizować obraz deploymentu:

```bash
./build-images.sh zglosto-2026-07-18-step10 config/white-label/zglosto.yaml
./deploy.sh zglosto zglosto-2026-07-18-step10 config/white-label/zglosto.yaml
```

## 9) Czyszczenie środowiska

- Aby usunąć namespace i wszystkie zasoby:

```bash
kubectl delete namespace zglosto --ignore-not-found
```

- Aby usunąć lokalny klaster Minikube:

```bash
minikube delete
```
