#!/usr/bin/env bash
set -euo pipefail
umask 077

# A dedicated off-host mounted destination is required; credentials stay inside it.
if [ "$#" -ne 1 ] || [[ "$1" != /* ]]; then
    printf 'Usage: %s /absolute/off-host/backup-directory\n' "$0" >&2
    exit 64
fi
destination=$1
data_dir=${K3S_DATA_DIR:-/var/lib/rancher/k3s}
config_dir=${K3S_CONFIG_DIR:-/etc/rancher/k3s}
if [ -e "$destination" ]; then
    printf 'Backup destination must not exist\n' >&2
    exit 65
fi
if [ ! -d "$data_dir/server/db/etcd" ] || [ ! -s "$data_dir/server/token" ]; then
    printf 'This script requires an embedded-etcd K3s server and its server token\n' >&2
    exit 65
fi
mkdir -p "$destination"
destination=$(cd "$destination" && pwd -P)
data_dir=$(cd "$data_dir" && pwd -P)
case "$destination/" in
    "$data_dir/"*) printf 'Backup must be outside the K3s data directory\n' >&2; exit 65 ;;
esac
# Capture token before and after the snapshot: refuse a mixed backup during rotation.
cp "$data_dir/server/token" "$destination/server-token"
mkdir "$destination/snapshots"
k3s etcd-snapshot save --data-dir "$data_dir" --s3=false \
    --etcd-snapshot-dir "$destination/snapshots" --name zglosto-control-plane
cmp -s "$data_dir/server/token" "$destination/server-token" || {
    printf 'Server token changed during backup; repeat the backup\n' >&2
    exit 1
}
if [ -d "$config_dir" ]; then cp -R "$config_dir" "$destination/config"; fi
k3s --version > "$destination/version.txt"
if [ -z "$(find "$destination/snapshots" -type f -print -quit)" ]; then
    printf 'K3s did not create a snapshot\n' >&2
    exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
    (cd "$destination" && find . -type f ! -name SHA256SUMS -exec sha256sum '{}' + > SHA256SUMS)
else
    (cd "$destination" && find . -type f ! -name SHA256SUMS -exec shasum -a 256 '{}' + > SHA256SUMS)
fi
printf 'K3s control-plane backup complete: %s\n' "$destination"
printf 'This backup contains secrets; retain it on encrypted off-host storage. Application data needs a separate backup.\n'
