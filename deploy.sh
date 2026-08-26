#!/usr/bin/env bash

# Skrypt wdrożeniowy dla aplikacji ZglosTO na Kubernetes

set -euo pipefail
trap 'echo "Błąd wdrożenia (linia $LINENO)"; exit 1' ERR

NAMESPACE=${1:-zglosto}
REQUESTED_TAG=${2:-}
CONFIG_PATH=${3:-config/white-label/zglosto.yaml}
OBJECT_STORAGE_MODE=${4:-external}
OBSERVABILITY_MODE=${5:-disabled}

if [ "$NAMESPACE" != "zglosto" ]; then
        echo "Faza 9 utrzymuje jeden kanoniczny namespace: zglosto (otrzymano: $NAMESPACE)." >&2
        exit 1
fi
case "$OBJECT_STORAGE_MODE:$OBSERVABILITY_MODE" in
        external:disabled) KUSTOMIZE_OVERLAY=k8s/overlays/kubernetes ;;
        external:external) KUSTOMIZE_OVERLAY=k8s/overlays/kubernetes-observability-external ;;
        external:local) KUSTOMIZE_OVERLAY=k8s/overlays/kubernetes-observability-local ;;
        rustfs:disabled) KUSTOMIZE_OVERLAY=k8s/overlays/kubernetes-rustfs ;;
        rustfs:external) KUSTOMIZE_OVERLAY=k8s/overlays/kubernetes-rustfs-observability-external ;;
        rustfs:local) KUSTOMIZE_OVERLAY=k8s/overlays/kubernetes-rustfs-observability-local ;;
        *)
                echo "Nieprawidłowa kombinacja: storage=$OBJECT_STORAGE_MODE, observability=$OBSERVABILITY_MODE." >&2
                echo "Storage: external|rustfs; observability: disabled|external|local." >&2
                exit 1
                ;;
esac

pnpm --silent --filter @zglosto/white-label-config build >/dev/null
CONFIG_METADATA=$(pnpm --silent --filter @zglosto/white-label-config metadata "$CONFIG_PATH" fields)
IFS=$'\t' read -r CITY_KEY CONFIG_VERSION CONFIG_CHECKSUM VALIDATED_CONFIG_PATH <<< "$CONFIG_METADATA"
TAG=${REQUESTED_TAG:-$CONFIG_VERSION}

if [[ ! "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
        echo "Nieprawidłowy tag obrazu: $TAG" >&2
        exit 1
fi

if [ "$TAG" = "latest" ]; then
        echo "Wdrożenie odrzucone: użyj niezmiennego tagu obrazu zamiast 'latest'." >&2
        exit 1
fi

echo "Rozpoczynam wdrażanie aplikacji ZglosTO na Kubernetes w namespace '$NAMESPACE'..."
echo "Release: $TAG; miasto: $CITY_KEY; config: $CONFIG_VERSION; sha256:$CONFIG_CHECKSUM"
echo "Zwalidowany plik: $VALIDATED_CONFIG_PATH"

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

# Sprawdzenie czy obrazy Docker sa dostepne lokalnie (informacyjne).
# media-worker celowo używa tego samego obrazu co backend.
echo "Sprawdzanie dostępności obrazów Docker (lokalnie)..."
for img in database pgbouncer rabbitmq authorization backend llm-gateway frontend nginx; do
    if ! docker image inspect "zglosto/${img}:$TAG" >/dev/null 2>&1; then
        echo "Ostrzeżenie: Obraz zglosto/${img}:$TAG nie znaleziony lokalnie. Możesz zbudować go przy pomocy ./build-images.sh $TAG $CONFIG_PATH"
    else
        echo "Znaleziono obraz: zglosto/${img}:$TAG"
    fi
done

# Utworzenie namespace
echo "Tworzenie namespace..."
kubectl apply -f k8s/base/namespace.yaml || kubectl create namespace "$NAMESPACE"
check_command "Utworzenie namespace $NAMESPACE"

if ! kubectl get crd certificates.cert-manager.io >/dev/null 2>&1; then
        echo "Brak cert-manager CRD certificates.cert-manager.io." >&2
        exit 1
fi
if ! kubectl get clusterissuer zglosto-public-issuer >/dev/null 2>&1; then
        echo "Brak wymaganego ClusterIssuer/zglosto-public-issuer dla publicznego Ingressu." >&2
        exit 1
fi
if ! kubectl get deployment --all-namespaces \
        -l app.kubernetes.io/name=reloader -o name | grep -q .; then
        echo "Brak kontrolera Stakater Reloader wymaganego do rolloutów po rotacji certyfikatów." >&2
        exit 1
fi
for autoscaling_crd in \
        scaledobjects.keda.sh \
        triggerauthentications.keda.sh \
        interceptorroutes.http.keda.sh; do
        if ! kubectl get crd "$autoscaling_crd" >/dev/null 2>&1; then
                echo "Brak wymaganego CRD autoskalowania: $autoscaling_crd." >&2
                echo "Zainstaluj KEDA >=2.20.0 i KEDA HTTP Add-on 0.15.0 w namespace keda." >&2
                exit 1
        fi
done
for autoscaling_service in \
        keda-add-ons-http-external-scaler \
        keda-add-ons-http-interceptor-proxy; do
        if ! kubectl get service "$autoscaling_service" -n keda >/dev/null 2>&1; then
                echo "Brak Service/$autoscaling_service wymaganego przez KEDA HTTP Add-on." >&2
                exit 1
        fi
done

# Wyłącznie poświadczenia aplikacyjne są provisionowane przed wdrożeniem.
# Sekrety PKI powstają później z zasobów Certificate zarządzanych przez cert-manager.
REQUIRED_SECRETS="zglosto-database-credentials zglosto-rabbitmq-credentials zglosto-object-storage-credentials zglosto-better-auth"
case "$OBSERVABILITY_MODE" in
        external) REQUIRED_SECRETS="$REQUIRED_SECRETS zglosto-otel-external" ;;
        local) REQUIRED_SECRETS="$REQUIRED_SECRETS zglosto-grafana-admin" ;;
