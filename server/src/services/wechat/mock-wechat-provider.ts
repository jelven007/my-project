import type { WechatProfile, WechatProvider } from "./wechat-provider.js";

export class MockWechatProvider implements WechatProvider {
  readonly name = "mock";
  private readonly profiles = new Map<string, WechatProfile>();

  registerCode(code: string, profile: WechatProfile): void {
    this.profiles.set(code, profile);
  }

  createAuthorizationUrl(state: string): string {
    return `https://mock.wechat.local/authorize?state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string): Promise<WechatProfile> {
    const profile = this.profiles.get(code);
    if (!profile) throw new Error("WECHAT_PROVIDER_ERROR");
    this.profiles.delete(code);
    return profile;
  }
}
