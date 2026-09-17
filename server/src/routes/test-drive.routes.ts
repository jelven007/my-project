import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";

import { createTestDriveRequestSchema } from "@xiaomi-car/contracts";

import { HttpError } from "../middleware/error-handler.js";
import { requireUser } from "../middleware/user-auth.js";
import type { TokenService } from "../services/auth/token.service.js";
import type { UserRepository } from "../services/auth/user-auth.service.js";
import {
  TestDriveError,
  type TestDriveService,
} from "../services/test-drive.service.js";

export function createTestDriveRouter(
  service: TestDriveService,
  tokenService: TokenService,
  users: UserRepository,
): Router {
  const router = Router();
  router.use(requireUser(tokenService, users));

  router.get("/", async (_request, response) => {
    response.json({ items: await service.listForUser(response.locals.user.id) });
  });

  router.post("/", async (request, response) => {
    const input = createTestDriveRequestSchema.parse(request.body);
    response.status(201).json(await service.create(response.locals.user.id, input));
  });

  router.post("/:id/cancel", async (request, response) => {
    const id = z.string().regex(/^\d+$/).parse(request.params.id);
    response.json(await service.cancel(response.locals.user.id, id));
  });

  const testDriveErrorHandler: ErrorRequestHandler = (error, _request, _response, next) => {
    if (!(error instanceof TestDriveError)) {
      next(error);
      return;
    }
    const errors = {
      TEST_DRIVE_DATE_INVALID: [400, "请选择未来的试驾日期"],
      TEST_DRIVE_NOT_FOUND: [404, "预约记录不存在"],
      TEST_DRIVE_TRANSITION_INVALID: [409, "当前预约状态不允许取消"],
    } as const;
    const [status, message] = errors[error.code];
    next(new HttpError(status, error.code, message));
  };
  router.use(testDriveErrorHandler);
  return router;
}
