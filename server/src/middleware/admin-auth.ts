import type { RequestHandler } from "express";

import {
  AdminAuthError,
  type AdminAuthService,
} from "../services/auth/admin-auth.service.js";
import { HttpError } from "./error-handler.js";

export function requireAdmin(authService: AdminAuthService): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.get("authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    const token =
      bearerToken ?? (request.cookies?.xiaomi_admin_access as string | undefined);
    if (!token) {
      next(new HttpError(401, "TOKEN_INVALID", "请先登录后台"));
      return;
    }

    try {
      response.locals.admin = await authService.verifyAccess(token);
      next();
    } catch (error) {
      if (error instanceof AdminAuthError && error.code === "ACCOUNT_DISABLED") {
        next(new HttpError(403, error.code, "管理员账号已停用"));
        return;
      }
      next(new HttpError(401, "TOKEN_INVALID", "后台登录状态已失效"));
    }
  };
}
