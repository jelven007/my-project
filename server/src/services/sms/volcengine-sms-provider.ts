import { randomUUID } from "node:crypto";

import { sms } from "@volcengine/openapi";

import type { SmsScene } from "@xiaomi-car/contracts";

import type { SmsMessage, SmsProvider, SmsSendResult } from "./sms-provider.js";

interface VolcengineSmsProviderOptions {
  accessKeyId: string;
  secretAccessKey: string;
  smsAccount: string;
  sign: string;
  templateIds: Record<SmsScene, string>;
  timeoutMs?: number;
}

export class VolcengineSmsProvider implements SmsProvider {
  readonly name = "volcengine";
  private readonly service: sms.SmsService;
  private readonly timeoutMs: number;

  constructor(private readonly options: VolcengineSmsProviderOptions) {
    this.service = new sms.SmsService({
      accessKeyId: options.accessKeyId,
      secretKey: options.secretAccessKey,
      host: "sms.volcengineapi.com",
      protocol: "https",
      region: "cn-north-1",
      serviceName: "volcSMS",
    });
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    try {
      const response = await this.service.Send(
        {
          SmsAccount: this.options.smsAccount,
          Sign: this.options.sign,
          TemplateID: this.options.templateIds[message.scene],
          TemplateParam: JSON.stringify({ code: message.code }),
          PhoneNumbers: message.phone,
          Tag: message.scene,
          UserExtCode: "",
        },
        {
          Action: "SendSms",
          Version: "2020-01-01",
          timeout: this.timeoutMs,
        },
      );
      const normalized = response as unknown as {
        ResponseMetadata: {
          RequestId: string;
          Error?: { Code?: string };
        };
        Result?: { MessageID?: string[] };
      };
      const error = normalized.ResponseMetadata.Error;
      return {
        accepted: error === undefined,
        requestId: normalized.ResponseMetadata.RequestId,
        ...(normalized.Result?.MessageID?.[0] === undefined
          ? {}
          : { messageId: normalized.Result.MessageID[0] }),
        ...(error?.Code === undefined ? {} : { errorCode: error.Code }),
      };
    } catch {
      return {
        accepted: false,
        requestId: randomUUID(),
        errorCode: "VOLCENGINE_REQUEST_FAILED",
      };
    }
  }
}
