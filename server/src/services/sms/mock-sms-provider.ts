import { randomUUID } from "node:crypto";

import type { SmsMessage, SmsProvider, SmsSendResult } from "./sms-provider.js";

export class MockSmsProvider implements SmsProvider {
  readonly name = "mock";
  lastMessage?: SmsMessage;

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.lastMessage = message;
    return {
      accepted: true,
      requestId: randomUUID(),
      messageId: `mock-${randomUUID()}`,
    };
  }
}
