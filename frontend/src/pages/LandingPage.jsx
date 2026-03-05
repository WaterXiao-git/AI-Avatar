import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="intro-page">
      <nav className="intro-topbar">
        <div className="intro-brand-wrap">
          <p className="intro-tag">Interactive Avatar</p>
          <h1>交互式虚拟人</h1>
        </div>
        <div className="intro-topbar-actions">
          {user ? (
            <>
              <Link to="/create" className="intro-chip active">
                开始创建
              </Link>
              <Link to="/dashboard" className="intro-chip">
                个人中心
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="intro-chip">
                登录
              </Link>
              <Link to="/register" className="intro-chip active">
                注册体验
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="intro-hero-panel">
        <div className="intro-grid-overlay" />
        <div className="intro-glow intro-glow-a" />
        <div className="intro-glow intro-glow-b" />

        <div className="intro-hero-main">
          <p className="intro-kicker">AI-Powered Virtual Human</p>
          <h2>创建你的专属虚拟人，开启智能对话</h2>
          <p className="intro-lead">
            从文字描述到实时语音交互，只需几步即可拥有属于你的 3D 虚拟助手。
            支持手势识别、自然对话、动作表现，让虚拟人真正"活"起来。
          </p>

          <div className="intro-stack-grid">
            <span>🎨 文字/图片生成</span>
            <span>🦴 智能骨骼绑定</span>
            <span>🎙️ 实时语音交互</span>
            <span>👋 手势识别启动</span>
            <span>💃 动作自动切换</span>
            <span>📊 历史记录管理</span>
          </div>

          <div className="intro-cta-row">
            {user ? (
              <Link to="/create" className="intro-primary-btn">
                立即开始创建
              </Link>
            ) : (
              <Link to="/register" className="intro-primary-btn">
                免费注册体验
              </Link>
            )}
            <a href="#features" className="intro-secondary-btn">
              了解更多功能
            </a>
          </div>
        </div>

        <div className="intro-hero-side">
          <div className="intro-side-head">
            <span className="intro-live-dot" />
            实时数据
          </div>
          <div className="intro-metric accent">
            <small>创建方式</small>
            <strong>3 种</strong>
            <em>文字 · 图片 · 预设</em>
          </div>
          <div className="intro-metric">
            <small>平均生成时间</small>
            <strong>30 秒</strong>
            <em>快速生成 3D 模型</em>
          </div>
          <div className="intro-metric">
            <small>支持动作类型</small>
            <strong>10+ 种</strong>
            <em>待机 · 倾听 · 说话 · 挥手</em>
          </div>
        </div>
      </section>

      <section className="intro-trust-strip">
        <span>🤖 AI 驱动</span>
        <span>🎯 精准识别</span>
        <span>⚡ 实时响应</span>
        <span>🔒 数据安全</span>
        <span>📱 跨平台</span>
        <span>🎨 自定义</span>
      </section>

      <section className="intro-pillars" id="features">
        <div className="intro-pillar-card">
          <p className="intro-pillar-stat">Step 01</p>
          <h3>🎨 灵活创建</h3>
          <p>
            支持文字描述、图片上传、预设形象三种方式。
            输入"穿西装的商务女性"或上传一张照片，AI 会自动生成高质量 3D 模型。
            内置精选预设，点击即用。
          </p>
        </div>

        <div className="intro-pillar-card">
          <p className="intro-pillar-stat">Step 02</p>
          <h3>🦴 智能绑骨</h3>
          <p>
            通过可视化点位标注，在模型上标记关键部位（下巴、手腕、膝盖等）。
            系统自动完成骨骼绑定和蒙皮处理，让虚拟人能够自然地做出各种动作。
          </p>
        </div>

        <div className="intro-pillar-card">
          <p className="intro-pillar-stat">Step 03</p>
          <h3>🎙️ 语音交互</h3>
          <p>
            挥手启动对话，与虚拟人进行实时语音交流。
            支持智能打断、自动检测用户状态、动作与语音同步。
            所有对话自动保存，随时回顾。
          </p>
        </div>
      </section>

      <section className="intro-flow-block">
        <h3>完整使用流程</h3>
        <div className="intro-flow-grid">
          <div className="intro-flow-card">
            <span className="intro-flow-index">1</span>
            <strong>创建形象</strong>
            <p>选择文字、图片或预设方式，生成你的专属虚拟人</p>
          </div>
          <div className="intro-flow-card">
            <span className="intro-flow-index">2</span>
            <strong>辅助绑骨</strong>
            <p>标记关键点位，系统自动完成骨骼绑定</p>
          </div>
          <div className="intro-flow-card">
            <span className="intro-flow-index">3</span>
            <strong>语音交互</strong>
            <p>挥手启动，开始与虚拟人实时对话</p>
          </div>
        </div>
      </section>

      <section className="intro-bottom-cta">
        <div>
          <p>Ready to Start?</p>
          <h3>立即创建你的虚拟人</h3>
        </div>
        {user ? (
          <Link to="/create" className="intro-primary-btn">
            开始创建
          </Link>
        ) : (
          <Link to="/register" className="intro-primary-btn">
            免费注册
          </Link>
        )}
      </section>
    </div>
  );
}
