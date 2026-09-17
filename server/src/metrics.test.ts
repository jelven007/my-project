import { describe, expect, it } from "vitest";

import { MetricsRegistry, redact } from "./metrics.js";

describe("redact", () => {
  it("masks phone numbers and known secret fields", () => {
    const output = redact({
      phone: "13800001234",
      password: "StrongPass1!",
      code: "123456",
      nested: { refreshToken: "abc", note: "safe" },
      message: "联系 13900002222 处理",
    });

    expect(output).toMatchObject({
      phone: "138****1234",
      password: "[REDACTED]",
      code: "[REDACTED]",
      nested: { refreshToken: "[REDACTED]", note: "safe" },
    });
    expect(output.message).toBe("联系 139****2222 处理");
  });
});

describe("MetricsRegistry", () => {
  it("aggregates request counts and latency percentiles", () => {
    const registry = new MetricsRegistry();
    registry.observe({ method: "GET", route: "/api/cars", statusCode: 200, durationMs: 10 });
    registry.observe({ method: "GET", route: "/api/cars", statusCode: 200, durationMs: 30 });
    registry.observe({ method: "GET", route: "/api/cars", statusCode: 500, durationMs: 50 });

    const snapshot = registry.snapshot();
    expect(snapshot.totalRequests).toBe(3);
    expect(snapshot.errorRequests).toBe(1);
    const line = registry.render();
    expect(line).toContain("http_requests_total 3");
    expect(line).toContain('http_requests_errors_total 1');
  });
});
