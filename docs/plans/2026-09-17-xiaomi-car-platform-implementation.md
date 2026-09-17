# Xiaomi Car Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-oriented Xiaomi car portal, operations admin, and shared API that satisfy the approved specs and support 100 concurrent users.

**Architecture:** Use an npm-workspaces monorepo with two independent React/Vite SPAs and one stateless Express API. MySQL is the source of truth, Redis handles rate limiting and short-lived coordination, and external SMS, WeChat, and object storage integrations sit behind replaceable provider interfaces so local development and CI use deterministic mocks.

**Tech Stack:** Node.js 22 LTS, TypeScript, React 18, Vite, Tailwind CSS, Ant Design, TanStack Query, Express, mysql2, Redis, Zod, Vitest, Testing Library, Supertest, Playwright, Docker Compose.

---

## Delivery Rules

- Implement in vertical slices with a failing test before production code.
- Keep portal and admin authentication secrets, cookies, routes, and front-end bundles separate.
- Use parameterized SQL and explicit transactions for inventory and order state changes.
- Never persist plaintext SMS codes, refresh tokens, passwords, or provider secrets.
- Development and CI use contract-compatible mock providers. UAT and production reject mock SMS configuration.
- Each completed task must pass targeted tests, then `npm run lint`, `npm run typecheck`, and relevant builds.
- Commit after each task when Git identity is available; do not mix unrelated changes.

### Task 1: Repository and Workspace Foundation

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `README.md`

**Step 1: Initialize the repository**

Run: `git init`

Expected: an empty repository on branch `main`.

**Step 2: Add workspace metadata**

Define workspaces for `apps/*`, `server`, and `packages/*`. Add root scripts for development, test, lint, typecheck, build, database migration, and seed operations.

**Step 3: Pin the runtime**

Set `.nvmrc` and `package.json#engines.node` to Node 22. Keep secrets out of `.env.example`; include names and safe local defaults only.

**Step 4: Verify workspace discovery**

Run: `npm install`

Expected: a single root lockfile and no dependency resolution errors.

**Step 5: Commit**

```bash
git add .gitignore .editorconfig .nvmrc package.json package-lock.json tsconfig.base.json .env.example README.md
git commit -m "chore: initialize platform workspace"
```

### Task 2: Shared Contracts and Test Harness

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/api.ts`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/auth.test.ts`
- Create: `vitest.workspace.ts`

**Step 1: Write failing contract tests**

Test phone normalization, password complexity, paginated response shape, and the stable API error envelope:

```ts
expect(passwordSchema.safeParse("weak").success).toBe(false);
expect(passwordSchema.safeParse("StrongPass1!").success).toBe(true);
expect(apiErrorSchema.parse({ code: "VALIDATION_ERROR", message: "invalid", requestId: "req-1" }).code)
  .toBe("VALIDATION_ERROR");
```

**Step 2: Run the test**

Run: `npm test --workspace @xiaomi-car/contracts`

Expected: FAIL because schemas do not exist.

**Step 3: Implement schemas and types**

Use Zod as the runtime source of truth and infer TypeScript types from schemas. Passwords require at least 10 characters and all four character classes.

**Step 4: Verify**

Run: `npm test --workspace @xiaomi-car/contracts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/contracts vitest.workspace.ts
git commit -m "feat: add shared API contracts"
```

### Task 3: API Skeleton, Configuration, and Health Checks

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Create: `server/src/config.ts`
- Create: `server/src/lib/logger.ts`
- Create: `server/src/middleware/error-handler.ts`
- Create: `server/src/middleware/request-id.ts`
- Create: `server/src/routes/health.routes.ts`
- Test: `server/src/routes/health.routes.test.ts`

**Step 1: Write failing health tests**

Assert `GET /health/live` returns `200`, while `GET /health/ready` reports dependency readiness using injected probes.

**Step 2: Run the tests**

Run: `npm test --workspace @xiaomi-car/server -- health.routes.test.ts`

Expected: FAIL because `createApp` is missing.

**Step 3: Implement the minimal API**

