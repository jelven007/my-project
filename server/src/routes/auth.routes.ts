import { Router, type ErrorRequestHandler, type Response } from "express";
import { ZodError } from "zod";

import {
  passwordLoginRequestSchema,
  registerRequestSchema,
  sendSmsCodeRequestSchema,
  smsLoginRequestSchema,
  wechatBindPhoneRequestSchema,
  wechatCallbackRequestSchema,
} from "@xiaomi-car/contracts";

import { HttpError } from "../middleware/error-handler.js";
import {
  AuthError,
  type UserAuthService,
} from "../services/auth/user-auth.service.js";
import {
  SmsCodeError,
  type SmsCodeService,
} from "../services/sms/sms-code.service.js";
import {
  WechatAuthError,
  type WechatAuthService,
} from "../services/wechat/wechat-auth.service.js";

const refreshCookieName = "xiaomi_user_refresh";
const refreshCookieMaxAge = 7 * 24 * 60 * 60 * 1000;

interface AuthRouterDependencies {
  authService: UserAuthService;
  smsCodes: SmsCodeService;
  secureCookies: boolean;
  wechatAuth?: WechatAuthService;
}

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/api/auth",
    maxAge: refreshCookieMaxAge,
  };
}

function sendSession(
  response: Response,
  session: Awaited<ReturnType<UserAuthService["register"]>>,
  status: number,
  secureCookies: boolean,
): void {
  response.cookie(refreshCookieName, session.refreshToken, cookieOptions(secureCookies));
  response.status(status).json({
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    user: session.user,
  });
}

export function createAuthRouter({
  authService,
  smsCodes,
  secureCookies,
  wechatAuth,
}: AuthRouterDependencies): Router {
  const router = Router();

  router.post("/sms/send", async (request, response) => {
    const input = sendSmsCodeRequestSchema.parse(request.body);
    await smsCodes.send(
      input.phone,
      input.scene,
      request.ip ?? request.socket.remoteAddress ?? "unknown",
    );
    response.status(202).json({ message: "如手机号可用，验证码将发送" });
  });

  router.post("/register", async (request, response) => {
    const session = await authService.register(registerRequestSchema.parse(request.body));
    sendSession(response, session, 201, secureCookies);
  });

  router.post("/login/password", async (request, response) => {
    const session = await authService.loginWithPassword(
      passwordLoginRequestSchema.parse(request.body),
    );
    sendSession(response, session, 200, secureCookies);
  });

  router.post("/login/sms", async (request, response) => {
    const session = await authService.loginWithSms(smsLoginRequestSchema.parse(request.body));
    sendSession(response, session, 200, secureCookies);
  });

  router.post("/refresh", async (request, response) => {
    const refreshToken = request.cookies?.[refreshCookieName] as string | undefined;
    if (!refreshToken) throw new HttpError(401, "TOKEN_INVALID", "登录状态已失效");
    const session = await authService.refresh(refreshToken);
    sendSession(response, session, 200, secureCookies);
  });

  router.post("/logout", async (request, response) => {
    const refreshToken = request.cookies?.[refreshCookieName] as string | undefined;
    await authService.logout(refreshToken);
    response.clearCookie(refreshCookieName, cookieOptions(secureCookies));
    response.status(204).send();
  });

  if (wechatAuth) {
    router.get("/wechat/start", async (request, response) => {
      const returnTo = typeof request.query.returnTo === "string" ? request.query.returnTo : "/";
      response.json(await wechatAuth.start(returnTo));
    });

    router.post("/wechat/callback", async (request, response) => {
      const input = wechatCallbackRequestSchema.parse(request.body);
      const result = await wechatAuth.callback(input.code, input.state);
      if (result.kind === "authenticated") {
        response.cookie(
          refreshCookieName,
          result.session.refreshToken,
          cookieOptions(secureCookies),
        );
        response.json({
          kind: result.kind,
          returnTo: result.returnTo,
          accessToken: result.session.accessToken,
          expiresIn: result.session.expiresIn,
          user: result.session.user,
        });
        return;
      }
      response.status(202).json(result);
    });

    router.post("/wechat/bind-phone", async (request, response) => {
      const input = wechatBindPhoneRequestSchema.parse(request.body);
      const session = await wechatAuth.bindPhone(input.bindingToken, input.phone, input.code);
      sendSession(response, session, 201, secureCookies);
    });
  }

  const authErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (error instanceof ZodError) {
      next(new HttpError(400, "VALIDATION_ERROR", "请求参数不正确", error.issues));
      return;
    }
    if (error instanceof SmsCodeError) {
      if (error.code === "SMS_RATE_LIMITED") {
        if (error.retryAfterSeconds) {
          response.setHeader("Retry-After", error.retryAfterSeconds.toString());
        }
        next(new HttpError(429, error.code, "操作过于频繁，请稍后重试"));
        return;
      }
      if (error.code === "SMS_PROVIDER_UNAVAILABLE") {
        next(new HttpError(503, error.code, "短信服务暂不可用"));
        return;
      }
      next(new HttpError(401, "SMS_CODE_INVALID", "验证码无效或已过期"));
      return;
    }
    if (error instanceof AuthError) {
      const errors = {
        ACCOUNT_EXISTS: [409, "手机号已注册"],
        ACCOUNT_LOCKED: [423, "账号已临时锁定，请稍后重试"],
        ACCOUNT_DISABLED: [403, "账号已停用"],
        INVALID_CREDENTIALS: [401, "手机号或登录凭证错误"],
        TOKEN_INVALID: [401, "登录状态已失效"],
      } as const;
      const [status, message] = errors[error.code];
      next(new HttpError(status, error.code, message));
      return;
    }
    if (error instanceof WechatAuthError) {
      const errors = {
        WECHAT_STATE_INVALID: [400, "微信登录状态无效或已过期"],
        WECHAT_PROVIDER_ERROR: [502, "微信登录服务暂不可用"],
        WECHAT_BINDING_INVALID: [401, "手机号绑定凭证无效或已过期"],
        WECHAT_PHONE_CONFLICT: [409, "该手机号已绑定其他账号"],
        WECHAT_IDENTITY_CONFLICT: [409, "该微信账号已绑定"],
      } as const;
      const [status, message] = errors[error.code];
      next(new HttpError(status, error.code, message));
      return;
    }
    next(error);
  };
  router.use(authErrorHandler);

  return router;
}
