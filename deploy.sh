#!/usr/bin/env bash

# Skrypt wdrożeniowy dla aplikacji ZglosTO na Kubernetes

set -euo pipefail
trap 'echo "Błąd wdrożenia (linia $LINENO)"; exit 1' ERR

NAMESPACE=${1:-zglosto}

echo "Rozpoczynam wdrażanie aplikacji ZglosTO na Kubernetes w namespace '$NAMESPACE'..."

check_command() {
        local rc=$?
        if [ "$rc" -eq 0 ]; then
                echo "Udalo sie! $1"
        else
                echo "Nie udalo sie! $1"
                exit $rc
        fi
}

# Sprawdzenie czy kubectl jest dostepny
kubectl version --client >/dev/null 2>&1
check_command "Sprawdzanie dostępności kubectl"

# Sprawdzenie polaczenia z klastrem
kubectl cluster-info >/dev/null 2>&1
check_command "Sprawdzanie połączenia z klastrem Kubernetes"

# Sprawdzenie czy obrazy Docker sa dostepne lokalnie (informacyjne)
echo "Sprawdzanie dostępności obrazów Docker (lokalnie)..."
for img in database authorization backend llm-service frontend nginx; do
    if ! docker image inspect "zglosto/${img}:latest" >/dev/null 2>&1; then
        echo "Ostrzeżenie: Obraz zglosto/${img}:latest nie znaleziony lokalnie. Możesz zbudować go przy pomocy ./build-images.sh"
    else
        echo "Znaleziono obraz: zglosto/${img}:latest"
    fi
done

# Utworzenie namespace
echo "Tworzenie namespace..."
kubectl apply -f k8s/base/namespace.yaml -n "$NAMESPACE" || kubectl create namespace "$NAMESPACE"
check_command "Utworzenie namespace $NAMESPACE"

# Zastosowanie konfiguracji
echo "Stosowanie konfiguracji..."
kubectl apply -f k8s/config/ -n "$NAMESPACE"
check_command "Zastosowanie ConfigMaps i Secrets"

# Utworzenie PVC dla storage
echo "Tworzenie PersistentVolumeClaims..."
kubectl apply -f k8s/storage/ -n "$NAMESPACE"
check_command "Utworzenie PersistentVolumeClaims"

# Wdrozenie bazy danych jako pierwszej
echo "Wdrażanie bazy danych..."
kubectl apply -f k8s/services/database-deployment.yaml -n "$NAMESPACE"
kubectl apply -f k8s/services/database-service.yaml -n "$NAMESPACE"
check_command "Wdrażanie PostgreSQL"

# Oczekiwanie na gotowosc bazy danych
echo "Oczekiwanie na gotowość bazy danych..."
kubectl rollout status deployment/database -n "$NAMESPACE" --timeout=300s
check_command "Baza danych jest gotowa"

# Wdrozenie pozostalych uslow
echo "Wdrażanie usług..."
kubectl apply -f k8s/services/ -n "$NAMESPACE"
check_command "Wdrażanie wszystkich usług"

# Zastosowanie Ingress
echo "Stosowanie Ingress..."
kubectl apply -f k8s/ingress/ -n "$NAMESPACE"
check_command "Konfiguracja Ingress"

# Zastosowanie NetworkPolicies
echo "Stosowanie NetworkPolicies..."
kubectl apply -f k8s/network/ -n "$NAMESPACE"
check_command "Konfiguracja NetworkPolicies"

# Sprawdzenie statusu wdrozenia
echo "Sprawdzanie statusu wdrożenia..."
kubectl get all -n "$NAMESPACE"

echo ""
echo "Wdrożenie zakończone pomyślnie!"
echo ""
echo "Informacje o dostępie:"
echo ""
echo "Sprawdź porty NodePort:"
echo "   kubectl get svc nginx -n $NAMESPACE"
echo ""
echo "Przykładowe adresy (porty mogą być inne):"
echo "   - Aplikacja główna: http://localhost:31235"
echo "   - PgAdmin: http://localhost:39753"
echo "   - Z Ingress: http://zglosto.local"
echo ""
echo "Aby sprawdzić logi usług:"
echo "   kubectl logs -f deployment/<service-name> -n $NAMESPACE"
echo ""
echo "Pamiętaj o:"
echo "   - Zbudowaniu obrazów Docker przed wdrożeniem (./build-images.sh)"
echo "   - Dla minikube: uruchom 'eval \$(minikube podman-env)' przed budowaniem"
echo "   - Dla kind: załaduj obrazy komendą 'kind load podman-image'"
echo "   - Zastąpieniu domyślnych haseł w k8s/config/secret.yaml:" 
echo "     * POSTGRES_PASSWORD"
echo "     * PGADMIN_DEFAULT_PASSWORD"
echo "     * BETTER_AUTH_SECRET"
echo "     * HF_TOKEN (jeśli używasz)"