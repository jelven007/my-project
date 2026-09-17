import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client.js";
import { renderWithProviders } from "../test/render.js";
import { OrderPage } from "./order-page.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe("OrderPage", () => {
  beforeEach(() => apiClient.setAccessToken(undefined));
  afterEach(() => vi.restoreAllMocks());

  it("shows eligible delivery centers without exposing inventory quantities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/refresh")) return jsonResponse(401, {});
        if (url.includes("/api/cars/su7")) {
          return jsonResponse(200, { id: "1", slug: "su7", name: "SU7" });
        }
        if (url.includes("/api/dealers")) {
          return jsonResponse(200, {
            items: [
              {
                id: "1",
                code: "BJ01",
                name: "北京王府井交付中心",
                province: "北京",
                city: "北京",
                address: "王府井大街 1 号",
                phone: "01000000000",
                longitude: null,
                latitude: null,
                businessHours: "10:00-21:00",
                availableCars: [
                  {
                    inventoryId: "10",
                    carId: "1",
                    carName: "SU7",
                    carSlug: "su7",
                    available: true,
                  },
                ],
              },
            ],
          });
        }
        return jsonResponse(404, {});
      }),
    );

    renderWithProviders(<OrderPage />, {
      route: "/order?carId=1&slug=su7",
    });

    expect(await screen.findByText("北京王府井交付中心")).toBeInTheDocument();
    expect(screen.queryByText(/库存|可用量|已占用/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择门店" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("请先登录")).toBeInTheDocument();
  });
});
