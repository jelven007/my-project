import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { InMemoryRateLimiter } from "../services/sms/rate-limiter.js";
import { rateLimit } from "./rate-limit.js";

describe("security and rate-limit middleware", () => {
  it("applies strict security headers and hides the framework banner", async () => {
    const response = await request(createApp({ readinessProbe: async () => undefined })).get(
      "/health/live",
    );

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects cross-origin requests outside the allow list", async () => {
    const response = await request(
      createApp({ readinessProbe: async () => undefined, allowedOrigins: ["http://localhost:5173"] }),
    )
      .get("/health/live")
      .set("Origin", "http://evil.example.com");

    // The CORS middleware omits the allow-origin header for disallowed origins.
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("returns 413 when the JSON body exceeds the limit", async () => {
    const app = createApp({ readinessProbe: async () => undefined });
    const response = await request(app)
      .post("/api/does-not-exist")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(1_200_000) }));

    expect(response.status).toBe(413);
  });

  it("blocks requests once the IP rate limit is exceeded", async () => {
    const app = express();
    const limiter = new InMemoryRateLimiter();
    app.use(rateLimit({ limiter, limit: 2, windowSeconds: 60, bucket: "test" }));
    app.get("/", (_req, res) => res.json({ ok: true }));

    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);
    const blocked = await request(app).get("/");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });
});
