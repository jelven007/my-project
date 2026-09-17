import type { RequestHandler } from "express";

import type { RateLimiter } from "../services/sms/rate-limiter.js";
import { HttpError } from "./error-handler.js";

interface RateLimitOptions {
  limiter: RateLimiter;
  limit: number;
  windowSeconds: number;
  bucket: string;
  keyResolver?: (ip: string, request: Parameters<RequestHandler>[0]) => string;
}

/**
 * IP-scoped HTTP rate limit backed by the shared limiter (Redis in production).
 * Sensitive auth routes compose this with per-account limits handled deeper in
 * the stack; this guards the network edge against bursts and simple abuse.
 */
export function rateLimit({
  limiter,
  limit,
  windowSeconds,
  bucket,
  keyResolver,
}: RateLimitOptions): RequestHandler {
  return async (request, response, next) => {
    const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const key = keyResolver ? keyResolver(ip, request) : `${bucket}:${ip}`;
    try {
      const result = await limiter.consume(key, limit, windowSeconds);
      response.setHeader("X-RateLimit-Limit", limit.toString());
      if (!result.allowed) {
        response.setHeader("Retry-After", result.retryAfterSeconds.toString());
        next(new HttpError(429, "RATE_LIMITED", "请求过于频繁，请稍后重试"));
        return;
      }
      next();
    } catch {
      // Fail open on limiter outages so availability is not coupled to Redis.
      next();
    }
  };
}
