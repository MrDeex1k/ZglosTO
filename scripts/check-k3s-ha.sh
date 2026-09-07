#!/usr/bin/env bash
set -euo pipefail

# Read-only preflight. Scheduling capacity and storage health are checked before apply.
kubectl get nodes -o json | node --input-type=module -e '
let input = "";
for await (const chunk of process.stdin) input += chunk;
const nodes = JSON.parse(input).items;
const ready = nodes.filter(node => node.status.conditions.some(condition => condition.type === "Ready" && condition.status === "True"));
const servers = ready.filter(node => Object.hasOwn(node.metadata.labels, "node-role.kubernetes.io/etcd"));
if (servers.length < 3) throw new Error("K3s HA requires at least three Ready embedded-etcd servers");
if (ready.filter(node => !node.spec.unschedulable).length < 3) throw new Error("K3s HA requires at least three schedulable nodes");
'
kubectl -n longhorn-system rollout status daemonset/longhorn-manager --timeout=60s
kubectl -n longhorn-system get nodes.longhorn.io -o json | node --input-type=module -e '
let input = "";
for await (const chunk of process.stdin) input += chunk;
const nodes = JSON.parse(input).items.filter(node => node.spec.allowScheduling &&
  node.status.conditions.Ready?.status === "True" &&
  Object.values(node.status.diskStatus ?? {}).some(disk =>
    disk.conditions.Schedulable?.status === "True"));
if (nodes.length < 3) throw new Error("Longhorn requires three Ready nodes with schedulable disks");
'
printf 'K3s HA preflight passed. Verify external Redis/S3 availability and off-host backups before release.\n'
