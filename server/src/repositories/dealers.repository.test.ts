import { describe, expect, it, vi } from "vitest";

import { MysqlDealersRepository } from "./dealers.repository.js";

describe("MysqlDealersRepository", () => {
  it("matches dealers through active inventory and published cars", async () => {
    const execute = vi.fn().mockResolvedValue([[], []]);
    const repository = new MysqlDealersRepository({ execute } as never);

    await repository.listActive({ carId: "7" });

    const [sql, values] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("d.status = 'active'");
    expect(sql).toContain("i.status = 'active'");
    expect(sql).toContain("c.status = 'published'");
    expect(sql).toContain("c.id = ?");
    expect(values).toEqual(["7"]);
  });
});
