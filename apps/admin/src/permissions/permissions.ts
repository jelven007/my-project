export interface AdminIdentity {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

/** Permission code helpers shared by navigation guards and page actions. */
export function hasPermission(admin: AdminIdentity | undefined, permission: string): boolean {
  return admin?.permissions.includes(permission) ?? false;
}

export function hasAnyPermission(
  admin: AdminIdentity | undefined,
  permissions: string[],
): boolean {
  return permissions.some((permission) => hasPermission(admin, permission));
}

export interface NavItem {
  key: string;
  label: string;
  permission: string;
}

export const navItems: NavItem[] = [
  { key: "dashboard", label: "工作台", permission: "dashboard:read" },
  { key: "content", label: "内容管理", permission: "content:read" },
  { key: "cars", label: "车型管理", permission: "cars:read" },
  { key: "inventory", label: "经销商与库存", permission: "inventory:read" },
  { key: "orders", label: "订单管理", permission: "orders:read" },
  { key: "users", label: "用户管理", permission: "users:read" },
  { key: "test-drives", label: "试驾预约", permission: "test_drive:read" },
  { key: "sms", label: "短信监控", permission: "sms:read" },
  { key: "audit", label: "审计中心", permission: "audit:read" },
];

export function visibleNavItems(admin: AdminIdentity | undefined): NavItem[] {
  return navItems.filter((item) => hasPermission(admin, item.permission));
}
