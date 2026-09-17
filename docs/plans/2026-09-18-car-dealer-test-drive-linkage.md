# Car, Dealer, and Test Drive Linkage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep portal vehicle and test-drive choices synchronized with admin-managed cars, dealers, and dealer inventory while simplifying the requested UI labels.

**Architecture:** The admin and portal continue sharing the existing MySQL `cars`, `dealers`, and `dealer_inventory` tables. Public catalog endpoints return only published cars and active dealer-car relationships; the portal consumes those endpoints directly and never maintains a duplicate static mapping.

**Tech Stack:** React 18, TanStack Query, React Router, Express, MySQL 8, Vitest, Testing Library.

---

### Task 1: Simplify Portal Home Navigation

**Files:**
- Modify: `apps/web/src/pages/home-page.tsx`
- Modify: `apps/web/src/app.test.tsx`

**Steps:**
1. Add a failing assertion that the home page has no standalone `车型详情` link.
2. Remove the section-level `车型详情` link while retaining each model card's `了解详情` action.
3. Run the portal tests and confirm the new assertion passes.

### Task 2: Enforce Test-Drive Vehicle and Dealer Matching

**Files:**
- Modify: `apps/web/src/api/hooks.ts`
- Modify: `apps/web/src/pages/test-drive-page.tsx`
- Create: `apps/web/src/pages/test-drive-page.test.tsx`
- Create: `server/src/repositories/dealers.repository.test.ts`

**Steps:**
1. Add a page test with multiple vehicles and dealers, asserting dealer options are requested only after a vehicle is selected and only matching dealers appear.
2. Add an `enabled` option to the dealer query and disable it until a vehicle is selected.
3. Defensively filter returned dealers by the selected `carId`.
4. Add a repository test asserting active dealer, active inventory, and published vehicle predicates are always present.
5. Run focused portal and server tests.

### Task 3: Keep Admin Vehicle Status and Portal Catalog Synchronized

**Files:**
- Modify: `server/src/routes/cars.routes.ts`
- Create: `server/src/repositories/cars.repository.test.ts`
- Modify: `docs/specs/2026-09-17-xiaomi-car-admin-spec.md`
- Modify: `docs/specs/2026-09-17-xiaomi-car-portal-spec.md`
- Modify: `docs/testing/2026-09-17-admin-test-cases.md`
- Modify: `docs/testing/2026-09-17-portal-test-cases.md`

**Steps:**
1. Add a repository test proving public list/detail queries require `status='published'`.
2. Change public car responses to revalidate rather than remain browser-fresh after an admin status transition.
3. Document that offline cars disappear from the portal list, detail route, test-drive selector, and new-order flow.
4. Update test cases to cover the full cross-application behavior.

### Task 4: Rename Admin Inventory Navigation

**Files:**
- Modify: `apps/admin/src/permissions/permissions.ts`
- Modify: `apps/admin/src/permissions/permissions.test.tsx`
- Modify: `apps/admin/src/pages/inventory-page.tsx`
- Modify: `docs/specs/2026-09-17-xiaomi-car-admin-spec.md`

**Steps:**
1. Change the navigation label and page title from `经销商与库存` to `经销商库存`.
2. Add a navigation-label assertion.
3. Update matching requirement text.
4. Run admin tests.

### Task 5: Verify End-to-End Behavior

**Files:**
- No additional source files expected.

**Steps:**
1. Run all tests, lint, typecheck, and production builds.
2. Use the running admin API to take one vehicle offline and verify it disappears from `/api/cars` and dealer matches.
3. Publish the vehicle again and verify it returns.
4. Verify portal and admin pages in a browser at desktop and mobile sizes.
5. Commit with `张路 <jelven@126.com>` and push `main`.