Create an app factory with Helmet, JSON size limit, CORS allowlist, request IDs, structured errors, and graceful shutdown. Keep `listen` outside the factory for Supertest.

**Step 4: Verify**

Run: `npm test --workspace @xiaomi-car/server -- health.routes.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add server
git commit -m "feat: add secure API foundation"
```

### Task 4: Local Infrastructure and Database Schema

**Files:**
- Create: `compose.yaml`
- Create: `infra/mysql/init/001-create-databases.sql`
- Create: `server/src/db/pool.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/seed.ts`
- Create: `server/migrations/001_initial_schema.sql`
- Create: `server/migrations/002_seed_rbac.sql`
- Test: `server/src/db/schema.integration.test.ts`

**Step 1: Start dependencies**

Run: `docker compose up -d mysql redis`

Expected: MySQL and Redis health checks become healthy.

**Step 2: Write a failing schema integration test**

Assert required tables, unique constraints, foreign keys, inventory checks, refresh token indexes, and append-only audit privileges exist.

**Step 3: Implement migrations**

Create all approved portal/admin tables, including users, identities, SMS codes/deliveries, refresh tokens, cars, content and versions, dealers, inventory, orders, test drives, admin users, RBAC, media, audit logs, and idempotency records.

**Step 4: Seed deterministic development data**

Seed SU7, YU7, SU7 Ultra, representative dealers and inventory, published homepage content, roles, and permissions. Create the first super admin only through an explicit CLI command.

**Step 5: Verify**

Run: `npm run db:migrate && npm run db:seed && npm test --workspace @xiaomi-car/server -- schema.integration.test.ts`

Expected: migrations are idempotent and tests pass.

**Step 6: Commit**

```bash
git add compose.yaml infra server/migrations server/src/db
git commit -m "feat: add database schema and local infrastructure"
```

### Task 5: User Authentication and SMS Provider

**Files:**
- Create: `server/src/services/sms/sms-provider.ts`
- Create: `server/src/services/sms/mock-sms-provider.ts`
- Create: `server/src/services/sms/volcengine-sms-provider.ts`
- Create: `server/src/services/sms/sms-code.service.ts`
- Create: `server/src/services/auth/token.service.ts`
- Create: `server/src/services/auth/user-auth.service.ts`
- Create: `server/src/routes/auth.routes.ts`
- Create: `server/src/middleware/user-auth.ts`
- Test: `server/src/services/sms/sms-code.service.test.ts`
- Test: `server/src/routes/auth.routes.integration.test.ts`

**Step 1: Write failing unit tests**

Cover HMAC-SHA256 code storage, five-minute expiry, one-time use, five failed attempts, resend cooldown, account/IP rate limits, provider rejection, and phone masking.

**Step 2: Implement the provider contract**

The mock provider records a delivery and exposes codes only through a test-only adapter, never in HTTP responses. The Volcengine provider maps provider request IDs, message IDs, timeouts, and rejection codes.

**Step 3: Write failing API tests**

Cover send-code generic responses, registration, password login, SMS login, lockout, refresh rotation, logout revocation, and cross-secret token rejection.

**Step 4: Implement authentication**

Hash passwords with bcrypt cost 12. Hash refresh tokens before persistence, rotate on refresh, and use separate user/admin signing keys and cookie names.

**Step 5: Verify**

Run: `npm test --workspace @xiaomi-car/server -- sms-code.service.test.ts auth.routes.integration.test.ts`

Expected: PASS with no plaintext code or full phone in logs or database fixtures.

**Step 6: Commit**

```bash
git add server/src/services/sms server/src/services/auth server/src/routes/auth.routes.ts server/src/middleware/user-auth.ts
git commit -m "feat: implement user authentication and SMS"
```

### Task 6: WeChat OAuth Contract

**Files:**
- Create: `server/src/services/wechat/wechat-provider.ts`
- Create: `server/src/services/wechat/mock-wechat-provider.ts`
- Create: `server/src/services/wechat/wechat-auth.service.ts`
- Modify: `server/src/routes/auth.routes.ts`
- Test: `server/src/services/wechat/wechat-auth.service.test.ts`
- Test: `server/src/routes/wechat-auth.integration.test.ts`

