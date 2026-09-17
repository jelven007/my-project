import { describe, expect, it } from "vitest";

import {
  passwordSchema,
  phoneSchema,
  registerRequestSchema,
  sendSmsCodeRequestSchema,
} from "./auth.js";
import { apiErrorSchema, paginatedSchema } from "./api.js";

describe("authentication contracts", () => {
  it("accepts only mainland China mobile numbers", () => {
    expect(phoneSchema.safeParse("13800138000").success).toBe(true);
    expect(phoneSchema.safeParse("+8613800138000").success).toBe(true);
    expect(phoneSchema.safeParse("12800138000").success).toBe(false);
  });

  it("requires a production-grade password", () => {
    expect(passwordSchema.safeParse("weak").success).toBe(false);
    expect(passwordSchema.safeParse("StrongPass1!").success).toBe(true);
    expect(passwordSchema.safeParse("alllowercase1!").success).toBe(false);
  });

  it("normalizes phones in authentication payloads", () => {
    expect(
      sendSmsCodeRequestSchema.parse({ phone: "+8613800138000", scene: "register" }),
    ).toEqual({ phone: "13800138000", scene: "register" });
    expect(
      registerRequestSchema.safeParse({
        phone: "13800138000",
        code: "12345",
        password: "StrongPass1!",
        nickname: "车主",
      }).success,
    ).toBe(false);
  });
});

describe("API contracts", () => {
  it("parses stable errors and pagination", () => {
    const error = apiErrorSchema.parse({
      code: "VALIDATION_ERROR",
      message: "invalid request",
      requestId: "req-1",
    });
    expect(error.code).toBe("VALIDATION_ERROR");

    const page = paginatedSchema(phoneSchema).parse({
      items: ["13800138000"],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    expect(page.total).toBe(1);
  });
});
