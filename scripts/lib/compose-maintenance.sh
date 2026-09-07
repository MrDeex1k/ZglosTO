#!/usr/bin/env bash

# Sourced after the caller has populated its compose command array.
services_to_resume=()

stop_for_maintenance() {
  local service
  local containers
  # Capture state before the first stop, including when a subsequent stop fails.
  for service in "$@"; do
    if [ -n "$("${compose[@]}" ps --status running --quiet "$service")" ]; then
      services_to_resume+=("$service")
    fi
  done
  if [ "${#services_to_resume[@]}" -eq 0 ]; then return; fi
  for service in "${services_to_resume[@]}"; do
    containers=$("${compose[@]}" ps --status running --quiet "$service")
    "${compose[@]}" stop --timeout 120 "$service" >/dev/null
    # A SIGKILL can interrupt a DB/Object Storage operation between its stages.
    # Do not certify a snapshot after a forced shutdown.
    local container
    for container in $containers; do
      if [ "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = 137 ]; then
        printf 'Container %s required SIGKILL; audit and repair before retrying.\n' "$container" >&2
        return 1
      fi
    done
  done
}

resume_application() {
  local service
  # Start existing containers instead of reconciling their scale with `up`.
  # Reverse the stop order so the public proxy is enabled last.
  local index
  for ((index=${#services_to_resume[@]}-1; index>=0; index--)); do
    service=${services_to_resume[$index]}
    "${compose[@]}" start --wait --wait-timeout 120 "$service" >/dev/null || return
  done
}
