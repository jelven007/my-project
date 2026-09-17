#!/usr/bin/env bash
# Fails if likely committed secrets or real credentials appear in tracked files.
# Local defaults (prefixed local- or replace_) are explicitly allowed so the
# example env and test fixtures pass.
set -euo pipefail

cd "$(dirname "$0")/.."

# High-signal patterns for real leaked credentials.
patterns=(
  'AKIA[0-9A-Z]{16}'                       # AWS-style access key id
  '-----BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY-----'
  'AKLT[0-9A-Za-z_-]{16,}'                  # Volcengine access key id
  'xox[baprs]-[0-9A-Za-z-]{10,}'            # Slack token
)

status=0

# Scan tracked files only; skip lockfiles and this script.
files=$(git ls-files | grep -vE '(package-lock\.json|scripts/check-secrets\.sh)$' || true)

for pattern in "${patterns[@]}"; do
  if matches=$(printf '%s\n' "$files" | xargs grep -nE "$pattern" 2>/dev/null); then
    echo "Potential secret matching /$pattern/:"
    echo "$matches"
    status=1
  fi
done

# Real, non-empty Volcengine/WeChat secrets committed to .env files are rejected.
env_files=$(printf '%s\n' "$files" | grep -E '\.env($|\.)' | grep -v '\.env\.example' || true)
if [ -n "$env_files" ]; then
  echo "Committed .env files are not allowed: $env_files"
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "Secret scan passed: no high-signal credentials found in tracked files."
fi

exit "$status"
