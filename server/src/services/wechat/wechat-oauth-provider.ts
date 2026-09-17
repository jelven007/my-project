import type { WechatProfile, WechatProvider } from "./wechat-provider.js";

interface WechatOauthProviderOptions {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  timeoutMs?: number;
}

interface TokenResponse {
  access_token?: string;
  openid?: string;
  unionid?: string;
  errcode?: number;
}

interface UserInfoResponse {
  openid?: string;
  unionid?: string;
  nickname?: string;
  headimgurl?: string;
  errcode?: number;
}

export class WechatOauthProvider implements WechatProvider {
  readonly name = "wechat";
  private readonly timeoutMs: number;

  constructor(private readonly options: WechatOauthProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  createAuthorizationUrl(state: string): string {
    const query = new URLSearchParams({
      appid: this.options.appId,
      redirect_uri: this.options.callbackUrl,
      response_type: "code",
      scope: "snsapi_login",
      state,
    });
    return `https://open.weixin.qq.com/connect/qrconnect?${query.toString()}#wechat_redirect`;
  }

  async exchangeCode(code: string): Promise<WechatProfile> {
    const tokenQuery = new URLSearchParams({
      appid: this.options.appId,
      secret: this.options.appSecret,
      code,
      grant_type: "authorization_code",
    });
    const token = await this.getJson<TokenResponse>(
      `https://api.weixin.qq.com/sns/oauth2/access_token?${tokenQuery.toString()}`,
    );
    if (token.errcode || !token.access_token || !token.openid) {
      throw new Error("WECHAT_TOKEN_EXCHANGE_FAILED");
    }

    const profileQuery = new URLSearchParams({
      access_token: token.access_token,
      openid: token.openid,
      lang: "zh_CN",
    });
    const profile = await this.getJson<UserInfoResponse>(
      `https://api.weixin.qq.com/sns/userinfo?${profileQuery.toString()}`,
    );
    if (profile.errcode || !profile.openid || !profile.nickname) {
      throw new Error("WECHAT_PROFILE_FAILED");
    }
    return {
      providerUserId: profile.openid,
      nickname: profile.nickname,
      ...(profile.unionid ?? token.unionid
        ? { unionId: profile.unionid ?? token.unionid }
        : {}),
      ...(profile.headimgurl ? { avatarUrl: profile.headimgurl } : {}),
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("WECHAT_HTTP_ERROR");
    return (await response.json()) as T;
  }
}