**Step 1: Write failing tests**

Cover signed single-use state, callback replay rejection, provider errors, existing identity login, first-time phone binding, and duplicate phone conflict.

**Step 2: Implement provider and flow**

Keep provider tokens in memory only long enough to fetch identity. Persist OpenID/UnionID/profile, but never persist WeChat access or refresh tokens.

**Step 3: Verify and commit**

Run: `npm test --workspace @xiaomi-car/server -- wechat`

Expected: PASS.

```bash
git add server/src/services/wechat server/src/routes server/src/services/wechat/*.test.ts
git commit -m "feat: add WeChat OAuth flow"
```

### Task 7: Public Content, Cars, Dealers, and Inventory APIs

**Files:**
- Create: `server/src/repositories/content.repository.ts`
- Create: `server/src/repositories/cars.repository.ts`
- Create: `server/src/repositories/dealers.repository.ts`
- Create: `server/src/routes/content.routes.ts`
- Create: `server/src/routes/cars.routes.ts`
- Create: `server/src/routes/dealers.routes.ts`
- Test: `server/src/routes/catalog.integration.test.ts`

**Step 1: Write failing API tests**

Assert only published content/cars and active orderable dealers are returned. Verify filters, ordering, no exact inventory quantity leakage, and no draft payload leakage.

**Step 2: Implement parameterized queries**

Map JSON database fields through Zod contracts and return cache headers suitable for CDN/public API caching.

**Step 3: Verify and commit**

Run: `npm test --workspace @xiaomi-car/server -- catalog.integration.test.ts`

Expected: PASS.

```bash
git add server/src/repositories server/src/routes
git commit -m "feat: expose published catalog APIs"
```

### Task 8: Zero-Amount Orders and Inventory Consistency

**Files:**
- Create: `server/src/domain/order-state.ts`
- Create: `server/src/services/order.service.ts`
- Create: `server/src/routes/orders.routes.ts`
- Create: `server/src/workers/expire-orders.ts`
- Test: `server/src/domain/order-state.test.ts`
- Test: `server/src/services/order.service.integration.test.ts`

**Step 1: Write failing state-machine tests**

Allow only documented transitions among `pending_confirmation`, `confirmed`, `cancelled`, `expired`, and `completed`.

**Step 2: Write failing concurrency tests**

Run parallel creates against one available unit and assert exactly one order succeeds. Verify idempotency returns the same order and cancellation/expiry releases once.

**Step 3: Implement transactional operations**

Use `SELECT ... FOR UPDATE`, unique user/car active-order protection, unpredictable order numbers, user-scoped idempotency keys, and atomic inventory updates.

**Step 4: Verify and commit**

Run: `npm test --workspace @xiaomi-car/server -- order`

Expected: PASS, including the parallel reservation test.

```bash
git add server/src/domain server/src/services/order.service.ts server/src/routes/orders.routes.ts server/src/workers
git commit -m "feat: add zero-amount inventory reservations"
```

### Task 9: Test-Drive Booking and User Profile

**Files:**
- Create: `server/src/domain/test-drive-state.ts`
- Create: `server/src/services/test-drive.service.ts`
- Create: `server/src/routes/test-drive.routes.ts`
- Create: `server/src/routes/profile.routes.ts`
- Test: `server/src/routes/test-drive.integration.test.ts`

**Step 1: Write failing tests**

Cover future-date validation, ownership isolation, profile masking, status history, cancellation policy, and disabled-user rejection.

**Step 2: Implement routes and services**

Use authenticated user ID from middleware only; never accept user ownership from request bodies.

**Step 3: Verify and commit**

Run: `npm test --workspace @xiaomi-car/server -- test-drive`

Expected: PASS.

```bash
git add server/src/domain/test-drive-state.ts server/src/services/test-drive.service.ts server/src/routes
git commit -m "feat: add test drives and user profile"
```

