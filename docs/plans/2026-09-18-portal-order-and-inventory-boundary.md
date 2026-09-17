# Portal Order and Inventory Boundary Implementation Plan

**Goal:** Remove inventory management and exact inventory disclosure from the customer
portal while preserving a user-facing model and delivery-center order flow.

**Architecture:** The admin application remains the only UI that creates, edits, or
inspects exact inventory quantities. The portal queries eligible delivery centers for a
selected model, receives only an availability flag plus the opaque inventory identifier
needed to submit an order, and relies on the API transaction to enforce stock.

**Tech Stack:** React 18, React Router, TanStack Query, Express, MySQL, Zod, Vitest.

---

### Task 1: Public Dealer Contract

**Files:**
- Modify: `packages/contracts/src/catalog.ts`
- Modify: `server/src/repositories/dealers.repository.ts`
- Test: `server/src/routes/catalog.integration.test.ts`

**Steps:**
1. Change public dealer offerings to expose `available: boolean`, never total,
   reserved, or exact available quantities.
2. Keep `inventoryId` only as an opaque order submission identifier.
3. Verify filters still return active dealers and published cars.

### Task 2: Portal Order Flow

**Files:**
- Create: `apps/web/src/pages/order-page.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/pages/home-page.tsx`
- Modify: `apps/web/src/pages/car-detail-page.tsx`
- Modify: `apps/web/src/components/order-dialog.tsx`
- Delete: `apps/web/src/pages/inventory-page.tsx`
- Replace test: `apps/web/src/pages/inventory-page.test.tsx`

**Steps:**
1. Remove the portal inventory navigation and `/inventory` feature route.
2. Route “立即下定” to `/order?carId=...`.
3. Let users select an eligible delivery center without showing stock counts.
4. Preserve authentication return URLs and transactional order creation.

### Task 3: Documentation Alignment

**Files:**
- Modify: `docs/specs/2026-09-17-xiaomi-car-portal-spec.md`
- Modify: `docs/specs/2026-09-17-xiaomi-car-admin-spec.md`
- Modify: `docs/testing/2026-09-17-test-plan.md`
- Modify: `docs/testing/2026-09-17-portal-test-cases.md`
- Modify: `docs/testing/2026-09-17-admin-test-cases.md`
- Modify: `docs/testing/2026-09-17-nonfunctional-release-tests.md`
- Modify: `docs/architecture/2026-09-17-volcengine-deployment-technical-design.md`
- Modify: `docs/plans/2026-09-17-xiaomi-car-platform-implementation.md`

**Steps:**
1. State that exact inventory is an admin-only capability.
2. Replace the portal inventory page with delivery-center selection.
3. Update acceptance criteria, traceability, load profiles, and functional tests.

### Task 4: Vehicle Media and Verification

**Files:**
- Modify: `apps/web/public/images/**`
- Modify: `server/src/db/seed.ts`
- Test: portal build and browser screenshots.

**Steps:**
1. Use separate model-appropriate bitmap assets for SU7, YU7, and SU7 Ultra.
2. Verify every static image returns `image/jpeg`.
3. Run lint, typecheck, tests, builds, desktop/mobile screenshots, then commit.
