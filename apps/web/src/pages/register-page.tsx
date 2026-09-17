import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { registerAccount, sendSmsCode, useSmsCooldown } from "../api/auth.js";
import { useAuth } from "../context/auth-context.js";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const returnTo = searchParams.get("returnTo") ?? "/";

  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const cooldown = useSmsCooldown(60);

  async function requestCode() {
    setError(undefined);
    try {
      await sendSmsCode(phone, "register");
      cooldown.start();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "验证码发送失败");
    }
  }

  async function submit() {
    setError(undefined);
    setPending(true);
    try {
      const session = await registerAccount({ phone, code, password, nickname });
      applySession(session);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "注册失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>注册小米汽车账号</h1>
        <label>
          手机号
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="numeric"
            autoComplete="username"
          />
        </label>
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
        <label>
          昵称
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={50} />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <small>至少 10 位，需包含大小写字母、数字与特殊字符。</small>
        </label>

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
          {pending ? "注册中…" : "注册并登录"}
        </button>

        <p className="auth-alt">
          已有账号？<Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>返回登录</Link>
        </p>
      </div>
    </main>
  );
}
