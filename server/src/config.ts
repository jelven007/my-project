import "dotenv/config";

import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    ADMIN_ORIGIN: z.string().url().default("http://localhost:5174"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    MYSQL_HOST: z.string().default("127.0.0.1"),
    MYSQL_PORT: z.coerce.number().int().positive().default(3306),
    MYSQL_DATABASE: z.string().default("xiaomi_ev"),
    MYSQL_USER: z.string().default("xiaomi_app"),
    MYSQL_PASSWORD: z.string().min(1).default("local_only_password"),
    MYSQL_CONNECTION_LIMIT: z.coerce.number().int().positive().max(100).default(20),
    REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
    USER_ACCESS_TOKEN_SECRET: z
      .string()
      .min(32)
      .default("local-user-access-secret-change-me-0001"),
    USER_REFRESH_TOKEN_SECRET: z
      .string()
      .min(32)
      .default("local-user-refresh-secret-change-me-0002"),
    ADMIN_ACCESS_TOKEN_SECRET: z
      .string()
      .min(32)
      .default("local-admin-access-secret-change-me-001"),
    ADMIN_REFRESH_TOKEN_SECRET: z
      .string()
      .min(32)
      .default("local-admin-refresh-secret-change-me-02"),
    ADMIN_MFA_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default("local-admin-mfa-key-change-me-000003"),
    SMS_CODE_PEPPER: z
      .string()
      .min(32)
      .default("local-sms-code-pepper-change-me-00003"),
    WECHAT_STATE_SECRET: z
      .string()
      .min(32)
      .default("local-wechat-state-secret-change-me-004"),
    SMS_PROVIDER: z.enum(["mock", "volcengine"]).default("mock"),
    WECHAT_PROVIDER: z.enum(["mock", "wechat"]).default("mock"),
    VOLCENGINE_ACCESS_KEY_ID: z.string().default(""),
    VOLCENGINE_SECRET_ACCESS_KEY: z.string().default(""),
    VOLCENGINE_SMS_ACCOUNT: z.string().default(""),
    VOLCENGINE_SMS_SIGN: z.string().default(""),
    VOLCENGINE_SMS_TEMPLATE_REGISTER: z.string().default(""),
    VOLCENGINE_SMS_TEMPLATE_LOGIN: z.string().default(""),
    VOLCENGINE_SMS_TEMPLATE_BIND_PHONE: z.string().default(""),
    WECHAT_APP_ID: z.string().default(""),
    WECHAT_APP_SECRET: z.string().default(""),
    WECHAT_CALLBACK_URL: z.string().default("http://localhost:5173/auth/wechat/callback"),
    ORDER_RESERVATION_HOURS: z.coerce.number().int().positive().max(168).default(48),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.SMS_PROVIDER === "mock") {
      context.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message: "Production cannot use the mock SMS provider",
      });
    }
    if (value.NODE_ENV === "production" && value.WECHAT_PROVIDER === "mock") {
      context.addIssue({
        code: "custom",
        path: ["WECHAT_PROVIDER"],
        message: "Production cannot use the mock WeChat provider",
      });
    }
    if (value.NODE_ENV === "production") {
      for (const key of [
        "USER_ACCESS_TOKEN_SECRET",
        "USER_REFRESH_TOKEN_SECRET",
        "ADMIN_ACCESS_TOKEN_SECRET",
        "ADMIN_REFRESH_TOKEN_SECRET",
        "ADMIN_MFA_ENCRYPTION_KEY",
        "SMS_CODE_PEPPER",
        "WECHAT_STATE_SECRET",
      ] as const) {
        if (value[key].startsWith("local-") || value[key].startsWith("replace_")) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} must be replaced in production`,
          });
        }
      }
    }
    if (value.SMS_PROVIDER === "volcengine") {
      for (const key of [
        "VOLCENGINE_ACCESS_KEY_ID",
        "VOLCENGINE_SECRET_ACCESS_KEY",
        "VOLCENGINE_SMS_ACCOUNT",
        "VOLCENGINE_SMS_SIGN",
        "VOLCENGINE_SMS_TEMPLATE_REGISTER",
        "VOLCENGINE_SMS_TEMPLATE_LOGIN",
        "VOLCENGINE_SMS_TEMPLATE_BIND_PHONE",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required for the Volcengine SMS provider`,
          });
        }
      }
    }
    if (value.WECHAT_PROVIDER === "wechat") {
      for (const key of ["WECHAT_APP_ID", "WECHAT_APP_SECRET"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required for the WeChat provider`,
          });
        }
      }
    }
  });

export const config = configSchema.parse(process.env);
