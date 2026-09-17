import { z } from "zod";

const mainlandMobilePattern = /^1[3-9]\d{9}$/;

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^\+86/, ""))
  .pipe(z.string().regex(mainlandMobilePattern, "请输入有效的中国大陆手机号"));

export const passwordSchema = z
  .string()
  .min(10, "密码至少需要 10 个字符")
  .max(72, "密码不能超过 72 个字符")
  .refine((value) => {
    return [
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ].every(Boolean);
  }, "密码必须同时包含大小写字母、数字和特殊字符");

export const smsSceneSchema = z.enum(["register", "login", "bind_phone"]);

export type SmsScene = z.infer<typeof smsSceneSchema>;

export const sendSmsCodeRequestSchema = z.object({
  phone: phoneSchema,
  scene: smsSceneSchema,
});

export const registerRequestSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, "请输入 6 位短信验证码"),
  password: passwordSchema,
  nickname: z.string().trim().min(1).max(50),
});

export const passwordLoginRequestSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(72),
});

export const smsLoginRequestSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, "请输入 6 位短信验证码"),
});

export const authUserSchema = z.object({
  id: z.string().min(1),
  phone: phoneSchema,
  nickname: z.string().min(1),
});

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
});

export const wechatCallbackRequestSchema = z.object({
  code: z.string().min(1).max(500),
  state: z.string().min(1).max(2000),
});

export const wechatBindPhoneRequestSchema = z.object({
  bindingToken: z.string().min(1),
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
});

export type SendSmsCodeRequest = z.infer<typeof sendSmsCodeRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type PasswordLoginRequest = z.infer<typeof passwordLoginRequestSchema>;
export type SmsLoginRequest = z.infer<typeof smsLoginRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type WechatCallbackRequest = z.infer<typeof wechatCallbackRequestSchema>;
export type WechatBindPhoneRequest = z.infer<typeof wechatBindPhoneRequestSchema>;
