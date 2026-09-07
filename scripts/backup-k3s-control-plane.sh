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
if [ ! -d "$data_dir/server/db/etcd" ] || [ ! -s "$data_dir/server/token" ]; then
    printf 'This script requires an embedded-etcd K3s server and its server token\n' >&2
    exit 65
fi
# This backup profile requires file-based configuration. Include custom paths explicitly.
if [ ! -d "$config_dir" ] || [ ! -s "$config_dir/config.yaml" ]; then
    printf 'K3s backup requires K3S_CONFIG_DIR with config.yaml and its drop-ins\n' >&2
    exit 65
fi
if [ -n "$(find "$config_dir" -type l -print -quit)" ]; then
    printf 'Configuration symlinks are not supported; include their source files explicitly\n' >&2
    exit 65
fi
service_file=${K3S_SERVICE_FILE:-/etc/systemd/system/k3s.service}
service_env_file=${K3S_SERVICE_ENV_FILE:-/etc/systemd/system/k3s.service.env}
if [ ! -f "$service_file" ] || [ ! -f "$service_env_file" ]; then
    printf 'K3s backup requires service unit and environment files (K3S_SERVICE_FILE, K3S_SERVICE_ENV_FILE)\n' >&2
    exit 65
fi
service_dropins=${K3S_SERVICE_DROPIN_DIR:-$service_file.d}
if [ -n "${K3S_SERVICE_DROPIN_DIR:-}" ] && [ ! -d "$service_dropins" ]; then
    printf 'Configured K3S_SERVICE_DROPIN_DIR does not exist\n' >&2
    exit 65
fi
# Check every ancestor before entering the destination. Only the executing uid/root
# may own the path; a root-owned sticky ancestor such as /tmp is safe above a private parent.
parent=$(dirname "$destination")
checked=$parent
while :; do
    if [ ! -d "$checked" ] || [ -L "$checked" ]; then
        printf 'Backup ancestors must be existing directories without symlinks: %s\n' "$checked" >&2
        exit 65
    fi
    metadata=$(stat -c '%u %a' "$checked" 2>/dev/null) || metadata=$(stat -f '%u %Lp' "$checked")
    read -r owner mode <<< "$metadata"
    if [ "$owner" -ne 0 ] && [ "$owner" -ne "$EUID" ]; then
        printf 'Untrusted backup directory owner: %s\n' "$checked" >&2
        exit 65
    fi
    if (( (8#$mode & 0022) != 0 )); then
        if [ "$checked" = "$parent" ] || [ "$owner" -ne 0 ] || (( (8#$mode & 01000) == 0 )); then
            printf 'Backup directory is writable by other users: %s\n' "$checked" >&2
            exit 65
        fi
    fi
    [ "$checked" = / ] && break
    checked=$(dirname "$checked")
done
data_dir=$(cd "$data_dir" && pwd -P)
case "$destination/" in
    "$data_dir/"*) printf 'Backup must be outside the K3s data directory\n' >&2; exit 65 ;;
esac
# Plain mkdir fails atomically for an existing directory or dangling symlink.
mkdir -m 0700 -- "$destination"
[ ! -L "$destination" ] || exit 65
destination=$(cd "$destination" && pwd -P)
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
cp -R "$config_dir" "$destination/config"
mkdir "$destination/service"
cp "$service_file" "$destination/service/k3s.service"
cp "$service_env_file" "$destination/service/k3s.service.env"
if [ -d "$service_dropins" ]; then cp -RL "$service_dropins" "$destination/service/drop-ins"; fi
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
