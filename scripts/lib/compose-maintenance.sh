#!/usr/bin/env bash

services_to_resume=()

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
  local service containers index container
  local running_services=() running_containers=()
  # Capture every service before stopping any writer.
  for service in "$@"; do
    if ! containers=$("${compose[@]}" ps --status running --quiet "$service"); then
      printf 'Could not determine running containers for %s.\n' "$service" >&2
      return 1
    fi
    if [ -n "$containers" ]; then
      running_services+=("$service")
      running_containers+=("$containers")
    fi
  done
  for ((index=0; index<${#running_services[@]}; index++)); do
    service=${running_services[$index]}
    services_to_resume+=("$service")
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

resume_application() {
  [ "${#services_to_resume[@]}" -gt 0 ] || return 0
  local service
  # Start existing containers instead of reconciling their scale with `up`.
  # Reverse the stop order so the public proxy is enabled last.
  local index
  for ((index=${#services_to_resume[@]}-1; index>=0; index--)); do
    service=${services_to_resume[$index]}
    "${compose[@]}" start --wait --wait-timeout 120 "$service" >/dev/null || return
  done
}
