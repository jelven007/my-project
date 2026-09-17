import type { RequestHandler } from "express";

import { metricsRegistry, type MetricsRegistry } from "../metrics.js";

/**
 * Records latency and status per matched route. It reads `req.route` after the
 * handler resolves so metrics stay low-cardinality (path templates, not IDs).
 */
export function metricsMiddleware(registry: MetricsRegistry = metricsRegistry): RequestHandler {
  return (request, response, next) => {
    const start = process.hrtime.bigint();
    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const routePath =
        (request.route?.path as string | undefined) ??
        (request.baseUrl ? `${request.baseUrl}` : request.path);
      registry.observe({
        method: request.method,
        route: request.baseUrl ? `${request.baseUrl}${routePath === "/" ? "" : routePath}` : routePath,
        statusCode: response.statusCode,
        durationMs,
      });
    });
    next();
  };
}
