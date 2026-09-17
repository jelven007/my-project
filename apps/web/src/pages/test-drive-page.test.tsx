import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client.js";
import { renderWithProviders } from "../test/render.js";
import { TestDrivePage } from "./test-drive-page.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe("TestDrivePage", () => {
  beforeEach(() => apiClient.setAccessToken(undefined));
  afterEach(() => vi.restoreAllMocks());

  it("loads active dealers only after selecting their published car", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse(401, {});
      if (url.endsWith("/api/cars")) {
        return jsonResponse(200, {
          items: [
            { id: "1", slug: "su7", name: "SU7" },
            { id: "2", slug: "yu7", name: "YU7" },
          ],
        });
      }
      if (url.includes("/api/dealers?carId=1")) {
        return jsonResponse(200, {
          items: [
            {
              id: "10",
              name: "北京交付中心",
              city: "北京",
              availableCars: [{ carId: "1", available: true }],
            },
            {
              id: "20",
              name: "错误车型门店",
              city: "上海",
              availableCars: [{ carId: "2", available: true }],
            },
          ],
        });
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<TestDrivePage />, { route: "/test-drive" });

    expect(await screen.findByRole("option", { name: "SU7" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/api/dealers")),
    ).toBe(false);

    fireEvent.change(screen.getByLabelText("车型"), { target: { value: "1" } });

    expect(await screen.findByRole("option", { name: "北京 · 北京交付中心" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /错误车型门店/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/dealers?carId=1"),
        expect.any(Object),
      ),
    );
  });
});
