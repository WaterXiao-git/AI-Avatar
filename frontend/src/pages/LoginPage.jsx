import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowRight,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
  HiOutlineUser,
} from "react-icons/hi2";
import AuthLayout from "../components/AuthLayout";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate("/create", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      mode="login"
      formTitle="欢迎回来"
      formSubtitle="使用用户名和密码登录，继续你的数字人创作、场景配置与实时交互流程。"
      footerPrompt="还没有账号？"
      footerLinkText="立即注册"
      footerLinkTo="/register"
    >
      <form className="auth-form-grid" onSubmit={onSubmit}>
        <label className="auth-field">
          <span className="auth-field-label">用户名</span>
          <span className="auth-input-wrap">
            <HiOutlineUser />
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </span>
        </label>

        <label className="auth-field">
          <span className="auth-field-label">密码</span>
          <span className="auth-input-wrap auth-input-wrap-password">
            <HiOutlineLockClosed />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-input-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
            </button>
          </span>
        </label>

        <div className="auth-help-row">
          <span>登录后可继续角色创建、场景预览和实时互动。</span>
          <Link to="/forgot-password" className="auth-link-inline">
            忘记密码？
          </Link>
        </div>

        {error ? <div className="auth-error-box">{error}</div> : null}

        <button type="submit" className="auth-submit-btn" disabled={busy}>
          <span>{busy ? "登录中..." : "立即登录"}</span>
          <HiOutlineArrowRight />
        </button>
      </form>
    </AuthLayout>
  );
}
