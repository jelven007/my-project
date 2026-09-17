import { Router } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import { pagination } from "./route-utils.js";

/**
 * Read-only audit access. The append-only log has no update or delete route by
 * design, so tampering is impossible through the API surface.
 */
export function createAdminAuditRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("audit:read", audit), async (request, response) => {
    const { page, pageSize, offset } = pagination(request.query);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, actor_type AS actorType, actor_id AS actorId, action,
              resource_type AS resourceType, resource_id AS resourceId, result,
              ip, user_agent AS userAgent, metadata, created_at AS createdAt
       FROM audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    );
    response.json({ items: rows, pagination: { page, pageSize } });
  });

  return router;
}
