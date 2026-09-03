#!/usr/bin/env bash
# Fail database test suites when DATABASE_URL is missing. Do not skip.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required; refusing to skip database tests" >&2
  exit 1
fi
