#!/usr/bin/env bash

services_to_resume=()
replicas_to_resume=()

prepare_maintenance_compose() {
  local operations_file
  operations_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docker-compose.storage.operations.yml"
  compose=(docker compose "$@")
  operations_compose=("${compose[@]}")
  "${compose[@]}" config --quiet || return

  local has_files=0 project_directory="$PWD"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -f|--file) has_files=1; shift ;;
      -f?*|--file=*) has_files=1 ;;
      --project-directory) project_directory=$2; shift ;;
      --project-directory=*) project_directory=${1#*=} ;;
      --ansi|--env-file|--parallel|--profile|--progress|-p|--project-name) shift ;;
    esac
    shift
  done

  if [ "$has_files" -eq 0 ]; then
    # Ask Compose to resolve its own .env and --env-file settings.
    local settings files= separator=: setting
    settings=$("${compose[@]}" config --environment |
      awk '/^COMPOSE_FILE=|^COMPOSE_PATH_SEPARATOR=/') || return
    while IFS= read -r setting; do
      case "$setting" in
        COMPOSE_FILE=*) files=${setting#*=} ;;
        COMPOSE_PATH_SEPARATOR=*) separator=${setting#*=} ;;
      esac
    done <<< "$settings"
    separator=${separator:-:}

    if [ -n "$files" ]; then
      while [[ "$files" == *"$separator"* ]]; do
        operations_compose+=(--file "${files%%"$separator"*}")
        files=${files#*"$separator"}
      done
      operations_compose+=(--file "$files")
    else
      add_default_compose_files "$project_directory" || return
    fi
  fi

  operations_compose+=(--file "$operations_file")
  "${operations_compose[@]}" config --quiet
}

add_default_compose_files() {
  local directory filename override
  directory=$(cd "$1" && pwd -P) || return
  while :; do
    for filename in compose.yaml compose.yml docker-compose.yml docker-compose.yaml; do
      [ -f "$directory/$filename" ] || continue
      operations_compose+=(--file "$directory/$filename")
      for override in compose.override.yml compose.override.yaml docker-compose.override.yml docker-compose.override.yaml; do
        [ -f "$directory/$override" ] || continue
        operations_compose+=(--file "$directory/$override")
        break
      done
      return 0
    done
    [ "$directory" = / ] && break
    directory=$(dirname "$directory")
  done
  printf 'Could not locate the default Compose files for maintenance.\n' >&2
  return 1
}

stop_for_maintenance() {
  local service containers index container state running mixed
  local running_services=() running_containers=() mixed_services=()
  # Inspect stopped replicas as well: restarting writers can resume on their own.
  for service in "$@"; do
    if ! containers=$("${compose[@]}" ps --all --quiet "$service"); then
      printf 'Could not determine containers for %s.\n' "$service" >&2
      return 1
    fi
    [ -n "$containers" ] || continue
    running=''
    mixed=false
    while IFS= read -r container; do
      state=$(docker inspect --format '{{.State.Status}}' "$container") || return
      case "$state" in
        running) running="${running:+$running$'\n'}$container" ;;
        created|exited) mixed=true ;;
        *)
          printf 'Cannot stop %s for maintenance: container %s is %s.\n' "$service" "$container" "$state" >&2
          return 1
          ;;
      esac
    done <<< "$containers"
    if [ -n "$running" ]; then
      running_services+=("$service")
      running_containers+=("$running")
      mixed_services+=("$mixed")
    fi
  done
  for ((index=0; index<${#running_services[@]}; index++)); do
    service=${running_services[$index]}
    services_to_resume+=("$service")
    if [ "${mixed_services[$index]}" = true ]; then
      replicas_to_resume+=("${running_containers[$index]}")
    else
      replicas_to_resume+=('')
    fi
    "${compose[@]}" stop --timeout 120 "$service" >/dev/null || return
    # A SIGKILL can interrupt a DB/Object Storage operation between its stages.
    # Do not certify a snapshot after a forced shutdown.
    local exit_code
    while IFS= read -r container; do
      exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container") || return
      if [ "$exit_code" = 137 ]; then
        printf 'Container %s required SIGKILL; audit and repair before retrying.\n' "$container" >&2
        return 1
      fi
    done <<< "${running_containers[$index]}"
  done
}

resume_service() {
  local service=$1 index container state pending
  local replicas=()
  for ((index=0; index<${#services_to_resume[@]}; index++)); do
    [ "${services_to_resume[$index]}" = "$service" ] || continue
    [ -n "${replicas_to_resume[$index]}" ] || break
    while IFS= read -r container; do
      replicas+=("$container")
    done <<< "${replicas_to_resume[$index]}"
    docker start "${replicas[@]}" >/dev/null || return
    local deadline=$((SECONDS + 120))
    while ((SECONDS < deadline)); do
      pending=false
      for container in "${replicas[@]}"; do
        state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container") || return
        case "$state" in
          running|healthy) ;;
          *) pending=true ;;
        esac
      done
      [ "$pending" = true ] || return 0
      sleep 1
    done
    printf 'Timed out waiting for the original replicas of %s.\n' "$service" >&2
    return 1
  done
  "${compose[@]}" start --wait --wait-timeout 120 "$service" >/dev/null
}

resume_application() {
  [ "${#services_to_resume[@]}" -gt 0 ] || return 0
  # Reverse the stop order so the public proxy is enabled last.
  local index
  for ((index=${#services_to_resume[@]}-1; index>=0; index--)); do
    resume_service "${services_to_resume[$index]}" || return
  done
}
