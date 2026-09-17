import { Router } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import { pagination } from "./route-utils.js";

export function createAdminSmsDeliveriesRouter(
  pool: Pool,
  audit: AuditRecorder,
): Router {
  const router = Router();

  router.get("/", requirePermission("sms:read", audit), async (request, response) => {
    const { page, pageSize, offset } = pagination(request.query);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT request_id AS requestId, phone_masked AS phone,
              scene, provider, provider_message_id AS providerMessageId,
              status, error_code AS errorCode, sent_at AS sentAt,
              delivered_at AS deliveredAt, created_at AS createdAt
       FROM sms_deliveries
       ORDER BY created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    );
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              SUM(status IN ('accepted', 'delivered')) AS successful
       FROM sms_deliveries
       WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR`,
    );
    const summary = summaryRows[0] ?? { total: 0, successful: 0 };
    response.json({
      items: rows,
      pagination: { page, pageSize },
      summary: {
        total24h: Number(summary.total),
        successRate24h:
          Number(summary.total) === 0
            ? null
            : Number(summary.successful) / Number(summary.total),
      },
    });
  });

  return router;
}
