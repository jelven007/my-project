import { describe, expect, it, vi } from "vitest";

import { MysqlCarsRepository } from "./cars.repository.js";

describe("MysqlCarsRepository", () => {
  it("only exposes published cars in portal list and detail queries", async () => {
    const execute = vi.fn().mockResolvedValue([[], []]);
    const repository = new MysqlCarsRepository({ execute } as never);

    await repository.listPublished({});
    await repository.findPublishedBySlug("su7");

    const listSql = execute.mock.calls[0]?.[0] as string;
    const detailSql = execute.mock.calls[1]?.[0] as string;
    expect(listSql).toContain("status = 'published'");
    expect(listSql).toContain("published_at IS NOT NULL");
    expect(detailSql).toContain("status = 'published'");
    expect(detailSql).toContain("slug = ?");
  });
});
