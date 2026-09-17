import { describe, expect, it } from "vitest";

import { assertOrderTransition, canTransitionOrder } from "./order-state.js";

describe("order state", () => {
  it("allows only documented transitions", () => {
    expect(canTransitionOrder("pending_confirmation", "confirmed")).toBe(true);
    expect(canTransitionOrder("pending_confirmation", "expired")).toBe(true);
    expect(canTransitionOrder("confirmed", "completed")).toBe(true);
    expect(canTransitionOrder("cancelled", "confirmed")).toBe(false);
    expect(() => assertOrderTransition("completed", "cancelled")).toThrow(
      "Invalid order transition",
    );
  });
});