esac
for secret_name in $REQUIRED_SECRETS; do
        if ! kubectl get secret "$secret_name" -n "$NAMESPACE" >/dev/null 2>&1; then
                echo "Brak wymaganego Secret/$secret_name w namespace '$NAMESPACE'." >&2
                echo "Provisionuj sekrety zewnętrznie według deploy/cluster-secret-contract.json." >&2
                exit 1
        fi
done

echo "Renderowanie i stosowanie overlayu Kubernetes..."
if kubectl kustomize "$KUSTOMIZE_OVERLAY" | grep -q 'zglosto\.example\.invalid'; then
        echo "Publiczny host Ingressu nadal ma wartość zglosto.example.invalid." >&2
        echo "Ustaw prawdziwą domenę w overlayu przed wdrożeniem." >&2
        exit 1
fi
if kubectl kustomize "$KUSTOMIZE_OVERLAY" | grep -q 'otel\.example\.invalid'; then
        echo "Zewnętrzny endpoint OTLP nadal ma wartość otel.example.invalid." >&2
        echo "Ustaw prawdziwy endpoint w overlayu trybu external przed wdrożeniem." >&2
        exit 1
fi
kubectl apply -k "$KUSTOMIZE_OVERLAY"
check_command "Zastosowanie bazy Kustomize i overlayu Kubernetes"

echo "Oczekiwanie na gotowość wewnętrznych certyfikatów..."
for certificate in \
        authorization-server \
        backend-client \
        nginx-client \
        authorization-healthcheck-client \
        rabbitmq-server \
        database-server \
        pgbouncer-server; do
        kubectl wait --for=condition=Ready "certificate/$certificate" \
                -n "$NAMESPACE" --timeout=300s
done
check_command "Wewnętrzne certyfikaty TLS/mTLS są gotowe"

echo "Oczekiwanie na gotowość kontrolerów autoskalowania..."
kubectl wait --for=condition=Ready "interceptorroute/llm-gateway" \
        -n "$NAMESPACE" --timeout=300s
for scaled_object in media-worker llm-gateway; do
        kubectl wait --for=condition=Ready "scaledobject/$scaled_object" \
                -n "$NAMESPACE" --timeout=300s
done
check_command "KEDA zaakceptowała trasę i autoskalowanie media_worker oraz llm_gateway"

