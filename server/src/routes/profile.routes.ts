import { Router } from "express";

import { HttpError } from "../middleware/error-handler.js";
import { requireUser } from "../middleware/user-auth.js";
import type { TokenService } from "../services/auth/token.service.js";
import type { UserRepository } from "../services/auth/user-auth.service.js";

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function createProfileRouter(
  users: UserRepository,
  tokenService: TokenService,
): Router {
  const router = Router();
  router.use(requireUser(tokenService, users));

  router.get("/", async (_request, response) => {
    const user = await users.findById(response.locals.user.id);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在");
    response.setHeader("Cache-Control", "no-store");
    response.json({
      id: user.id,
      nickname: user.nickname,
      phoneMasked: maskPhone(user.phone),
      lastLoginAt: user.lastLoginAt,
    });
  });

  return router;
}
