import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type Express, type RequestHandler, type Router } from "express";

import { errorHandler, HttpError } from "./middleware/error-handler.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { requestId } from "./middleware/request-id.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { metricsRegistry } from "./metrics.js";
import { createHealthRouter, type ReadinessProbe } from "./routes/health.routes.js";

export interface AppDependencies {
  readinessProbe: ReadinessProbe;
  allowedOrigins?: string[];
  authRateLimit?: RequestHandler;
  adminAuthRouter?: Router;
  adminOperationsRouter?: Router;
  authRouter?: Router;
  carsRouter?: Router;
  contentRouter?: Router;
  dealersRouter?: Router;
  ordersRouter?: Router;
  profileRouter?: Router;
  testDriveRouter?: Router;
  trustProxyHops?: number;
}

export function createApp({
  readinessProbe,
  allowedOrigins = ["http://localhost:5173", "http://localhost:5174"],
  authRateLimit,
  adminAuthRouter,
  adminOperationsRouter,
  authRouter,
  carsRouter,
  contentRouter,
  dealersRouter,
  ordersRouter,
  profileRouter,
  testDriveRouter,
  trustProxyHops = 0,
}: AppDependencies): Express {
  const app = express();

  const noop: RequestHandler = (_req, _res, next) => next();

  app.disable("x-powered-by");
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  app.use(requestId);
  app.use(metricsMiddleware());
  app.use(securityHeaders());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, origin === undefined || allowedOrigins.includes(origin));
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/health", createHealthRouter(readinessProbe));
  app.get("/metrics", (_req, res) => {
    res.type("text/plain").send(metricsRegistry.render());
  });
  if (adminAuthRouter) app.use("/api/admin/auth", authRateLimit ?? noop, adminAuthRouter);
  if (adminOperationsRouter) app.use("/api/admin", adminOperationsRouter);
  if (authRouter) app.use("/api/auth", authRateLimit ?? noop, authRouter);
  if (contentRouter) app.use("/api/content", contentRouter);
  if (carsRouter) app.use("/api/cars", carsRouter);
  if (dealersRouter) app.use("/api/dealers", dealersRouter);
  if (ordersRouter) app.use("/api/orders", ordersRouter);
  if (profileRouter) app.use("/api/profile", profileRouter);
  if (testDriveRouter) app.use("/api/test-drives", testDriveRouter);
  app.use((_req, _res, next) => {
    next(new HttpError(404, "NOT_FOUND", "请求的资源不存在"));
  });
  app.use(errorHandler);

  return app;
}
