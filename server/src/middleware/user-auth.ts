import type { RequestHandler } from "express";

import type { TokenService } from "../services/auth/token.service.js";
import type { UserRepository } from "../services/auth/user-auth.service.js";
import { HttpError } from "./error-handler.js";

export function requireUser(
  tokenService: TokenService,
  users?: UserRepository,
): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    if (!token) {
      next(new HttpError(401, "TOKEN_INVALID", "请先登录"));
      return;
    }

    try {
      const tokenUser = await tokenService.verifyAccess(token);
      if (users) {
        const currentUser = await users.findById(tokenUser.id);
        if (!currentUser?.active) {
          next(new HttpError(403, "ACCOUNT_DISABLED", "账号已停用"));
          return;
        }
      }
      response.locals.user = tokenUser;
      next();
    } catch {
      next(new HttpError(401, "TOKEN_INVALID", "登录状态已失效"));
    }
  };
}
