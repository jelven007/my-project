import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { HttpError } from "./error-handler.js";
import { requirePermission } from "./require-permission.js";

function responseWithPermissions(permissions: string[]) {
  return { locals: { admin: { id: "1", permissions } } } as unknown as Response;
}

describe("requirePermission", () => {
  it("allows an administrator with the required permission", async () => {
    const next = vi.fn();
    await requirePermission("content:update")(
      {} as Request,
      responseWithPermissions(["content:update"]),
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("denies and audits a missing permission", async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const next = vi.fn();
    const request = {
      ip: "127.0.0.1",
      headers: { "user-agent": "test" },
      params: { id: "42" },
      get: vi.fn().mockReturnValue("test"),
    } as unknown as Request;

    await requirePermission("cars:publish", audit)(
      request,
      responseWithPermissions(["cars:update"]),
      next as NextFunction,
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "permission.denied",
        actorId: "1",
        result: "denied",
        metadata: { requiredPermission: "cars:publish" },
      }),
    );
    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });
});
