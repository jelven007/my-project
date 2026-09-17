import { Router } from "express";

import { HttpError } from "../middleware/error-handler.js";

export type ReadinessProbe = () => Promise<void>;

export function createHealthRouter(readinessProbe: ReadinessProbe): Router {
  const router = Router();

  router.get("/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/ready", async (_req, res, next) => {
    try {
      await readinessProbe();
      res.json({ status: "ready" });
    } catch {
      next(new HttpError(503, "SERVICE_NOT_READY", "服务暂未就绪"));
    }
  });

  return router;
}