### Task 10: Admin Authentication, MFA, RBAC, and Audit

**Files:**
- Create: `server/src/services/auth/admin-auth.service.ts`
- Create: `server/src/services/auth/totp.service.ts`
- Create: `server/src/middleware/admin-auth.ts`
- Create: `server/src/middleware/require-permission.ts`
- Create: `server/src/middleware/csrf.ts`
- Create: `server/src/services/audit.service.ts`
- Create: `server/src/routes/admin/auth.routes.ts`
- Create: `server/src/cli/create-super-admin.ts`
- Test: `server/src/routes/admin/auth.integration.test.ts`
- Test: `server/src/middleware/require-permission.test.ts`

**Step 1: Write failing tests**

Cover MFA challenge expiry, TOTP replay, lockout, refresh rotation, CSRF, disabled sessions, permission denial, self-escalation, and last-super-admin protection.

**Step 2: Implement admin security**

Encrypt TOTP secrets with an application key, use HttpOnly/Secure/SameSite cookies, require CSRF for mutations, and append audit records for all sensitive outcomes.

**Step 3: Verify and commit**

Run: `npm test --workspace @xiaomi-car/server -- admin`

Expected: PASS.

```bash
git add server/src/services/auth server/src/middleware server/src/routes/admin server/src/cli
git commit -m "feat: add admin MFA and RBAC"
```

### Task 11: Admin Operations APIs and Dashboard

**Files:**
- Create: `server/src/routes/admin/content.routes.ts`
- Create: `server/src/routes/admin/cars.routes.ts`
- Create: `server/src/routes/admin/dealers.routes.ts`
- Create: `server/src/routes/admin/inventory.routes.ts`
- Create: `server/src/routes/admin/orders.routes.ts`
- Create: `server/src/routes/admin/users.routes.ts`
- Create: `server/src/routes/admin/test-drives.routes.ts`
- Create: `server/src/routes/admin/sms-deliveries.routes.ts`
- Create: `server/src/routes/admin/dashboard.routes.ts`
- Create: `server/src/services/dashboard-events.ts`
- Test: `server/src/routes/admin/operations.integration.test.ts`

**Step 1: Write failing tests**

Cover content draft/publish/rollback, optimistic inventory locking, legal order transitions, PII permissions, media validation, SMS read-only access, and SSE authorization/reconnect.

**Step 2: Implement operation services and routes**

Enforce permission middleware on every route, mask PII by default, and publish metric snapshots within five seconds of committed user/order transactions.

**Step 3: Verify and commit**

Run: `npm test --workspace @xiaomi-car/server -- operations.integration.test.ts`

Expected: PASS.

```bash
git add server/src/routes/admin server/src/services/dashboard-events.ts
git commit -m "feat: add admin operations APIs"
```

### Task 12: Portal React Application

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/context/auth-context.tsx`
- Create: `apps/web/src/routes/protected-route.tsx`
- Create: `apps/web/src/pages/*.tsx`
- Create: `apps/web/src/components/*.tsx`
- Test: `apps/web/src/**/*.test.tsx`
- Test: `e2e/portal.spec.ts`

**Step 1: Write failing component tests**

Cover responsive navigation, auth return URLs, login tabs, SMS cooldown, delivery-center filters, zero-amount confirmation, absence of portal inventory quantities, order cancellation, test-drive form, and profile masking.

**Step 2: Build the portal**

Implement the approved visual language with accessible semantic HTML, keyboard focus, responsive layouts, real product imagery, loading/empty/error states, and TanStack Query cache invalidation.

**Step 3: Add E2E flows**

Use Playwright against seeded data for browsing, registration, login, ordering, cancellation, test drive, refresh recovery, and mobile navigation.

**Step 4: Verify and commit**

Run: `npm test --workspace @xiaomi-car/web && npm run build --workspace @xiaomi-car/web && npm run e2e -- portal`

Expected: PASS.

```bash
git add apps/web e2e/portal.spec.ts
git commit -m "feat: build customer portal"
```

### Task 13: Admin React Application

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/app.tsx`
- Create: `apps/admin/src/api/client.ts`
- Create: `apps/admin/src/permissions/*.ts`
- Create: `apps/admin/src/layouts/admin-layout.tsx`
- Create: `apps/admin/src/pages/*.tsx`
- Test: `apps/admin/src/**/*.test.tsx`
- Test: `e2e/admin.spec.ts`

