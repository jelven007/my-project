import { useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import type { AdminIdentity } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";

interface LoginResult {
  kind?: "mfa_required";
  challengeToken?: string;
  accessToken?: string;
  expiresIn?: number;
  admin?: AdminIdentity;
  csrfToken?: string;
}

type Stage = "credentials" | "mfa";

export function LoginPage() {
  const { applySession } = useAdminAuth();
  const [stage, setStage] = useState<Stage>("credentials");
  const [challengeToken, setChallengeToken] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function submitCredentials(values: { login: string; password: string }) {
    setError(undefined);
    setLoading(true);
    try {
      const result = await adminApiClient.request<LoginResult>("/auth/login", {
        method: "POST",
        body: values,
      });
      if (result.kind === "mfa_required" && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        setStage("mfa");
        return;
      }
      if (result.accessToken && result.admin && result.csrfToken) {
        applySession({
          accessToken: result.accessToken,
          expiresIn: result.expiresIn ?? 0,
          admin: result.admin,
          csrfToken: result.csrfToken,
        });
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function submitMfa(values: { code: string }) {
    setError(undefined);
    setLoading(true);
    try {
      const result = await adminApiClient.request<Required<LoginResult>>("/auth/mfa/verify", {
        method: "POST",
        body: { challengeToken, code: values.code },
      });
      applySession({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        admin: result.admin,
        csrfToken: result.csrfToken,
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "验证失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <Card className="admin-login-card">
        <div className="admin-brand">
          <span>MI</span>
          <strong>汽车运营中心</strong>
        </div>
        <Typography.Title level={4}>{stage === "credentials" ? "管理员登录" : "身份验证"}</Typography.Title>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        {stage === "credentials" ? (
          <Form layout="vertical" onFinish={submitCredentials}>
            <Form.Item label="用户名或邮箱" name="login" rules={[{ required: true }]}>
              <Input autoComplete="username" size="large" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              登录
            </Button>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={submitMfa}>
            <Typography.Paragraph type="secondary">
              请输入身份验证器中的 6 位动态验证码。
            </Typography.Paragraph>
            <Form.Item
              label="动态验证码"
              name="code"
              rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}
            >
              <Input inputMode="numeric" maxLength={6} size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              验证并登录
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
