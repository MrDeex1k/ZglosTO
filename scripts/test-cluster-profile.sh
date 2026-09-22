#!/usr/bin/env bash
set -euo pipefail

PROFILE=${1:-}
TAG=${IMAGE_TAG:-bun-acceptance}
KEEP_CLUSTER=${KEEP_CLUSTER:-0}
KIND_VERSION=${KIND_VERSION:-v0.32.0}
KIND_NODE_IMAGE=${KIND_NODE_IMAGE:-kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5}
K3D_VERSION=${K3D_VERSION:-v5.9.0}
K3S_IMAGE=${K3S_IMAGE:-rancher/k3s:v1.37.0-k3s1}
CERT_MANAGER_VERSION=${CERT_MANAGER_VERSION:-v1.21.0}
RELOADER_CHART_VERSION=${RELOADER_CHART_VERSION:-2.2.14}
KEDA_CHART_VERSION=${KEDA_CHART_VERSION:-2.20.0}
KEDA_HTTP_CHART_VERSION=${KEDA_HTTP_CHART_VERSION:-0.15.0}
TRAEFIK_CHART_VERSION=${TRAEFIK_CHART_VERSION:-41.4.0}
LOCAL_PATH_VERSION=${LOCAL_PATH_VERSION:-v0.0.36}
CLUSTER_NAME=${CLUSTER_NAME:-zglosto-phase9-$PROFILE}
if [ "$PROFILE" = 'k3s' ]; then
    export PORT=${PORT:-18235}
    INGRESS_TEST_PORT=${INGRESS_TEST_PORT:-18236}
else
    export PORT=${PORT:-18135}
    INGRESS_TEST_PORT=${INGRESS_TEST_PORT:-18136}
fi
INGRESS_FORWARD_PID=

case "$PROFILE" in
    kubernetes|k3s) ;;
    *)
        echo "Usage: $0 kubernetes|k3s" >&2
        exit 2
        ;;
esac

for command in docker kubectl helm curl bun; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "$command is required" >&2
        exit 1
    }
done

case "$CLUSTER_NAME" in
    zglosto-*) ;;
    *) echo "Disposable cluster name must start with zglosto-" >&2; exit 1 ;;
esac
if [ "$PROFILE" = 'kubernetes' ]; then
    command -v kind >/dev/null
    [[ "$(kind version)" == "kind $KIND_VERSION "* ]] || { echo "kind $KIND_VERSION is required" >&2; exit 1; }
    existing_clusters=$(kind get clusters)
    ! printf '%s\n' "$existing_clusters" | grep -Fxq "$CLUSTER_NAME" || { echo "Cluster already exists" >&2; exit 1; }
else
    command -v k3d >/dev/null
    existing_clusters=$(k3d cluster list --no-headers)
    ! printf '%s\n' "$existing_clusters" | awk '{print $1}' | grep -Fxq "$CLUSTER_NAME" || { echo "Cluster already exists" >&2; exit 1; }
fi
TEST_STATE=$(mktemp -d "${TMPDIR:-/tmp}/zglosto-cluster.XXXXXX")
export KUBECONFIG="$TEST_STATE/kubeconfig"
export HELM_CONFIG_HOME="$TEST_STATE/helm/config"
export HELM_CACHE_HOME="$TEST_STATE/helm/cache"
export HELM_DATA_HOME="$TEST_STATE/helm/data"
CLUSTER_CREATED=0
bun scripts/render-cluster-candidate.ts "$PROFILE" "$TAG" > "$TEST_STATE/candidate.yaml"

delete_cluster() {
    if [ -n "$INGRESS_FORWARD_PID" ]; then
        kill "$INGRESS_FORWARD_PID" >/dev/null 2>&1 || true
        wait "$INGRESS_FORWARD_PID" >/dev/null 2>&1 || true
    fi
    if [ "$KEEP_CLUSTER" = "1" ] && [ "$CLUSTER_CREATED" = "1" ]; then
        echo "Keeping cluster $CLUSTER_NAME; KUBECONFIG=$KUBECONFIG"
        return
    fi
    if [ "$CLUSTER_CREATED" = "0" ]; then rm -rf "$TEST_STATE"; return; fi
    if [ "$PROFILE" = "kubernetes" ]; then
        kind delete cluster --name "$CLUSTER_NAME" >/dev/null 2>&1 || true
    else
        k3d cluster delete "$CLUSTER_NAME" >/dev/null 2>&1 || true
    fi
    rm -rf "$TEST_STATE"
}
trap delete_cluster EXIT

