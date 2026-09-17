import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminApiClient } from "../api/client.js";
import { LoginPage } from "./login-page.js";
import { renderAdmin } from "../test/render.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe("admin LoginPage", () => {
  beforeEach(() => {
    adminApiClient.setAccessToken(undefined);
    document.cookie = "";
  });
  afterEach(() => vi.restoreAllMocks());

  it("performs the two-step password + MFA login flow", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/login")) {
        return jsonResponse(202, { kind: "mfa_required", challengeToken: "challenge-1", expiresIn: 300 });
      }
      if (url.includes("/auth/mfa/verify")) {
        return jsonResponse(200, {
          accessToken: "token",
          expiresIn: 600,
          csrfToken: "csrf",
          admin: {
            id: "1",
            username: "root",
            displayName: "Root",
            roles: ["super_admin"],
            permissions: ["dashboard:read"],
          },
        });
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAdmin(<LoginPage />);

    fireEvent.change(screen.getByLabelText("用户名或邮箱"), { target: { value: "root" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "StrongPass1!" } });
    fireEvent.click(screen.getByRole("button", { name: /登\s*录/ }));

    // Step 2 appears only after the password step returns an MFA challenge.
    expect(await screen.findByLabelText("动态验证码")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/auth/mfa/verify"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows a safe error when credentials are rejected", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "用户名或登录凭证错误" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAdmin(<LoginPage />);
    fireEvent.change(screen.getByLabelText("用户名或邮箱"), { target: { value: "root" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /登\s*录/ }));

    expect(await screen.findByText("用户名或登录凭证错误")).toBeInTheDocument();
  });
});
