import { useCallback, useEffect, useState } from "react";

import { apiClient } from "./client.js";
import type { SmsScene } from "@xiaomi-car/contracts";

interface AuthSessionResponse {
  accessToken: string;
  expiresIn: number;
  user: { id: string; nickname: string; phone: string };
}

export async function sendSmsCode(phone: string, scene: SmsScene): Promise<void> {
  await apiClient.request("/api/auth/sms/send", {
    method: "POST",
    body: { phone, scene },
  });
}

export function registerAccount(input: {
  phone: string;
  code: string;
  password: string;
  nickname: string;
}): Promise<AuthSessionResponse> {
  return apiClient.request<AuthSessionResponse>("/api/auth/register", {
    method: "POST",
    body: input,
  });
}

export function loginWithPassword(input: {
  phone: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiClient.request<AuthSessionResponse>("/api/auth/login/password", {
    method: "POST",
    body: input,
  });
}

export function loginWithSms(input: { phone: string; code: string }): Promise<AuthSessionResponse> {
  return apiClient.request<AuthSessionResponse>("/api/auth/login/sms", {
    method: "POST",
    body: input,
  });
}

/**
 * Countdown that blocks repeated SMS requests. Mirrors the server-side per-scene
 * cooldown so the UI never invites a request that the API would reject.
 */
export function useSmsCooldown(seconds = 60) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);
  return { remaining, active: remaining > 0, start };
}
