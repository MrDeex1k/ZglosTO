#!/usr/bin/env bash
set -euo pipefail

KUBECONFORM_BIN=${KUBECONFORM_BIN:-kubeconform}
KUBERNETES_SCHEMA_VERSION=${KUBERNETES_SCHEMA_VERSION:-1.35.0}

if ! command -v kubectl >/dev/null 2>&1; then
    echo "kubectl is required" >&2
    exit 1
fi
if ! command -v "$KUBECONFORM_BIN" >/dev/null 2>&1; then
    echo "kubeconform 0.7.0 is required (or set KUBECONFORM_BIN)" >&2
    exit 1
fi

overlays=(
    kubernetes
    kubernetes-rustfs
    kubernetes-observability-external
    kubernetes-observability-local
    kubernetes-rustfs-observability-external
    kubernetes-rustfs-observability-local
    k3s
    k3s-rustfs
    k3s-observability-external
    k3s-observability-local
    k3s-rustfs-observability-external
    k3s-rustfs-observability-local
)

for overlay in "${overlays[@]}"; do
    echo "Validating Kubernetes schemas: $overlay"
    kubectl kustomize "k8s/overlays/$overlay" |
        "$KUBECONFORM_BIN" \
            -strict \
            -summary \
            -ignore-missing-schemas \
            -kubernetes-version "$KUBERNETES_SCHEMA_VERSION"
done

echo "Standard Kubernetes schemas are valid for all 12 overlays."
echo "CRD schemas are additionally validated by server-side dry-run in test-cluster-profile.sh."
