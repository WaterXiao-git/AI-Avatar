import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const STYLE_PRESETS = {
  supabase: {
    id: "supabase",
    label: "Supabase 风",
    motto: "Structured Product Story",
    subtitle: "强调产品价值与结构化能力展示，适合技术型 SaaS 首页。",
    summary:
      "从统一创建入口开始，把角色生成、动作准备、实时交互和结果沉淀串成完整工作流，保证展示与落地一致。",
    runtime: ["Edge Runtime", "Realtime Voice", "Session Memory"],
  },
  shadcn: {
    id: "shadcn",
    label: "shadcn 极简风",
    motto: "Minimal, Crisp, Intentional",
    subtitle: "更克制的排版和留白，突出清晰层级与界面精度。",
    summary:
      "将信息密度压到合理范围，先讲清定位，再展示关键能力模块，最后只保留最有行动力的两个入口。",
    runtime: ["Typed UI States", "Clean Motion", "Composable Blocks"],
  },
  posthog: {
    id: "posthog",
    label: "PostHog 信息密度风",
    motto: "Narrative + Dense Product Surface",
    subtitle: "信息丰富但有序，适合功能较多、需要讲清系统能力的平台。",
    summary:
      "通过运行态面板、分层功能卡和流程视图，在首屏之外持续回答“它如何工作”和“结果如何沉淀”。",
    runtime: ["Event Timeline", "Conversation Metrics", "Recording Artifacts"],
  },
};

const STACK = ["Meshy", "Qwen Realtime", "MediaPipe", "Three.js", "FastAPI", "SQLite"];

const HIGHLIGHTS = [
  { title: "角色生成", desc: "文本、图片、预设三入口统一进入创建链路。" },
  { title: "动作准备", desc: "辅助点位、动作预览与状态切换，提高展示稳定性。" },
  { title: "实时交互", desc: "挥手触发、流式语音、说话打断与自动结束联动。" },
  { title: "结果沉淀", desc: "会话摘要、历史记录与录屏自动回流到看板。" },
];

const FLOW = [
  { id: "01", title: "Create", detail: "输入文本、图片或预设，生成数字人形象。", note: "CreatePage" },
  { id: "02", title: "Rig", detail: "完成关键点辅助绑定，并确认动作可用性。", note: "RigAssistPage" },
  { id: "03", title: "Stage", detail: "挑选或生成场景，确认展示背景与镜头。", note: "ScenePreviewPage" },
  { id: "04", title: "Talk", detail: "进入实时语音会话，自动录制并沉淀结果。", note: "InteractPage" },
];

const METRICS = [
  { value: "3", label: "创建入口" },
  { value: "4", label: "体验阶段" },
  { value: "Voice + Gesture", label: "交互模式" },
  { value: "Summary + Video", label: "输出结果" },
];

