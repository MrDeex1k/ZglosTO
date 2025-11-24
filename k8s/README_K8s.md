# ZglosTO — Kubernetes deployment (kompletna instrukcja)

Ten plik zawiera pełne, krok po kroku instrukcje uruchomienia aplikacji ZglosTO na Kubernetes (lokalnie i w prostym środowisku testowym). Jeśli chcesz wykonać szybkie lokalne uruchomienie bez Kubernetesa, zobacz główny `README.md` (sekcja Docker Compose).

## Struktura katalogu

```
k8s/
├── base/              # Namespace
├── config/            # ConfigMaps i Secrets (szablony)
├── storage/           # PersistentVolumeClaims
├── services/          # Deployments i Services dla wszystkich usług
├── ingress/           # Konfiguracja Ingress
├── network/           # NetworkPolicies
└── README_K8s.md      # Ten plik
```

## Wymagania wstępne

- `kubectl` zainstalowany i skonfigurowany
- `docker` lub `podman` (obrazy będą budowane lokalnie)
- Lokalny klaster Kubernetes: preferowane `minikube` lub `kind` dla testów
- (opcjonalnie) Ingress Controller (np. `ingress-nginx`) jeśli chcesz używać hostów DNS/Ingress

## Bezpieczeństwo, Autoskalowanie i Load Balancing

### Pod Security Standards (PSS)

Wdrożone zostały **Pod Security Standards** - nowoczesny mechanizm bezpieczeństwa Kubernetes, który kontroluje politykę bezpieczeństwa na poziomie namespace'ów.

**Konfiguracja:**
- **Enforce:** `privileged` - pozwala na elastyczne ustawienia bezpieczeństwa
- **Warn:** `baseline` - ostrzega przed potencjalnymi problemami bezpieczeństwa bez blokowania deployment'ów

**Poziomy bezpieczeństwa:**
- **Privileged:** Maksymalne uprawnienia (domyślny dla kompatybilności)
- **Baseline:** Standardowe zabezpieczenia (blokuje root access, host namespaces, etc.)
- **Restricted:** Maksymalne bezpieczeństwo (wymaga ścisłego security context)

### Horizontal Pod Autoscaler (HPA) - Autoskalowanie Podów

**Horizontal Pod Autoscaler** automatycznie skaluje liczbę podów w odpowiedzi na obciążenie CPU.

**Konfiguracja dla poszczególnych serwisów:**

|       Serwis      | Próg CPU | Min Replik | Max Replik |           Opis           |
|-------------------|----------|------------|------------|--------------------------|
|    **Backend**    |  **70%** |     2      |      8     |  Główna logika aplikacji |
|   **Frontend**    |  **70%** |     2      |      6     |   Interfejs użytkownika  |
| **Authorization** |  **80%** |     1      |      5     | Autoryzacja użytkowników |
|  **LLM Service**  |  **85%** |     1      |      5     |    AI/ML przetwarzanie   |

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
- **Egress:** Specjalne reguły dla LLM service (dostęp do internetu)

### Wymagania dla Autoskalowania

**Przed uruchomieniem autoskalowania:**
1. **Metrics Server** musi być zainstalowany w klastrze
2. **Resource limits** muszą być zdefiniowane we wszystkich kontenerach
3. **Health checks** (liveness/readiness probes) muszą być skonfigurowane

**Monitorowanie autoskalowania:**
```bash
# Sprawdź status HPA
kubectl get hpa -n zglosto

# Szczegóły skalowania
kubectl describe hpa backend-hpa -n zglosto

# Monitoruj wykorzystanie zasobów
kubectl top pods -n zglosto
```

## 1) Przygotowanie obrazów

- Najszybciej: uruchom w katalogu projektu:

```bash
./build-images.sh latest
```

- Dla `minikube` przed budową wykonaj (zwróć uwagę na shell):

```bash
eval "$(minikube docker-env --shell zsh)"
./build-images.sh latest
```

- Dla `kind` zbuduj obrazy lokalnie, potem załaduj do klastra:

```bash
./build-images.sh latest
kind load docker-image zglosto/database:latest
kind load docker-image zglosto/backend:latest
# i tak dalej dla pozostałych obrazów
```

## 2) Konfiguracja (secrets i configmaps)

- Przed wdrożeniem zaktualizuj `k8s/config/secret.yaml` — zastąp placeholdery prawdziwymi wartościami (lokalnie możesz użyć `stringData` lub `kubectl create secret generic`).
- W `k8s/config/configmap.yaml` możesz dopasować wartości konfiguracyjne (adresy usług, email do pgAdmin, itp.).

Uwaga bezpieczeństwa: nie przechowuj prawdziwych haseł w repozytorium. Użyj SealedSecrets / ExternalSecrets / Vault w produkcji.

## 3) Szybkie wdrożenie (skrypt)

- W repozytorium jest pomocniczy skrypt `deploy.sh`, który:
	- tworzy namespace (z PSS - Pod Security Standards)
	- aplikuje ConfigMap i Secret
	- tworzy PVC
	- aplikuje deploye, serwisy i HPA (Horizontal Pod Autoscaler)
	- czeka na rollout bazy danych

Uruchom:

```bash
./deploy.sh zglosto
```

Skrypt zakłada, że obrazy są dostępne w demonie Dockera klastra (patrz punkt 1). Automatycznie konfiguruje autoskalowanie CPU-based dla wszystkich serwisów.

## 4) Ręczne wdrożenie krok-po-kroku

Jeśli chcesz przejść krok po kroku:

```bash
# 1. Namespace (z PSS - Pod Security Standards)
kubectl apply -f k8s/base/namespace.yaml

# 2. Config i Secrets
kubectl apply -f k8s/config/

# 3. PVC (Storage)
kubectl apply -f k8s/storage/

# 4. Deployments i Services (zawiera HPA - Horizontal Pod Autoscaler)
kubectl apply -f k8s/services/

# 5. Ingress (opcjonalnie, zawiera load balancing)
kubectl apply -f k8s/ingress/

# 6. NetworkPolicies (kontrola ruchu)
kubectl apply -f k8s/network/
```

**Uwaga:** Krok 4 automatycznie wdraża również Horizontal Pod Autoscaler (HPA) dla wszystkich serwisów z autoskalowaniem opartym na CPU.

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
- NetworkPolicy blokuje ruch - sprawdź reguły w `k8s/network/network-policies.yaml`

## 8) Aktualizacje i rollouts

- Aby zaktualizować obraz deploymentu:

```bash
kubectl set image deployment/backend backend=zglosto/backend:latest -n zglosto
kubectl rollout status deployment/backend -n zglosto
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