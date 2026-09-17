import { describe, expect, it } from "vitest";

import { InMemoryAuditRecorder } from "../audit.service.js";
import {
  AdminRbacError,
  AdminRbacService,
  InMemoryAdminRbacRepository,
} from "./admin-rbac.service.js";

describe("AdminRbacService", () => {
  it("prevents an administrator from granting permissions they do not hold", async () => {
    const repository = new InMemoryAdminRbacRepository();
    repository.admins.set("1", {
      active: true,
      roles: ["admin_manager"],
      permissions: ["admin:manage"],
    });
    repository.admins.set("2", { active: true, roles: [], permissions: [] });
    repository.roles.set("super_admin", ["admin:manage", "role:manage"]);
    const service = new AdminRbacService(repository, new InMemoryAuditRecorder());

    await expect(
      service.replaceRoles("1", "2", ["super_admin"], {}),
    ).rejects.toEqual(new AdminRbacError("PRIVILEGE_ESCALATION"));
  });

  it("does not remove the final active super administrator", async () => {
    const repository = new InMemoryAdminRbacRepository();
    repository.admins.set("1", {
      active: true,
      roles: ["super_admin"],
      permissions: ["admin:manage", "role:manage"],
    });
    repository.roles.set("super_admin", ["admin:manage", "role:manage"]);
    const service = new AdminRbacService(repository, new InMemoryAuditRecorder());

    await expect(service.replaceRoles("1", "1", [], {})).rejects.toEqual(
      new AdminRbacError("LAST_SUPER_ADMIN"),
    );
    await expect(service.disableAdmin("1", "1", {})).rejects.toEqual(
      new AdminRbacError("SELF_DISABLE"),
    );
  });
});
