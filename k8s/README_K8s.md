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
	- tworzy namespace
	- aplikuje ConfigMap i Secret
	- tworzy PVC
	- aplikuje deploye i serwisy
	- czeka na rollout bazy danych

Uruchom:

```bash
./deploy.sh zglosto
```

Skrypt zakłada, że obrazy są dostępne w demonie Dockera klastra (patrz punkt 1).

## 4) Ręczne wdrożenie krok-po-kroku

Jeśli chcesz przejść krok po kroku:

```bash
# 1. Namespace
kubectl apply -f k8s/base/namespace.yaml

# 2. Config i Secrets
kubectl apply -f k8s/config/

# 3. PVC (Storage)
kubectl apply -f k8s/storage/

# 4. Deployments i Services
kubectl apply -f k8s/services/

# 5. Ingress (opcjonalnie)
kubectl apply -f k8s/ingress/

# 6. NetworkPolicies
kubectl apply -f k8s/network/
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

## 6) Dostęp do aplikacji

- Jeśli używasz Ingress: dodaj wpis do `/etc/hosts` (np. `127.0.0.1 zglosto.local`) i otwórz `http://zglosto.local`.
- Bez Ingress (NodePort): sprawdź `kubectl get svc nginx -n zglosto` i użyj `minikube ip:NODEPORT` lub `minikube service nginx -n zglosto --url`.

## 7) Najczęstsze problemy i wskazówki

- Obrazy niedostępne: pamiętaj o `eval $(minikube docker-env)` lub `kind load docker-image`.

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