**Step 1: Write failing component tests**

Cover MFA login, permission-based navigation, dashboard fallback polling, content version conflicts, inventory conflicts, order actions, masked PII, and audit/SMS read-only views.

**Step 2: Build the operations UI**

Use Ant Design tables/forms with compact operational layouts, stable responsive dimensions, clear destructive confirmations, and no nested decorative cards.

**Step 3: Add E2E flows**

Test login, content publishing, dealer/inventory creation, order processing, dashboard updates, and role configuration.

**Step 4: Verify and commit**

Run: `npm test --workspace @xiaomi-car/admin && npm run build --workspace @xiaomi-car/admin && npm run e2e -- admin`

Expected: PASS.

```bash
git add apps/admin e2e/admin.spec.ts
git commit -m "feat: build operations admin"
```

### Task 14: Observability, Security, and Performance

**Files:**
- Create: `server/src/metrics.ts`
- Create: `server/src/middleware/rate-limit.ts`
- Create: `server/src/middleware/security-headers.ts`
- Create: `load/k6-smoke.js`
- Create: `load/k6-steady.js`
- Create: `load/k6-spike.js`
- Create: `scripts/check-secrets.sh`
- Create: `docs/runbooks/local-development.md`
- Create: `docs/runbooks/production-readiness.md`

**Step 1: Add verification tests**

Test redaction, request metrics, security headers, CORS, body limits, Redis-backed rate limits, readiness failure, and graceful shutdown.

**Step 2: Add load profiles**

Encode 50 RPS steady load, 100 RPS peak, 100 active users, and 200 concurrent spike scenarios with the response-time/error thresholds from the deployment design.

**Step 3: Verify**

Run: `npm run test && npm run lint && npm run typecheck && npm run build`

Expected: all checks pass.

Run: `k6 run load/k6-smoke.js`

Expected: all smoke thresholds pass locally; production-scale results are recorded in UAT.

**Step 4: Commit**

```bash
git add server/src/metrics.ts server/src/middleware load scripts docs/runbooks
git commit -m "chore: add production readiness controls"
```

### Task 15: Deployment Packaging and Release Gate

**Files:**
- Create: `server/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/admin/Dockerfile`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/release-check.sh`
- Create: `docs/runbooks/volcengine-deployment.md`
- Modify: `README.md`

**Step 1: Build immutable artifacts**

Use multi-stage builds, non-root runtime users, health checks, pinned Node major version, and no development dependencies in the API runtime image.

**Step 2: Add CI gates**

Run formatting, lint, typecheck, unit/integration tests, production builds, dependency audit, secret scan, migration dry run, and container build.

**Step 3: Execute release checks**

Run: `./scripts/release-check.sh`

Expected: local gates pass. Real SMS delivery, WeChat callback, TOS, WAF, multi-AZ failover, backup restore, and full 100-user load tests remain blocked until UAT cloud credentials and resources are supplied.

**Step 4: Commit**

```bash
git add server/Dockerfile apps/*/Dockerfile .github scripts/release-check.sh docs/runbooks README.md
git commit -m "chore: package platform for deployment"
```

## Definition of Done

- All acceptance criteria in the portal and admin specs are implemented and traceable to automated or UAT tests.
- All P0/P1 functional cases pass; no open severity-1 or severity-2 defects remain.
- Unit, integration, component, E2E, migration, security, and build checks pass in CI.
- UAT validates real Volcengine SMS, WeChat OAuth, object storage, observability, backup/restore, failover, and the 100-user performance model.
- Production secrets exist only in Volcengine Secret Manager and never in source, artifacts, logs, or ordinary environment files.
