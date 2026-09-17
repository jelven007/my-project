import type { AuditRecorder } from "../audit.service.js";
import type { AdminRequestContext } from "./admin-auth.service.js";

interface AdminAuthorization {
  active: boolean;
  roles: string[];
  permissions: string[];
}

export interface AdminRbacRepository {
  getAuthorization(adminId: string): Promise<AdminAuthorization | undefined>;
  getPermissionsForRoles(roleCodes: string[]): Promise<string[]>;
  replaceRoles(adminId: string, roleCodes: string[]): Promise<void>;
  countActiveSuperAdmins(): Promise<number>;
  disableAdmin(adminId: string): Promise<void>;
  revokeAllRefreshTokens(adminId: string): Promise<void>;
}

export class InMemoryAdminRbacRepository implements AdminRbacRepository {
  readonly admins = new Map<string, AdminAuthorization>();
  readonly roles = new Map<string, string[]>();

  async getAuthorization(adminId: string): Promise<AdminAuthorization | undefined> {
    return this.admins.get(adminId);
  }

  async getPermissionsForRoles(roleCodes: string[]): Promise<string[]> {
    return [...new Set(roleCodes.flatMap((role) => this.roles.get(role) ?? []))];
  }

  async replaceRoles(adminId: string, roleCodes: string[]): Promise<void> {
    const admin = this.admins.get(adminId);
    if (!admin) return;
    admin.roles = [...roleCodes];
    admin.permissions = await this.getPermissionsForRoles(roleCodes);
  }

  async countActiveSuperAdmins(): Promise<number> {
    return [...this.admins.values()].filter(
      (admin) => admin.active && admin.roles.includes("super_admin"),
    ).length;
  }

  async disableAdmin(adminId: string): Promise<void> {
    const admin = this.admins.get(adminId);
    if (admin) admin.active = false;
  }

  async revokeAllRefreshTokens(): Promise<void> {}
}

export type AdminRbacErrorCode =
  | "ADMIN_NOT_FOUND"
  | "LAST_SUPER_ADMIN"
  | "PRIVILEGE_ESCALATION"
  | "SELF_DISABLE";

export class AdminRbacError extends Error {
  constructor(public readonly code: AdminRbacErrorCode) {
    super(code);
  }
}

export class AdminRbacService {
  constructor(
    private readonly repository: AdminRbacRepository,
    private readonly audit: AuditRecorder,
  ) {}

  async replaceRoles(
    actorId: string,
    targetId: string,
    roleCodes: string[],
    context: AdminRequestContext,
  ): Promise<void> {
    const [actor, target, requestedPermissions] = await Promise.all([
      this.repository.getAuthorization(actorId),
      this.repository.getAuthorization(targetId),
      this.repository.getPermissionsForRoles(roleCodes),
    ]);
    if (!actor?.active || !target) throw new AdminRbacError("ADMIN_NOT_FOUND");

    const actorPermissions = new Set(actor.permissions);
    if (requestedPermissions.some((permission) => !actorPermissions.has(permission))) {
      throw new AdminRbacError("PRIVILEGE_ESCALATION");
    }
    if (
      target.active &&
      target.roles.includes("super_admin") &&
      !roleCodes.includes("super_admin") &&
      (await this.repository.countActiveSuperAdmins()) <= 1
    ) {
      throw new AdminRbacError("LAST_SUPER_ADMIN");
    }

    await this.repository.replaceRoles(targetId, [...new Set(roleCodes)]);
    await this.audit.record({
      actorType: "admin",
      actorId,
      action: "admin.roles.replace",
      resourceType: "admin_user",
      resourceId: targetId,
      result: "success",
      ...context,
      metadata: { before: target.roles, after: roleCodes },
    });
  }

  async disableAdmin(
    actorId: string,
    targetId: string,
    context: AdminRequestContext,
  ): Promise<void> {
    if (actorId === targetId) throw new AdminRbacError("SELF_DISABLE");
    const target = await this.repository.getAuthorization(targetId);
    if (!target) throw new AdminRbacError("ADMIN_NOT_FOUND");
    if (
      target.active &&
      target.roles.includes("super_admin") &&
      (await this.repository.countActiveSuperAdmins()) <= 1
    ) {
      throw new AdminRbacError("LAST_SUPER_ADMIN");
    }
    await this.repository.disableAdmin(targetId);
    await this.repository.revokeAllRefreshTokens(targetId);
    await this.audit.record({
      actorType: "admin",
      actorId,
      action: "admin.disable",
      resourceType: "admin_user",
      resourceId: targetId,
      result: "success",
      ...context,
    });
  }
}
