import type { RequestHandler } from "express";

import type { AuditRecorder } from "../services/audit.service.js";
import { HttpError } from "./error-handler.js";

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export function requirePermission(
  permission: string,
  audit?: AuditRecorder,
): RequestHandler {
  return async (request, response, next) => {
    const admin = response.locals.admin as AuthenticatedAdmin | undefined;
    if (admin?.permissions.includes(permission)) {
      next();
      return;
    }

    if (admin && audit) {
      const resourceId = request.params.id;
      await audit.record({
        actorType: "admin",
        actorId: admin.id,
        action: "permission.denied",
        resourceType: request.baseUrl || request.path,
        resourceId: Array.isArray(resourceId) ? resourceId[0] : resourceId,
        result: "denied",
        ip: request.ip,
        userAgent: request.get("user-agent"),
        metadata: { requiredPermission: permission },
      });
    }
    next(new HttpError(403, "PERMISSION_DENIED", "权限不足"));
  };
}
