#!/usr/bin/env bash
set -euo pipefail

NAMESPACE=${NAMESPACE:-zglosto}
PORT=${PORT:-18135}
TIMEOUT=${TIMEOUT:-300s}
PORT_FORWARD_PID=

cleanup() {
    if [ -n "$PORT_FORWARD_PID" ]; then
        kill "$PORT_FORWARD_PID" >/dev/null 2>&1 || true
        wait "$PORT_FORWARD_PID" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

diagnose_failure() {
    status=$?
    echo "Cluster smoke failed (exit $status); collecting diagnostics..." >&2
    kubectl -n "$NAMESPACE" get pods,services,endpointslices,scaledobjects -o wide >&2 || true
    kubectl -n "$NAMESPACE" logs deployment/nginx --all-pods=true --tail=100 >&2 || true
    kubectl -n "$NAMESPACE" logs deployment/frontend --all-pods=true --tail=100 >&2 || true
    kubectl -n "$NAMESPACE" exec deployment/nginx -- \
        wget -S -O /dev/null http://frontend:8080/ >&2 || true
    return "$status"
}
trap diagnose_failure ERR

echo "Waiting for stateful and application workloads..."
kubectl -n "$NAMESPACE" rollout status statefulset/database --timeout="$TIMEOUT"
kubectl -n "$NAMESPACE" rollout status deployment/pgbouncer --timeout="$TIMEOUT"
kubectl -n "$NAMESPACE" rollout status statefulset/rabbitmq --timeout="$TIMEOUT"
kubectl -n "$NAMESPACE" rollout status statefulset/rustfs --timeout="$TIMEOUT"
for deployment in authorization backend frontend media-worker nginx; do
    kubectl -n "$NAMESPACE" rollout status "deployment/$deployment" --timeout="$TIMEOUT"
done

echo "Checking cert-manager, KEDA and HTTP autoscaling resources..."
kubectl -n "$NAMESPACE" wait --for=condition=Ready certificate --all --timeout="$TIMEOUT"
kubectl -n "$NAMESPACE" wait --for=condition=Ready scaledobject/media-worker --timeout="$TIMEOUT"
kubectl -n "$NAMESPACE" wait --for=condition=Ready scaledobject/llm-gateway --timeout="$TIMEOUT"

kubectl -n "$NAMESPACE" port-forward --address 127.0.0.1 service/nginx "$PORT:1235" >/tmp/zglosto-port-forward.log 2>&1 &
PORT_FORWARD_PID=$!
port_forward_ready=0
for _ in {1..60}; do
    if curl --fail --silent --show-error "http://127.0.0.1:$PORT/health" >/dev/null; then
        port_forward_ready=1
        break
    fi
    if ! kill -0 "$PORT_FORWARD_PID" >/dev/null 2>&1; then
        echo "Nginx port-forward terminated before becoming ready" >&2
        cat /tmp/zglosto-port-forward.log >&2
        exit 1
    fi
    sleep 1
done
if [ "$port_forward_ready" != "1" ]; then
    echo "Nginx did not become reachable through port-forward within 60 seconds" >&2
    cat /tmp/zglosto-port-forward.log >&2
    exit 1
fi

echo "Checking same-origin public routing and anonymous authorization boundary..."
curl --fail --silent --show-error "http://127.0.0.1:$PORT/" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/health/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/auth/get-session" >/dev/null
llm_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "http://127.0.0.1:$PORT/llm/health")
llm_ready_replicas=$(kubectl -n "$NAMESPACE" get deployment llm-gateway \
    -o jsonpath='{.status.readyReplicas}')
llm_ready_replicas=${llm_ready_replicas:-0}
if [ "$llm_status" = "200" ]; then
    if [ "$llm_ready_replicas" -lt 1 ]; then
        echo "LLM health returned 200 without a ready gateway replica" >&2
        exit 1
    fi