export default function IntroPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [styleId, setStyleId] = useState("supabase");

  const style = STYLE_PRESETS[styleId];

  const primaryLabel = useMemo(() => {
    if (loading) return "加载中...";
    return user ? "进入创作流程" : "注册并开始体验";
  }, [loading, user]);

  function handlePrimary() {
    if (loading) return;
    navigate(user ? "/create" : "/register");
  }

  return (
    <div className={`elite-page theme-${style.id}`}>
      <div className="elite-shell">
        <header className="elite-topbar elite-rise r1">
          <div className="elite-brand">
            <span className="elite-brand-mark">IA</span>
            <div>
              <p className="elite-eyebrow">Interactive Avatar</p>
              <h1>交互式虚拟人平台</h1>
            </div>
          </div>

          <nav className="elite-nav" aria-label="首页导航">
            <a href="#landing-architecture" className="elite-link-btn">
              产品架构
            </a>
            <a href="#landing-flow" className="elite-link-btn">
              工作流
            </a>
            {user ? (
              <>
                <Link to="/dashboard" className="elite-link-btn">
                  数据看板
                </Link>
                <Link to="/create" className="elite-link-btn elite-link-btn-primary">
                  开始创建
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="elite-link-btn">
                  登录
                </Link>
                <Link to="/register" className="elite-link-btn elite-link-btn-primary">
                  注册体验
                </Link>
              </>
            )}
          </nav>
        </header>

        <section className="elite-style-panel elite-rise r2" aria-label="风格切换">
          <div>
            <p className="elite-panel-label">Design Direction</p>
            <h2>三套主页面设计方向，直接切换预览</h2>
          </div>
          <div className="elite-style-switch">
            {Object.values(STYLE_PRESETS).map((item) => (
              <button
                key={item.id}
                type="button"
                className={styleId === item.id ? "elite-style-chip active" : "elite-style-chip"}
                onClick={() => setStyleId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="elite-hero elite-rise r3">
          <div className="elite-hero-copy">
            <p className="elite-panel-label">{style.motto}</p>
            <h3>
              重新组织首页叙事顺序
              <span>先讲价值，再讲系统，再讲入口</span>
            </h3>
            <p className="elite-lead">{style.subtitle}</p>
            <p className="elite-lead">{style.summary}</p>

            <div className="elite-cta-row">
              <button type="button" className="elite-main-btn" onClick={handlePrimary} disabled={loading}>
                {primaryLabel}
              </button>
              {user ? (
                <Link to="/dashboard" className="elite-secondary-btn">
                  查看看板结果
                </Link>
              ) : (
                <Link to="/login" className="elite-secondary-btn">
                  已有账号，去登录
                </Link>
              )}
            </div>

            <div className="elite-stack-row">
              {STACK.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <aside className="elite-hero-panel" aria-label="运行态概览">
            <div className="elite-terminal-head">
              <span className="elite-dot" />
              <span className="elite-dot" />
              <span className="elite-dot" />
              <p>runtime://interactive-avatar</p>
            </div>

            <div className="elite-terminal">
              <code>prompt.create() -&gt; rig.preview() -&gt; scene.stage() -&gt; voice.stream()</code>
            </div>

            <div className="elite-runtime-tags">
              {style.runtime.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <div className="elite-metric-grid">
              {METRICS.map((item) => (
                <article key={item.label} className="elite-metric-card">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="elite-architecture elite-rise r4" id="landing-architecture">
          <div className="elite-section-head">
            <p>Architecture</p>
            <h3>模块化展示平台能力，避免页面信息失焦</h3>
          </div>

          <div className="elite-architecture-grid">
            <article className="elite-story-card">
              <p className="elite-panel-label">Product Story</p>
              <h4>结构化叙事替代“堆模块”，让页面节奏更高级</h4>
              <p>
                这套版式借鉴优秀开源项目首页常见结构：价值主张、运行方式、核心模块、执行入口，
                每一段只做一件事，信息密度高但不混乱。
              </p>
            </article>

            <div className="elite-feature-grid">
              {HIGHLIGHTS.map((item) => (
                <article key={item.title} className="elite-feature-card">
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="elite-flow elite-rise r5" id="landing-flow">
          <div className="elite-section-head compact">
            <p>Workflow</p>
            <h3>四步闭环，从创建到实时交互再到结果沉淀</h3>
          </div>

          <div className="elite-flow-grid">
            {FLOW.map((item) => (
              <article key={item.id} className="elite-flow-card">
                <span className="elite-flow-index">{item.id}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <em>{item.note}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="elite-bottom-cta elite-rise r6">
          <div>
            <p className="elite-panel-label">DEMO READY LANDING</p>
            <h3>选定风格后我可以继续把它扩展到 Create / Rig / Scene / Interact 全链路</h3>
          </div>
          <button type="button" className="elite-main-btn" onClick={handlePrimary} disabled={loading}>
            {primaryLabel}
          </button>
        </section>
      </div>
    </div>
  );
}
