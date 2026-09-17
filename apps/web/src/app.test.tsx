import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app.js";
import { renderWithProviders } from "./test/render.js";

describe("portal navigation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not expose inventory management in the customer navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: async () => ({}),
      })),
    );

    renderWithProviders(<App />);

    expect(screen.queryByRole("link", { name: /经销商库存/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: "预约试驾" })).not.toHaveLength(0),
    );
  });
});