echo "Przypinanie niezmiennych obrazów i wersji konfiguracji..."
kubectl set image statefulset/database database="docker.io/zglosto/database:$TAG" pgbackrest-scheduler="docker.io/zglosto/database:$TAG" -n "$NAMESPACE"
kubectl set image deployment/pgbouncer pgbouncer="docker.io/zglosto/pgbouncer:$TAG" -n "$NAMESPACE"
kubectl set image statefulset/rabbitmq rabbitmq="docker.io/zglosto/rabbitmq:$TAG" -n "$NAMESPACE"
kubectl set image deployment/authorization authorization="docker.io/zglosto/authorization:$TAG" -n "$NAMESPACE"
kubectl set image deployment/backend backend="docker.io/zglosto/backend:$TAG" -n "$NAMESPACE"
kubectl set image deployment/media-worker media-worker="docker.io/zglosto/backend:$TAG" -n "$NAMESPACE"
kubectl set image deployment/llm-gateway llm-gateway="docker.io/zglosto/llm-gateway:$TAG" -n "$NAMESPACE"
kubectl set image deployment/frontend frontend="docker.io/zglosto/frontend:$TAG" -n "$NAMESPACE"
kubectl set image deployment/nginx nginx="docker.io/zglosto/nginx:$TAG" -n "$NAMESPACE"

echo "Oczekiwanie na gotowość bazy danych po przypięciu obrazu release..."
kubectl rollout status statefulset/database -n "$NAMESPACE" --timeout=600s
check_command "Baza danych jest gotowa"

ROLLOUT_PATCH="{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"zglosto.pl/city-key\":\"$CITY_KEY\",\"zglosto.pl/config-version\":\"$CONFIG_VERSION\",\"zglosto.pl/config-checksum\":\"$CONFIG_CHECKSUM\",\"zglosto.pl/release-tag\":\"$TAG\"}}}}}"
for deployment in authorization backend frontend media-worker; do
        kubectl patch "deployment/$deployment" --type merge -p "$ROLLOUT_PATCH" -n "$NAMESPACE"
done
check_command "Przypięcie wersji release i wymuszenie rollout'u konfiguracji"

kubectl rollout status statefulset/rabbitmq -n "$NAMESPACE" --timeout=600s
for deployment in authorization backend frontend media-worker llm-gateway nginx pgbouncer; do
        kubectl rollout status "deployment/$deployment" -n "$NAMESPACE" --timeout=300s
done
check_command "Warstwy zależne od konfiguracji osiągnęły readiness"

echo "Weryfikowanie checksumy konfiguracji uruchomionych warstw..."
BACKEND_READINESS=$(kubectl exec deployment/backend -n "$NAMESPACE" -- \
        node -e "fetch('http://127.0.0.1:3000/health/ready').then(r => r.text()).then(t => process.stdout.write(t))")
AUTHORIZATION_READINESS=$(kubectl exec deployment/authorization -n "$NAMESPACE" -- \
        node dist/src/healthcheck.js)
FRONTEND_READINESS=$(kubectl exec deployment/frontend -n "$NAMESPACE" -- \
        wget -q -O - http://127.0.0.1/health/ready)

for readiness in "$BACKEND_READINESS" "$AUTHORIZATION_READINESS" "$FRONTEND_READINESS"; do
        case "$readiness" in
                *"\"checksum\":\"$CONFIG_CHECKSUM\""*) ;;
                *)
                        echo "Wdrożona warstwa raportuje inną checksumę konfiguracji niż $CONFIG_CHECKSUM" >&2
                        exit 1
                        ;;
        esac
done
check_command "Wszystkie warstwy używają konfiguracji sha256:$CONFIG_CHECKSUM"

# Sprawdzenie statusu wdrozenia
echo "Sprawdzanie statusu wdrożenia..."
kubectl get all -n "$NAMESPACE"

echo ""
echo "Wdrożenie zakończone pomyślnie!"
echo ""
echo "Informacje o dostępie:"
echo ""
echo "Sprawdź publiczny adres HTTPS i certyfikat Ingress:"
echo "   kubectl get ingress zglosto-ingress -n $NAMESPACE"
echo "   kubectl get certificate zglosto-public-tls -n $NAMESPACE"
echo ""
echo "Aby sprawdzić logi usług:"
echo "   kubectl logs -f deployment/<service-name> -n $NAMESPACE"
echo ""
echo "Pamiętaj o:"
echo "   - Zbudowaniu tego samego release przed wdrożeniem (./build-images.sh $TAG $CONFIG_PATH)"
echo "   - Dla minikube: uruchom 'eval \$(minikube docker-env)' przed budowaniem"
echo "   - Dla kind: załaduj obrazy komendą 'kind load docker-image'"
echo "   - Poświadczenia aplikacyjne są dostarczane zewnętrznie, a PKI wewnętrzne tworzy cert-manager"
echo "   - Publiczny host Ingressu musi zostać zmieniony z wartości example.invalid przed wdrożeniem"
