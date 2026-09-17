import { describe, expect, it } from "vitest";

import { InMemoryOrderStore, OrderService } from "./order.service.js";

const request = {
  inventoryId: "inventory-1",
  contactName: "测试车主",
  contactPhone: "13800138000",
};

function setup() {
  const store = new InMemoryOrderStore();
  store.seedInventory({
    id: "inventory-1",
    dealerId: "dealer-1",
    carId: "car-1",
    totalQuantity: 1,
    reservedQuantity: 0,
    active: true,
  });
  let sequence = 0;
  const service = new OrderService({
    store,
    now: () => new Date("2026-09-17T06:00:00.000Z"),
    generateOrderNo: () => `ORDER-${++sequence}`,
  });
  return { service, store };
}

describe("OrderService", () => {
  it("allows exactly one concurrent reservation for one available unit", async () => {
    const { service } = setup();
    const results = await Promise.allSettled([
      service.create("user-1", request, "key-1"),
      service.create("user-2", request, "key-2"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({
      reason: { code: "INVENTORY_UNAVAILABLE" },
    });
  });

  it("returns the same order for a repeated idempotency key", async () => {
    const { service } = setup();
    const first = await service.create("user-1", request, "same-key");
    const second = await service.create("user-1", request, "same-key");

    expect(second.id).toBe(first.id);
    await expect(
      service.create(
        "user-1",
        { ...request, contactName: "不同请求" },
        "same-key",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("releases inventory exactly once on cancellation and expiry", async () => {
    const { service, store } = setup();
    const order = await service.create("user-1", request, "key-1");
    await service.cancel("user-1", order.id);
    await expect(service.cancel("user-1", order.id)).rejects.toMatchObject({
      code: "ORDER_TRANSITION_INVALID",
    });
    expect(store.inventory.get("inventory-1")?.reservedQuantity).toBe(0);

    const replacement = await service.create("user-2", request, "key-2");
    replacement.reservationExpiresAt = new Date("2026-09-17T05:00:00.000Z");
    expect(await service.expireDue()).toBe(1);
    expect(await service.expireDue()).toBe(0);
    expect(store.inventory.get("inventory-1")?.reservedQuantity).toBe(0);
  });
});
