import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { loginWithPassword, loginWithSms, sendSmsCode, useSmsCooldown } from "../api/auth.js";
import { useAuth } from "../context/auth-context.js";

type Tab = "password" | "sms";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const returnTo = searchParams.get("returnTo") ?? "/";

  const [tab, setTab] = useState<Tab>("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const cooldown = useSmsCooldown(60);

  async function requestCode() {
    setError(undefined);
    try {
      await sendSmsCode(phone, "login");
      cooldown.start();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "验证码发送失败");
    }
  }

  async function submit() {
    setError(undefined);
    setPending(true);
    try {
      const session =
        tab === "password"
          ? await loginWithPassword({ phone, password })
          : await loginWithSms({ phone, code });
      applySession(session);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "登录失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>登录小米汽车</h1>
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "password"}
            className={tab === "password" ? "active" : ""}
            onClick={() => setTab("password")}
          >
            密码登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sms"}
            className={tab === "sms" ? "active" : ""}
            onClick={() => setTab("sms")}
          >
            验证码登录
          </button>
        </div>

        <label>
          手机号
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="numeric"
            autoComplete="username"
          />
        </label>

        {tab === "password" ? (
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
        ) : (
          <label>
            验证码
            <span className="code-row">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                maxLength={6}
              />
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={cooldown.active || phone === ""}
              >
                {cooldown.active ? `${cooldown.remaining}s 后重试` : "获取验证码"}
              </button>
            </span>
          </label>
        )}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="primary-action block"
          onClick={() => void submit()}
          disabled={pending}
        >
          {pending ? "登录中…" : "登录"}
        </button>

        <p className="auth-alt">
          还没有账号？<Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>立即注册</Link>
        </p>
      </div>
    </main>
  );
}
