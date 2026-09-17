import { timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

import { HttpError } from "./error-handler.js";

export const adminCsrfCookieName = "xiaomi_admin_csrf";

function equal(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireAdminCsrf(allowedOrigin: string): RequestHandler {
  return (request, _response, next) => {
    if (
      request.get("origin") !== allowedOrigin ||
      !equal(
        request.cookies?.[adminCsrfCookieName] as string | undefined,
        request.get("x-csrf-token"),
      )
    ) {
      next(new HttpError(403, "CSRF_INVALID", "请求来源校验失败"));
      return;
    }
    next();
  };
}
