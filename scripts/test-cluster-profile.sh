#!/usr/bin/env bash
set -euo pipefail

PROFILE=${1:-}
TAG=${IMAGE_TAG:-phase9-baseline}
KEEP_CLUSTER=${KEEP_CLUSTER:-0}
KIND_VERSION=${KIND_VERSION:-v0.31.0}
KIND_NODE_IMAGE=${KIND_NODE_IMAGE:-kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0}
K3D_VERSION=${K3D_VERSION:-v5.9.0}
K3S_IMAGE=${K3S_IMAGE:-rancher/k3s:v1.36.4-k3s1}
CERT_MANAGER_VERSION=${CERT_MANAGER_VERSION:-v1.21.0}
RELOADER_CHART_VERSION=${RELOADER_CHART_VERSION:-2.2.14}
KEDA_CHART_VERSION=${KEDA_CHART_VERSION:-2.20.0}
KEDA_HTTP_CHART_VERSION=${KEDA_HTTP_CHART_VERSION:-0.15.0}
LOCAL_PATH_VERSION=${LOCAL_PATH_VERSION:-v0.0.36}
CLUSTER_NAME=${CLUSTER_NAME:-zglosto-phase9-$PROFILE}

case "$PROFILE" in
    kubernetes|k3s) ;;
    *)
        echo "Usage: $0 kubernetes|k3s" >&2
        exit 2
        ;;
esac

for command in docker kubectl helm curl; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "$command is required" >&2
        exit 1
    }
done

delete_cluster() {
    if [ "$KEEP_CLUSTER" = "1" ]; then
        echo "Keeping cluster $CLUSTER_NAME"
        return
    fi
    if [ "$PROFILE" = "kubernetes" ]; then
        kind delete cluster --name "$CLUSTER_NAME" >/dev/null 2>&1 || true
    else
        k3d cluster delete "$CLUSTER_NAME" >/dev/null 2>&1 || true
    fi
}
trap delete_cluster EXIT

echo "Building the immutable Phase 9 image set..."
./build-images.sh "$TAG"

images=(
    "zglosto/database:$TAG"
    "zglosto/pgbouncer:$TAG"
    "zglosto/rabbitmq:$TAG"
    "zglosto/authorization:$TAG"
    "zglosto/backend:$TAG"
    "zglosto/llm-gateway:$TAG"
    "zglosto/frontend:$TAG"
    "zglosto/nginx:$TAG"
    "rustfs/rustfs:1.0.0-rc.5"
)

if [ "$PROFILE" = "kubernetes" ]; then
    command -v kind >/dev/null 2>&1 || {
        echo "kind $KIND_VERSION is required" >&2
        exit 1
    }
    kind create cluster --name "$CLUSTER_NAME" --image "$KIND_NODE_IMAGE" --wait 180s
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
    k3d cluster create "$CLUSTER_NAME" --image "$K3S_IMAGE" --servers 1 --agents 1 --wait
    k3d image import --cluster "$CLUSTER_NAME" "${images[@]}"
fi

echo "Installing pinned deployment controllers..."
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

overlay="k8s/overlays/$PROFILE-rustfs"
echo "Validating CRD schemas through the live API server..."
kubectl apply --server-side --dry-run=server -k "$overlay" >/dev/null
kubectl apply -k "$overlay"

kubectl -n zglosto wait --for=condition=Ready certificate/keda-http-interceptor --timeout=3m
kubectl -n zglosto get secret zglosto-keda-http-tls -o json |
    node --input-type=module -e '
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