echo "Building the candidate image set..."
./build-images.sh "$TAG"
audit_arguments=(--inspect --mode target)
for artifact in authorization backend llm_gateway frontend nginx database pgbouncer rabbitmq; do
    repository=${artifact//_/-}
    audit_arguments+=(--image "$artifact=zglosto/$repository:$TAG")
done
bun scripts/check-image-contract.ts "${audit_arguments[@]}"

images=(
    "zglosto/database:$TAG"
    "zglosto/pgbouncer:$TAG"
    "zglosto/rabbitmq:$TAG"
    "zglosto/authorization:$TAG"
    "zglosto/backend:$TAG"
    "zglosto/llm-gateway:$TAG"
    "zglosto/frontend:$TAG"
    "zglosto/nginx:$TAG"
    "rustfs/rustfs:1.0.0"
    "redis:8.10.1-alpine3.23"
)

if [ "$PROFILE" = "kubernetes" ]; then
    command -v kind >/dev/null 2>&1 || {
        echo "kind $KIND_VERSION is required" >&2
        exit 1
    }
    CLUSTER_CREATED=1
    kind create cluster --kubeconfig "$KUBECONFIG" --name "$CLUSTER_NAME" --image "$KIND_NODE_IMAGE" --wait 180s
    kind load docker-image --name "$CLUSTER_NAME" "${images[@]}"
    kubectl apply -f \
        "https://raw.githubusercontent.com/rancher/local-path-provisioner/$LOCAL_PATH_VERSION/deploy/local-path-storage.yaml"
    kubectl apply -f - <<'YAML'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete
YAML
else
    command -v k3d >/dev/null 2>&1 || {
        echo "k3d $K3D_VERSION is required" >&2
        exit 1
    }
    CLUSTER_CREATED=1
    k3d cluster create "$CLUSTER_NAME" --image "$K3S_IMAGE" --servers 1 --agents 1 --wait \
        --kubeconfig-update-default=false --kubeconfig-switch-context=false
    k3d kubeconfig get "$CLUSTER_NAME" > "$KUBECONFIG"
    k3d image import --cluster "$CLUSTER_NAME" "${images[@]}"
fi

expected_context="kind-$CLUSTER_NAME"
if [ "$PROFILE" = 'k3s' ]; then expected_context="k3d-$CLUSTER_NAME"; fi
[ "$(kubectl config current-context)" = "$expected_context" ] || { echo "Unexpected test context" >&2; exit 1; }

echo "Installing pinned deployment controllers..."
if [ "$PROFILE" = 'kubernetes' ]; then
    helm upgrade --install traefik oci://ghcr.io/traefik/helm/traefik \
        --namespace traefik --create-namespace --version "$TRAEFIK_CHART_VERSION" \
        --values k8s/traefik-values.yaml --set service.type=ClusterIP --wait --timeout 5m
fi
kubectl get ingressclass traefik >/dev/null

helm repo add jetstack https://charts.jetstack.io --force-update
helm repo add stakater https://stakater.github.io/stakater-charts --force-update
helm repo add kedacore https://kedacore.github.io/charts --force-update
helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace --version "$CERT_MANAGER_VERSION" \
    --set crds.enabled=true --wait --timeout 5m
helm upgrade --install reloader stakater/reloader \
    --namespace reloader --create-namespace --version "$RELOADER_CHART_VERSION" \
    --wait --timeout 5m
helm upgrade --install keda kedacore/keda \
    --namespace keda --create-namespace --version "$KEDA_CHART_VERSION" \
    --wait --timeout 5m
helm upgrade --install keda-add-ons-http kedacore/keda-add-ons-http \
    --namespace keda --version "$KEDA_HTTP_CHART_VERSION" \
    --wait --timeout 5m

kubectl create namespace zglosto --dry-run=client -o yaml | kubectl apply -f -
kubectl -n zglosto create secret generic zglosto-database-credentials \
    --from-literal=POSTGRES_PASSWORD='phase9-database-password' \
    --from-literal=DATABASE_URL='postgresql://zglosto:phase9-database-password@pgbouncer:6432/zglosto_db' \
    --from-literal=DATABASE_DIRECT_URL='postgresql://zglosto:phase9-database-password@database:54325/zglosto_db'
kubectl -n zglosto create secret generic zglosto-rabbitmq-credentials \
    --from-literal=RABBITMQ_USER='zglosto' \
    --from-literal=RABBITMQ_PASSWORD='phase9-rabbitmq-password' \
    --from-literal=RABBITMQ_URL='amqps://zglosto:phase9-rabbitmq-password@rabbitmq.zglosto.svc.cluster.local:5671/zglosto'
kubectl -n zglosto create secret generic zglosto-object-storage-credentials \
    --from-literal=S3_ACCESS_KEY_ID='phase9-access-key' \
    --from-literal=S3_SECRET_ACCESS_KEY='phase9-secret-key'
kubectl -n zglosto create secret generic zglosto-better-auth \
    --from-literal=BETTER_AUTH_SECRET='phase9-better-auth-secret-at-least-32-bytes'
kubectl -n zglosto create secret generic zglosto-llm-auth \
    --from-literal=hmac-key='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
kubectl apply -f - <<'YAML'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: zglosto-public-issuer
spec:
  selfSigned: {}
YAML

kubectl -n zglosto create secret generic zglosto-redis-acl --from-file=users.acl=tests/fixtures/redis/users.acl
kubectl -n zglosto create secret generic zglosto-redis-credentials \
    --from-literal=REDIS_URL='redis://zglosto:integration-redis-password@redis:6379/0' \
    --from-file=RATE_LIMIT_HMAC_KEY=tests/fixtures/redis/rate-limit-hmac

overlay="$TEST_STATE/candidate.yaml"
echo "Validating CRD schemas through the live API server..."
kubectl apply --server-side --dry-run=server -f "$overlay" >/dev/null
kubectl apply -f "$overlay"

kubectl -n zglosto wait --for=condition=Ready certificate/keda-http-interceptor --timeout=3m
kubectl -n zglosto get secret zglosto-keda-http-tls -o json |
    bun --input-type=module -e '
      let input = "";
      for await (const chunk of process.stdin) input += chunk;
      const source = JSON.parse(input);
      const chain = Buffer.concat([
        Buffer.from(source.data["tls.crt"], "base64"),
        Buffer.from("\n"),
        Buffer.from(source.data["ca.crt"], "base64"),
      ]).toString("base64");
      process.stdout.write(JSON.stringify({
        apiVersion: "v1",
        kind: "Secret",
        metadata: { name: "zglosto-keda-http-tls", namespace: "keda" },
        type: "kubernetes.io/tls",
        data: { "tls.crt": chain, "tls.key": source.data["tls.key"] },
      }));
    ' |
    kubectl apply -f -
helm upgrade --install keda-add-ons-http kedacore/keda-add-ons-http \
    --namespace keda --version "$KEDA_HTTP_CHART_VERSION" \
    --values k8s/keda-http-values.yaml --wait --timeout 5m

./scripts/smoke-cluster.sh

echo "Checking routing through the actual ingress controller..."
ingress_namespace=traefik
if [ "$PROFILE" = 'k3s' ]; then ingress_namespace=kube-system; fi
kubectl -n "$ingress_namespace" port-forward --address 127.0.0.1 service/traefik \
    "$INGRESS_TEST_PORT:80" >"$TEST_STATE/ingress-forward.log" 2>&1 &
INGRESS_FORWARD_PID=$!
ingress_ready=0
for _attempt in {1..60}; do
    if ! kill -0 "$INGRESS_FORWARD_PID" 2>/dev/null; then
        cat "$TEST_STATE/ingress-forward.log" >&2
        exit 1
    fi
    if grep -q "^Forwarding from 127.0.0.1:$INGRESS_TEST_PORT " "$TEST_STATE/ingress-forward.log"; then
        ingress_ready=1
        break
    fi
    sleep 1
done
[ "$ingress_ready" = '1' ] || { echo "Ingress port-forward did not bind" >&2; exit 1; }
curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 \
    -H 'Host: zglosto.example.invalid' "http://127.0.0.1:$INGRESS_TEST_PORT/" >/dev/null
