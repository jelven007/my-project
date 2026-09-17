import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";

import { createOrderRequestSchema } from "@xiaomi-car/contracts";

import { HttpError } from "../middleware/error-handler.js";
import { requireUser } from "../middleware/user-auth.js";
import type { TokenService } from "../services/auth/token.service.js";
import type { UserRepository } from "../services/auth/user-auth.service.js";
import { OrderError, type OrderService } from "../services/order.service.js";

const idempotencyKeySchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);

export function createOrdersRouter(
  service: OrderService,
  tokenService: TokenService,
  users?: UserRepository,
): Router {
  const router = Router();
  router.use(requireUser(tokenService, users));

  router.get("/", async (_request, response) => {
    response.json({ items: await service.listForUser(response.locals.user.id) });
  });

  router.post("/", async (request, response) => {
    const idempotencyKey = idempotencyKeySchema.parse(request.header("idempotency-key"));
    const input = createOrderRequestSchema.parse(request.body);
    const order = await service.create(response.locals.user.id, input, idempotencyKey);
    response.status(201).json(order);
  });

  router.post("/:orderId/cancel", async (request, response) => {
    const orderId = z.string().regex(/^\d+$/).parse(request.params.orderId);
    response.json(await service.cancel(response.locals.user.id, orderId));
  });

  const orderErrorHandler: ErrorRequestHandler = (error, _request, _response, next) => {
    if (!(error instanceof OrderError)) {
      next(error);
      return;
    }
    const errors = {
      INVENTORY_UNAVAILABLE: [409, "当前库存不足"],
      ACTIVE_ORDER_EXISTS: [409, "该车型已有进行中的订单"],
      IDEMPOTENCY_CONFLICT: [409, "幂等键已用于其他请求"],
      ORDER_NOT_FOUND: [404, "订单不存在"],
      ORDER_TRANSITION_INVALID: [409, "当前订单状态不允许此操作"],
    } as const;
    const [status, message] = errors[error.code];
    next(new HttpError(status, error.code, message));
  };
  router.use(orderErrorHandler);

  return router;
}