elif [ "$llm_status" != "502" ] && [ "$llm_status" != "503" ]; then
    echo "Expected LLM health to return 200 or scale-to-zero 502/503, got $llm_status" >&2
    exit 1
elif [ "$llm_ready_replicas" != "0" ]; then
    echo "LLM health returned $llm_status despite $llm_ready_replicas ready replicas" >&2
    exit 1
fi
resident_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "http://127.0.0.1:$PORT/api/mieszkaniec/incydenty")
if [ "$resident_status" != "401" ]; then
    echo "Expected anonymous resident route to return 401, got $resident_status" >&2
    exit 1
fi

echo "Checking PostgreSQL persistence and the PgBouncer-only application contract..."
kubectl -n "$NAMESPACE" exec statefulset/database -c database -- \
    psql -p 54325 -U zglosto -d zglosto_db -v ON_ERROR_STOP=1 \
    -c 'CREATE TABLE IF NOT EXISTS phase9_deployment_marker (id integer PRIMARY KEY); INSERT INTO phase9_deployment_marker VALUES (9) ON CONFLICT DO NOTHING;' >/dev/null
kubectl -n "$NAMESPACE" exec deployment/backend -- \
    node -e "if (!process.env.DATABASE_URL_FILE) process.exit(1)" >/dev/null

database_pod=$(kubectl -n "$NAMESPACE" get pod -l app=database -o jsonpath='{.items[0].metadata.name}')
kubectl -n "$NAMESPACE" delete pod "$database_pod" --wait=true --timeout="$TIMEOUT" >/dev/null
kubectl -n "$NAMESPACE" rollout status statefulset/database --timeout="$TIMEOUT"
kubectl -n "$NAMESPACE" wait --for=condition=Ready pod -l app=database --timeout="$TIMEOUT"
marker=$(kubectl -n "$NAMESPACE" exec statefulset/database -c database -- \
    psql -At -p 54325 -U zglosto -d zglosto_db \
    -c 'SELECT id FROM phase9_deployment_marker WHERE id = 9')
if [ "$marker" != "9" ]; then
    echo "Database marker did not survive pod recreation" >&2
    exit 1
fi

echo "Checking stateless pod recreation..."
backend_pod=$(kubectl -n "$NAMESPACE" get pod -l app=backend -o jsonpath='{.items[0].metadata.name}')
backend_uid=$(kubectl -n "$NAMESPACE" get pod "$backend_pod" -o jsonpath='{.metadata.uid}')
kubectl -n "$NAMESPACE" delete pod "$backend_pod" --wait=true --timeout="$TIMEOUT" >/dev/null
kubectl -n "$NAMESPACE" rollout status deployment/backend --timeout="$TIMEOUT"
new_backend_uid=$(kubectl -n "$NAMESPACE" get pod -l app=backend -o jsonpath='{.items[0].metadata.uid}')
if [ "$backend_uid" = "$new_backend_uid" ]; then
    echo "Backend pod was not recreated" >&2
    exit 1
fi

echo "Checking TLS Secret rotation and Reloader rollout..."
backend_uid=$new_backend_uid
rotation_probe="phase9-$(date +%s)"
kubectl -n "$NAMESPACE" patch secret zglosto-backend-tls --type merge \
    -p "{\"stringData\":{\"phase9-rotation-probe\":\"$rotation_probe\"}}" >/dev/null
for _ in {1..180}; do
    new_backend_uid=$(kubectl -n "$NAMESPACE" get pod -l app=backend -o jsonpath='{.items[0].metadata.uid}')
    if [ "$backend_uid" != "$new_backend_uid" ]; then
        break
    fi
    sleep 1
done
if [ "$backend_uid" = "$new_backend_uid" ]; then
    echo "Reloader did not roll backend after certificate recreation" >&2
    exit 1
fi
kubectl -n "$NAMESPACE" rollout status deployment/backend --timeout="$TIMEOUT"

echo "Cluster smoke OK: routing, auth boundary, PKI/KEDA readiness, pod recovery and persistent DB data."
