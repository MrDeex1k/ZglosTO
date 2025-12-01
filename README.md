# ZglosTO

Serwis umożliwiający zgłaszanie incydentów w mieście.

Ten README zawiera dwie ścieżki uruchomienia:

- Szybkie uruchomienie lokalne — Docker Compose (zalecane do developmentu)
- Wdrożenie na Kubernetes — pełne środowisko (testy/zdalne środowiska)

------------------------------------------------------------

## 1) Szybkie uruchomienie — Docker Compose

Najprostszy sposób na lokalne uruchomienie wszystkich usług w jednym środowisku.

1. Zbuduj obrazy (opcjonalnie):

```bash
docker compose build
```

2. Uruchom w trybie deweloperskim:

```bash
docker compose up
# lub w tle
docker compose up -d
```

3. Zmienne środowiskowe:

Plik .env w glownym katalogu projektu:
```
#Node environment
NODE_ENV=...
VITE_API_BASE_URL=...

#Postgres 
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=...
POSTGRES_PORT=...
DB_HOST=...
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
DATABASE_URL=postgresql://...:...@...:.../...

#PgAdmin
PGADMIN_DEFAULT_EMAIL=...
PGADMIN_DEFAULT_PASSWORD=...

#BETTER-AUTH
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=...
AUTH_SERVICE_URL=...
FRONTEND_ORIGIN=...
PORT=....

#LLM
HF_TOKEN=...
```

Plik .env w katalogu frontend:
```
VITE_AUTH_URL=...
VITE_LLM_BASE_URL=...
VITE_API_URL=...
VITE_API_BASE_URL=...
VITE_FRONTEND_ORIGIN=...
```

4. Sprawdź logi i dostępność:

```bash
docker compose logs -f backend
docker compose ps
```

------------------------------------------------------------

## 2) Wdrożenie na Kubernetes (minikube / kind)

Jeśli potrzebujesz pełniejszego środowiska z oddzielnymi usługami, użyj Kubernetes. Instrukcja znajduje się w `k8s/README_K8s.md`.

Podsumowanie kroków:

1. Zbuduj obrazy lokalnie i udostępnij je klastrowi (minikube/kind):

```bash
# Dla minikube
eval "$(minikube docker-env --shell zsh)"
./build-images.sh latest

# Dla kind
./build-images.sh latest
kind load docker-image zglosto/backend:latest
```

2. Zaktualizuj `k8s/config/secret.yaml` z właściwymi hasłami lub skorzystaj z SealedSecrets/ExternalSecrets.

3. Uruchom skrypt wdrożeniowy (w katalogu repozytorium):

```bash
./deploy.sh zglosto
```

4. Sprawdź status i logi:

```bash
kubectl get pods -n zglosto
kubectl logs -n zglosto deployment/backend --tail=200
```

Pełną, szczegółową instrukcję dla Kubernetes znajdziesz w `k8s/README_K8s.md`.