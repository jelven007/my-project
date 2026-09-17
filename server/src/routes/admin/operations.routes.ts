import { Router } from "express";
import type { Pool } from "mysql2/promise";

import { requireAdmin } from "../../middleware/admin-auth.js";
import { requireAdminCsrf } from "../../middleware/csrf.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import type { AdminAuthService } from "../../services/auth/admin-auth.service.js";
import type { DashboardEvents } from "../../services/dashboard-events.js";
import { createAdminCarsRouter } from "./cars.routes.js";
import { createAdminContentRouter } from "./content.routes.js";
import { createAdminAuditRouter } from "./audit.routes.js";
import { createAdminDashboardRouter } from "./dashboard.routes.js";
import { createAdminDealersRouter } from "./dealers.routes.js";
import { createAdminInventoryRouter } from "./inventory.routes.js";
import { createAdminOrdersRouter } from "./orders.routes.js";
import { createAdminSmsDeliveriesRouter } from "./sms-deliveries.routes.js";
import { createAdminTestDrivesRouter } from "./test-drives.routes.js";
import { createAdminUsersRouter } from "./users.routes.js";

interface AdminOperationsDependencies {
  pool: Pool;
  audit: AuditRecorder;
  authService: AdminAuthService;
  allowedOrigin: string;
  dashboardEvents: DashboardEvents;
}

export function createAdminOperationsRouter({
  pool,
  audit,
  authService,
  allowedOrigin,
  dashboardEvents,
}: AdminOperationsDependencies): Router {
  const router = Router();
  const csrf = requireAdminCsrf(allowedOrigin);
  router.use(requireAdmin(authService));
  router.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      next();
      return;
    }
    csrf(request, response, next);
  });
  router.use("/content", createAdminContentRouter(pool, audit));
  router.use("/cars", createAdminCarsRouter(pool, audit));
  router.use("/dealers", createAdminDealersRouter(pool, audit));
  router.use("/inventory", createAdminInventoryRouter(pool, audit));
  router.use("/orders", createAdminOrdersRouter(pool, audit));
  router.use("/users", createAdminUsersRouter(pool, audit));
  router.use("/test-drives", createAdminTestDrivesRouter(pool, audit));
  router.use("/sms-deliveries", createAdminSmsDeliveriesRouter(pool, audit));
  router.use("/dashboard", createAdminDashboardRouter(pool, audit, dashboardEvents));
  router.use("/audit-logs", createAdminAuditRouter(pool, audit));
  return router;
}
