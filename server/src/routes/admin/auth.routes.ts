import { randomBytes } from "node:crypto";

import { Router, type ErrorRequestHandler, type Response } from "express";
import { z, ZodError } from "zod";

import { requireAdmin } from "../../middleware/admin-auth.js";
import {
  adminCsrfCookieName,
  requireAdminCsrf,
} from "../../middleware/csrf.js";
import { HttpError } from "../../middleware/error-handler.js";
import type { AuthenticatedAdmin } from "../../middleware/require-permission.js";
import {
  AdminAuthError,
  type AdminAuthService,
  type AdminRequestContext,
  type AdminSession,
} from "../../services/auth/admin-auth.service.js";

const refreshCookieName = "xiaomi_admin_refresh";
const accessCookieName = "xiaomi_admin_access";
const refreshCookieMaxAge = 8 * 60 * 60 * 1000;
const accessCookieMaxAge = 10 * 60 * 1000;

const loginSchema = z.object({
  login: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});
const mfaSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/u),
});

interface AdminAuthRouterDependencies {
  authService: AdminAuthService;
  allowedOrigin: string;
  secureCookies: boolean;
}

function requestContext(request: {
  ip?: string;
  socket: { remoteAddress?: string };
  get(name: string): string | undefined;
}): AdminRequestContext {
  return {
    ip: request.ip ?? request.socket.remoteAddress,
    userAgent: request.get("user-agent"),
  };
}

function refreshCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/api/admin",
    maxAge: refreshCookieMaxAge,
  };
}

function csrfCookieOptions(secure: boolean) {
  return {
    httpOnly: false,
    secure,
    sameSite: "strict" as const,
    path: "/api/admin",
    maxAge: refreshCookieMaxAge,
  };
}

function accessCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/api/admin",
    maxAge: accessCookieMaxAge,
  };
}

function sendSession(response: Response, session: AdminSession, secure: boolean): void {
  const csrfToken = randomBytes(32).toString("base64url");
  response.cookie(
    refreshCookieName,
    session.refreshToken,
    refreshCookieOptions(secure),
  );
  response.cookie(accessCookieName, session.accessToken, accessCookieOptions(secure));
  response.cookie(adminCsrfCookieName, csrfToken, csrfCookieOptions(secure));
  response.json({
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    admin: session.admin,
    csrfToken,
  });
}

export function createAdminAuthRouter({
  authService,
  allowedOrigin,
  secureCookies,
}: AdminAuthRouterDependencies): Router {
  const router = Router();
  const csrf = requireAdminCsrf(allowedOrigin);
  const authenticated = requireAdmin(authService);

  router.post("/login", async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await authService.login(
      input.login,
      input.password,
      requestContext(request),
    );
    if (result.kind === "mfa_required") {
      response.status(202).json(result);
      return;
    }
    sendSession(response, result, secureCookies);
  });

  router.post("/mfa/verify", async (request, response) => {
    const input = mfaSchema.parse(request.body);
    const session = await authService.verifyMfa(
      input.challengeToken,
      input.code,
      requestContext(request),
    );
    sendSession(response, session, secureCookies);
  });

  router.post("/refresh", csrf, async (request, response) => {
    const refreshToken = request.cookies?.[refreshCookieName] as string | undefined;
    if (!refreshToken) throw new HttpError(401, "TOKEN_INVALID", "后台登录状态已失效");
    const session = await authService.refresh(refreshToken, requestContext(request));
    sendSession(response, session, secureCookies);
  });

  router.post("/logout", csrf, authenticated, async (request, response) => {
    const refreshToken = request.cookies?.[refreshCookieName] as string | undefined;
    const admin = response.locals.admin as AuthenticatedAdmin;
    await authService.logout(refreshToken, admin.id, requestContext(request));
    response.clearCookie(refreshCookieName, refreshCookieOptions(secureCookies));
    response.clearCookie(accessCookieName, accessCookieOptions(secureCookies));
    response.clearCookie(adminCsrfCookieName, csrfCookieOptions(secureCookies));
    response.status(204).send();
  });

  router.get("/me", authenticated, (_request, response) => {
    response.json({ admin: response.locals.admin as AuthenticatedAdmin });
  });

  const adminAuthErrorHandler: ErrorRequestHandler = (error, _request, _response, next) => {
    if (error instanceof ZodError) {
      next(new HttpError(400, "VALIDATION_ERROR", "请求参数不正确", error.issues));
      return;
    }
    if (error instanceof AdminAuthError) {
      const mapping: Record<
        AdminAuthError["code"],
        readonly [number, string]
      > = {
        ACCOUNT_DISABLED: [403, "管理员账号已停用"],
        ACCOUNT_LOCKED: [423, "账号已临时锁定，请稍后重试"],
        INVALID_CREDENTIALS: [401, "用户名或登录凭证错误"],
        MFA_CHALLENGE_INVALID: [401, "MFA 挑战无效或已过期"],
        MFA_CODE_INVALID: [401, "MFA 验证码无效"],
        MFA_CODE_REPLAYED: [401, "MFA 验证码已使用"],
        MFA_SETUP_REQUIRED: [403, "超级管理员必须先配置 MFA"],
        TOKEN_INVALID: [401, "后台登录状态已失效"],
      };
      const [status, message] = mapping[error.code];
      next(new HttpError(status, error.code, message));
      return;
    }
    next(error);
  };
  router.use(adminAuthErrorHandler);
  return router;
}
