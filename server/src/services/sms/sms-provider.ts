import type { SmsScene } from "@xiaomi-car/contracts";

export interface SmsMessage {
  phone: string;
  code: string;
  scene: SmsScene;
}

export interface SmsSendResult {
  accepted: boolean;
  requestId: string;
  messageId?: string;
  errorCode?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}
