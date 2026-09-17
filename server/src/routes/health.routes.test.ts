import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";

describe("health routes", () => {
  it("reports liveness without checking dependencies", async () => {
    const readinessProbe = vi.fn();
    const response = await request(createApp({ readinessProbe })).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok" });
    expect(readinessProbe).not.toHaveBeenCalled();
  });

  it("reports readiness when dependencies are available", async () => {
    const response = await request(
      createApp({ readinessProbe: vi.fn().mockResolvedValue(undefined) }),
    ).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ready" });
  });

  it("returns a stable error when dependencies are unavailable", async () => {
    const response = await request(
      createApp({ readinessProbe: vi.fn().mockRejectedValue(new Error("database unavailable")) }),
    ).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: "SERVICE_NOT_READY",
      message: "服务暂未就绪",
    });
    expect(response.body.requestId).toEqual(expect.any(String));
  });
});
