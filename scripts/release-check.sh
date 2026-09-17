#!/usr/bin/env bash
# Local release gate. Runs every check CI enforces, in the same order, so a
# green run here strongly predicts a green pipeline. Cloud-only validations
# (real SMS/WeChat/TOS/WAF/failover/full load) remain blocked until UAT.
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Secret scan"
bash scripts/check-secrets.sh

step "Lint"
npm run lint

step "Typecheck"
npm run typecheck

step "Tests"
npm test

step "Production build"
npm run build

step "Migration dry run (syntax check)"
node -e "const {readdirSync,readFileSync}=require('node:fs');const dir='server/migrations';for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql'))){const sql=readFileSync(dir+'/'+f,'utf8');if(!/CREATE TABLE|ALTER TABLE|INSERT|UPDATE/i.test(sql)){throw new Error('Suspicious migration: '+f)}}console.log('Migrations look well-formed.')"

printf '\n\033[32mLocal release gate passed.\033[0m\n'
printf 'UAT-only items still required before production: real Volcengine SMS, WeChat callback, TOS, WAF, multi-AZ failover, backup restore, and the full 100-user load test.\n'
