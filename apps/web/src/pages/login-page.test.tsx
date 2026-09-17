import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client.js";
import { LoginPage } from "./login-page.js";
import { renderWithProviders } from "../test/render.js";

interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function jsonResponse({ status = 200, body = {}, headers = {} }: MockResponseInit): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe("LoginPage", () => {
  beforeEach(() => {
    apiClient.setAccessToken(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("switches between password and SMS login and enforces an SMS cooldown", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse({ status: 401 });
      if (url.includes("/api/auth/sms/send")) return jsonResponse({ status: 202, body: {} });
      return jsonResponse({ status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<LoginPage />, { route: "/login?returnTo=%2Faccount" });

    // Default tab is password login.
    expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "验证码登录" }));
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800001111" } });

    const codeButton = screen.getByRole("button", { name: "获取验证码" });
    fireEvent.click(codeButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/sms/send"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // Cooldown blocks an immediate resend.
    await waitFor(() => expect(codeButton).toBeDisabled());
  });

  it("surfaces API errors without leaving the page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse({ status: 401 });
      if (url.includes("/api/auth/login/password")) {
        return jsonResponse({
          status: 401,
          body: { code: "INVALID_CREDENTIALS", message: "手机号或登录凭证错误" },
        });
      }
      return jsonResponse({ status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800001111" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "StrongPass1!" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("手机号或登录凭证错误");
  });
});
