#!/usr/bin/env bash

# Skrypt do budowania wszystkich obrazów Docker dla aplikacji ZglosTO
set -euo pipefail
trap 'echo "Błąd przy budowaniu obrazów (linia $LINENO)"; exit 1' ERR

TAG=${1:-latest}

echo "Budowanie obrazów Docker dla aplikacji ZglosTO (tag: $TAG)..."

check_command() {
    local rc=$1
    shift
    local msg="$*"
    if [ "$rc" -eq 0 ]; then
        echo "Udalo sie! $msg"
    else
        echo "Nie udalo sie! $msg"
        exit $rc
    fi
}

# Buduj wszystkie obrazy
echo "Budowanie obrazu bazy danych..."
docker build -t "zglosto/database:$TAG" ./database
check_command $? "Obraz zglosto/database:$TAG"

echo "Budowanie obrazu autoryzacji..."
docker build -t "zglosto/authorization:$TAG" ./authorization
check_command $? "Obraz zglosto/authorization:$TAG"

echo "Budowanie obrazu backendu..."
docker build -t "zglosto/backend:$TAG" ./backend
check_command $? "Obraz zglosto/backend:$TAG"

echo "Budowanie obrazu LLM service..."
docker build -t "zglosto/llm-service:$TAG" ./llm_service
check_command $? "Obraz zglosto/llm-service:$TAG"

echo "Budowanie obrazu frontendu..."
docker build -t "zglosto/frontend:$TAG" ./frontend
check_command $? "Obraz zglosto/frontend:$TAG"

echo "Budowanie obrazu nginx..."
docker build -t "zglosto/nginx:$TAG" ./nginx
check_command $? "Obraz zglosto/nginx:$TAG"

echo ""
echo "Wszystkie obrazy zostały zbudowane pomyślnie!"
echo ""
echo "Dostępne obrazy:"
docker images | grep zglosto || true
echo ""
echo "Dla minikube: eval \$(minikube docker-env)"
echo "Dla kind: kind load docker-image zglosto/*"


