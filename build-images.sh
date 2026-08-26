#!/usr/bin/env bash

# Skrypt do budowania wszystkich obrazów Docker dla aplikacji ZglosTO
set -euo pipefail
trap 'echo "Błąd przy budowaniu obrazów (linia $LINENO)"; exit 1' ERR

REQUESTED_TAG=${1:-}
CONFIG_PATH=${2:-config/white-label/zglosto.yaml}

case "$CONFIG_PATH" in
    /*|../*|*/../*)
        echo "Ścieżka konfiguracji musi być względna wobec repozytorium i nie może zawierać '..': $CONFIG_PATH" >&2
        exit 1
        ;;
esac

if [ ! -f "$CONFIG_PATH" ]; then
    echo "Nie znaleziono konfiguracji White-Label: $CONFIG_PATH" >&2
    exit 1
fi

pnpm --silent --filter @zglosto/white-label-config build >/dev/null
CONFIG_METADATA=$(pnpm --silent --filter @zglosto/white-label-config metadata "$CONFIG_PATH" fields)
IFS=$'\t' read -r CITY_KEY CONFIG_VERSION CONFIG_CHECKSUM VALIDATED_CONFIG_PATH <<< "$CONFIG_METADATA"

TAG=${REQUESTED_TAG:-$CONFIG_VERSION}

if [[ ! "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
    echo "Nieprawidłowy tag obrazu: $TAG" >&2
    exit 1
fi

if [ "$TAG" = "latest" ]; then
    echo "Ostrzeżenie: tag 'latest' jest przeznaczony wyłącznie do lokalnego developmentu; rollout używa niezmiennego tagu wersji." >&2
fi

echo "Budowanie obrazów Docker dla aplikacji ZglosTO (tag: $TAG)..."
echo "Konfiguracja: $CITY_KEY / $CONFIG_VERSION / sha256:$CONFIG_CHECKSUM"
echo "Plik: $VALIDATED_CONFIG_PATH"

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
docker build -f database/Dockerfile -t "zglosto/database:$TAG" .
check_command $? "Obraz zglosto/database:$TAG"

echo "Budowanie obrazu PgBouncera..."
docker build -f pgbouncer/Dockerfile -t "zglosto/pgbouncer:$TAG" .
check_command $? "Obraz zglosto/pgbouncer:$TAG"

echo "Budowanie obrazu RabbitMQ..."
docker build -f rabbitmq/Dockerfile -t "zglosto/rabbitmq:$TAG" .
check_command $? "Obraz zglosto/rabbitmq:$TAG"

echo "Budowanie obrazu autoryzacji..."
docker build \
    --build-arg "WHITE_LABEL_CONFIG_FILE=$CONFIG_PATH" \
    -f authorization/Dockerfile -t "zglosto/authorization:$TAG" .
check_command $? "Obraz zglosto/authorization:$TAG"

echo "Budowanie obrazu backendu..."
docker build \
    --build-arg "WHITE_LABEL_CONFIG_FILE=$CONFIG_PATH" \
    -f backend/Dockerfile -t "zglosto/backend:$TAG" .
check_command $? "Obraz zglosto/backend:$TAG"

echo "Budowanie obrazu LLM gateway..."
docker build -f llm_gateway/Dockerfile -t "zglosto/llm-gateway:$TAG" .
check_command $? "Obraz zglosto/llm-gateway:$TAG"

echo "Budowanie obrazu frontendu..."
docker build \
    --build-arg "WHITE_LABEL_CONFIG_FILE=$CONFIG_PATH" \
    -f frontend/Dockerfile -t "zglosto/frontend:$TAG" .
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
