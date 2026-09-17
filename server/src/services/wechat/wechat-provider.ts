export interface WechatProfile {
  providerUserId: string;
  unionId?: string;
  nickname: string;
  avatarUrl?: string;
}

export interface WechatProvider {
  readonly name: "wechat" | "mock";
  createAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<WechatProfile>;
}
