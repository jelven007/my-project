import { describe, expect, it } from "vitest";

import {
  hasAnyPermission,
  hasPermission,
  visibleNavItems,
  type AdminIdentity,
} from "./permissions.js";

const editor: AdminIdentity = {
  id: "1",
  username: "editor",
  displayName: "内容编辑",
  roles: ["content_editor"],
  permissions: ["dashboard:read", "content:read", "content:update"],
};

describe("permission helpers", () => {
  it("checks single and combined permissions", () => {
    expect(hasPermission(editor, "content:update")).toBe(true);
    expect(hasPermission(editor, "content:publish")).toBe(false);
    expect(hasAnyPermission(editor, ["content:publish", "content:read"])).toBe(true);
    expect(hasAnyPermission(undefined, ["content:read"])).toBe(false);
  });

  it("only exposes navigation the admin may access", () => {
    const items = visibleNavItems(editor).map((item) => item.key);
    expect(items).toContain("dashboard");
    expect(items).toContain("content");
    expect(items).not.toContain("audit");
    expect(items).not.toContain("orders");
  });

  it("uses the concise dealer inventory navigation label", () => {
    const inventoryManager: AdminIdentity = {
      ...editor,
      permissions: ["inventory:read"],
    };
    expect(visibleNavItems(inventoryManager)).toEqual([
      expect.objectContaining({ key: "inventory", label: "经销商库存" }),
    ]);
  });
});
