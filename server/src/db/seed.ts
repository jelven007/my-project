import { hash } from "bcryptjs";

import { config } from "../config.js";
import { pool } from "./pool.js";

const cars = [
  ["su7", "SU7", "高性能生态科技轿车", 215900, 700, 5.28, 299, 210],
  ["yu7", "YU7", "豪华高性能 SUV", 253500, 835, 5.88, 320, 240],
  ["su7-ultra", "SU7 Ultra", "巅峰性能科技轿车", 529900, 630, 1.98, 1548, 350],
] as const;

const permissions = [
  "dashboard:read",
  "content:read",
  "content:update",
  "content:preview",
  "content:publish",
  "cars:read",
  "cars:create",
  "cars:update",
  "cars:publish",
  "dealers:read",
  "dealers:create",
  "dealers:update",
  "inventory:read",
  "inventory:update",
  "orders:read",
  "orders:update",
  "orders:export",
  "orders:pii",
  "sms:read",
  "media:read",
  "media:upload",
  "media:delete",
  "users:read",
  "users:update",
  "users:pii",
  "test_drive:read",
  "test_drive:update",
  "test_drive:export",
  "test_drive:pii",
  "admin:manage",
  "role:manage",
  "audit:read",
] as const;

const roles: Record<string, readonly string[]> = {
  super_admin: permissions,
  ...(config.NODE_ENV === "production" ? {} : { local_admin: permissions }),
  content_editor: ["dashboard:read", "content:read", "content:update", "content:preview"],
  content_publisher: [
    "dashboard:read",
    "content:read",
    "content:update",
    "content:preview",
    "content:publish",
  ],
  customer_service: [
    "dashboard:read",
    "users:read",
    "test_drive:read",
    "test_drive:update",
  ],
  inventory_manager: [
    "dashboard:read",
    "cars:read",
    "dealers:read",
    "dealers:create",
    "dealers:update",
    "inventory:read",
    "inventory:update",
  ],
  order_operator: ["dashboard:read", "orders:read", "orders:update"],
  auditor: ["dashboard:read", "audit:read"],
};

try {
  for (const code of permissions) {
    const separator = code.indexOf(":");
    const module = code.slice(0, separator);
    const action = code.slice(separator + 1);
    await pool.execute(
      `INSERT INTO permissions (code, name, module)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), module = VALUES(module)`,
      [code, `${module} ${action}`, module],
    );
  }
  for (const [code, rolePermissions] of Object.entries(roles)) {
    await pool.execute(
      `INSERT INTO roles (code, name, description, is_system)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
      [code, code, `System role: ${code}`],
    );
    for (const permission of rolePermissions) {
      await pool.execute(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p
         WHERE r.code = ? AND p.code = ?`,
        [code, permission],
      );
    }
  }

  if (config.NODE_ENV !== "production") {
    const passwordHash = await hash("admin", 12);
    await pool.execute(
      `INSERT INTO admin_users
       (username, email, password_hash, display_name, status, mfa_secret_encrypted)
       VALUES ('admin', 'admin@localhost.invalid', ?, '本地管理员', 'active', NULL)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         display_name = VALUES(display_name),
         status = 'active',
         mfa_secret_encrypted = NULL,
         failed_login_count = 0,
         locked_until = NULL`,
      [passwordHash],
    );
    await pool.execute(
      `INSERT IGNORE INTO admin_user_roles (admin_user_id, role_id)
       SELECT au.id, r.id
       FROM admin_users au, roles r
       WHERE au.username = 'admin' AND r.code = 'local_admin'`,
    );
  }

  for (const [slug, name, tagline, price, range, acceleration, power, speed] of cars) {
    await pool.execute(
      `INSERT INTO cars
       (slug, name, tagline, description, price_from, range_km, acceleration,
        max_power_ps, top_speed, body_type, image_url, gallery, highlights,
        status, sort_order, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '纯电', ?, JSON_ARRAY(), JSON_ARRAY(),
               'published', ?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), tagline = VALUES(tagline), price_from = VALUES(price_from),
         range_km = VALUES(range_km), acceleration = VALUES(acceleration),
         max_power_ps = VALUES(max_power_ps), top_speed = VALUES(top_speed)`,
      [
        slug,
        name,
        tagline,
        `${name} 官方车型资料`,
        price,
        range,
        acceleration,
        power,
        speed,
        `/images/cars/${slug}.webp`,
        cars.findIndex((car) => car[0] === slug) + 1,
      ],
    );
  }
  process.stdout.write(
    config.NODE_ENV === "production"
      ? "Production catalog and RBAC seeded\n"
      : "Development catalog, RBAC, and admin/admin account seeded\n",
  );
} finally {
  await pool.end();
}
