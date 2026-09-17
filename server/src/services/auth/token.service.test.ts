import { describe, expect, it } from "vitest";

import {
  InMemoryRefreshTokenRepository,
  TokenService,
} from "./token.service.js";

const user = { id: "42", phone: "13800138000", nickname: "车主" };

function createService(
  repository = new InMemoryRefreshTokenRepository(),
  accessSecret = "test-access-secret-with-at-least-32-characters",
) {
  return {
    repository,
    service: new TokenService({
      accessSecret,
      refreshSecret: "test-refresh-secret-with-at-least-32-characters",
      repository,
      now: () => new Date("2026-09-17T06:00:00.000Z"),
    }),
  };
}

describe("TokenService", () => {
  it("persists only a hash of refresh tokens", async () => {
    const { repository, service } = createService();

    const session = await service.issue(user);

    expect(repository.records[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(repository.records)).not.toContain(session.refreshToken);
    await expect(service.verifyAccess(session.accessToken)).resolves.toEqual(user);
  });

  it("rejects access tokens signed with another secret", async () => {
    const { service } = createService();
    const session = await service.issue(user);
    const other = createService(
      new InMemoryRefreshTokenRepository(),
      "another-access-secret-with-at-least-32-chars",
    ).service;

    await expect(other.verifyAccess(session.accessToken)).rejects.toMatchObject({
      message: "TOKEN_INVALID",
    });
  });
});
