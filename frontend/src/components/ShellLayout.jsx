import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MARKER_ORDER, useFlow } from "../context/FlowContext";

const steps = [
  { path: "/create", title: "形象生成" },
  { path: "/rig-preview", title: "辅助绑定" },
  { path: "/scene-preview", title: "场景预览" },
  { path: "/interact", title: "交互会话" },
];

export default function ShellLayout({ title, subtitle, children, backTo = "", backLabel = "返回上一步" }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { modelResult, markers, sceneBackgroundUrl } = useFlow();

  const modelReady = Boolean(modelResult?.output_model_url);
  const markersReady = MARKER_ORDER.every((key) => Array.isArray(markers?.[key]));
  const sceneReady = Boolean(sceneBackgroundUrl);

  function accessState(path) {
    if (path === "/create") return { allowed: true, reason: "" };
    if (path === "/rig-preview") {
      return {
        allowed: modelReady,
        reason: modelReady ? "" : "请先在形象生成页完成模型创建",
      };
    }
    if (path === "/scene-preview") {
      if (!modelReady) return { allowed: false, reason: "请先在形象生成页完成模型创建" };
      if (!markersReady) return { allowed: false, reason: "请先在辅助绑定页完成 8 个点位绑定" };
      return { allowed: true, reason: "" };
    }
    if (path === "/interact") {
      if (!modelReady) return { allowed: false, reason: "请先在形象生成页完成模型创建" };
      if (!markersReady) return { allowed: false, reason: "请先在辅助绑定页完成 8 个点位绑定" };
      if (!sceneReady) return { allowed: false, reason: "请先在场景预览页选择并确认场景背景" };
      return { allowed: true, reason: "" };
    }
    return { allowed: true, reason: "" };
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-tag">互动数字人</p>
          <h1>{title}</h1>
          <p className="app-subtitle">{subtitle}</p>
        </div>
        <nav className="step-nav" aria-label="流程步骤">
          {backTo ? (
            <Link to={backTo} className="step-link">
              {backLabel}
            </Link>
          ) : null}
          <Link to="/dashboard" className={location.pathname === "/dashboard" ? "step-link active" : "step-link"}>
            数据看板
          </Link>
          {steps.map((step) => {
            const active = location.pathname === step.path;
            const { allowed, reason } = accessState(step.path);
            if (!allowed && !active) {
              return (
                <span key={step.path} className="step-link-lock-wrap">
                  <span className="step-link step-link-locked" aria-disabled="true">
                    {step.title}
                  </span>
                  <span className="step-lock-tip" role="tooltip">
                    {reason || "请按流程先完成上一步"}
                  </span>
                </span>
              );
            }
            return (
              <Link key={step.path} to={step.path} className={active ? "step-link active" : "step-link"}>
                {step.title}
              </Link>
            );
          })}
          {user ? <span className="step-link">@{user.username}</span> : null}
          {user ? (
            <button type="button" className="step-link" onClick={logout}>
              退出
            </button>
          ) : null}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
