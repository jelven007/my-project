import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client.js";
import { InventoryPage } from "./inventory-page.js";
import { renderWithProviders } from "../test/render.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const dealers = [
  {
    id: "1",
    code: "BJ01",
    name: "北京王府井体验中心",
    province: "北京",
    city: "北京",
    address: "王府井大街 1 号",
    phone: "01000000000",
    longitude: null,
    latitude: null,
    businessHours: "10:00-21:00",
    inventory: [
      {
        inventoryId: "10",
        carId: "1",
        carName: "SU7",
        carSlug: "su7",
        totalQuantity: 5,
        reservedQuantity: 2,
        availableQuantity: 3,
      },
    ],
  },
];

describe("InventoryPage", () => {
  beforeEach(() => apiClient.setAccessToken(undefined));
  afterEach(() => vi.restoreAllMocks());

  function stubFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse(401, {});
      if (url.includes("/api/cars")) return jsonResponse(200, { items: [{ id: "1", slug: "su7", name: "SU7" }] });
      if (url.includes("/api/dealers")) return jsonResponse(200, { items: dealers });
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("shows dealer availability and opens the zero-amount order flow", async () => {
    stubFetch();
    renderWithProviders(<InventoryPage />, { route: "/inventory" });

    expect(await screen.findByText("北京王府井体验中心")).toBeInTheDocument();
    const bookButton = screen.getByRole("button", { name: "0 元下定" });
    fireEvent.click(bookButton);

    // Unauthenticated users are prompted to log in before ordering.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("请先登录")).toBeInTheDocument();
  });

  it("requests availability filtered by car when the query param is set", async () => {
    const fetchMock = stubFetch();
    renderWithProviders(<InventoryPage />, { route: "/inventory?carId=1&availableOnly=true" });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/dealers\?.*carId=1.*availableOnly=true/),
        expect.anything(),
      ),
    );
  });
});
