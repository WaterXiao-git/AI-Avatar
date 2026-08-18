<script setup>
// Admin 后台（第一版不引入 Vue Router，按路径 /admin 分发）
// P1-1：管理端鉴权 —— 首次进入需输入后端 ADMIN_TOKEN，校验通过后存 sessionStorage，
// 所有管理请求自动携带 Authorization: Bearer <token>；无 token 一律隐藏业务面板。
import { ref } from 'vue'
import { hasAdminToken, setAdminToken, verifyToken } from '../api/admin'
import OverviewPanel from './OverviewPanel.vue'
import KnowledgePanel from './KnowledgePanel.vue'
import AnalyticsPanel from './AnalyticsPanel.vue'
import AvatarConfigPanel from './AvatarConfigPanel.vue'

const tabs = [
  { id: 'overview', label: '概览', icon: '📊' },
  { id: 'knowledge', label: '知识库', icon: '📚' },
  { id: 'analytics', label: '游客分析', icon: '🧑‍🤝‍🧑' },
  { id: 'avatar', label: '数字人配置', icon: '🤖' },
]
const active = ref('overview')
// 数据看板：默认排除演示数据（?demo=1 产生的记录）；勾选后用于排查演示流程
const includeDemo = ref(false)

// ---- P1-1 登录门禁 ----
const authed = ref(hasAdminToken())
const tokenInput = ref('')
const loginErr = ref('')
const logging = ref(false)

async function doLogin() {
  const t = (tokenInput.value || '').trim()
  if (!t) { loginErr.value = '请输入管理员 Token'; return }
  logging.value = true
  loginErr.value = ''
  try {
    const ok = await verifyToken(t)
    if (!ok) { loginErr.value = 'Token 无效或未授权，请检查后端 .env 的 ADMIN_TOKEN'; return }
    setAdminToken(t)
    authed.value = true
  } catch (e) {
    loginErr.value = '无法连接后台服务：' + e.message
  } finally {
    logging.value = false
  }
}

function doLogout() {
  setAdminToken(null)
  authed.value = false
  tokenInput.value = ''
  loginErr.value = ''
  active.value = 'overview'
}
</script>

<template>
  <div v-if="!authed" class="admin-shell">
    <div class="login-card">
      <h2>🔐 灵山导览 · 运营后台</h2>
      <p class="login-tip">请输入管理 Token（对应后端 <code>.env</code> 的 <code>ADMIN_TOKEN</code>），验证后进入。</p>
      <input
        v-model="tokenInput"
        class="login-input"
        type="password"
        placeholder="Admin Token"
        @keyup.enter="doLogin"
      />
      <button class="login-btn" :disabled="logging" @click="doLogin">
        {{ logging ? '验证中…' : '进入后台' }}
      </button>
      <p v-if="loginErr" class="login-err">{{ loginErr }}</p>
      <a class="admin-back" href="/">← 返回前台</a>
    </div>
  </div>

  <div v-else class="admin-shell">
    <header class="admin-head">
      <span class="admin-logo">灵山导览 · 运营后台</span>
      <span class="admin-actions">
        <button class="logout-btn" @click="doLogout">退出登录</button>
        <a class="admin-back" href="/">← 返回前台</a>
      </span>
    </header>
    <nav class="admin-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="admin-tab"
        :class="{ on: active === t.id }"
        @click="active = t.id"
      >{{ t.icon }} {{ t.label }}</button>
    </nav>
    <main class="admin-body">
      <div class="admin-toolbar">
        <span class="admin-sub">景区运营 · 全部指标来自真实数据聚合</span>
        <label class="dash-toggle" :class="{ on: includeDemo }" title="勾选后把演示模式（?demo=1）产生的记录一并纳入，仅用于排查演示流程">
          <input type="checkbox" v-model="includeDemo" />
          <span class="dash-toggle-ic">{{ includeDemo ? '🟠' : '⚪' }}</span>
          {{ includeDemo ? '已包含演示数据' : '排除演示数据' }}
        </label>
      </div>
      <OverviewPanel v-if="active === 'overview'" :include-demo="includeDemo" />
      <KnowledgePanel v-else-if="active === 'knowledge'" />
      <AnalyticsPanel v-else-if="active === 'analytics'" :include-demo="includeDemo" />
      <AvatarConfigPanel v-else-if="active === 'avatar'" />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh; background: #EEF3F8; color: #16324A;
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.admin-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; background: #16324A; color: #fff;
}
.admin-logo { font-size: 17px; font-weight: 800; }
.admin-actions { display: flex; align-items: center; gap: 14px; }
.admin-back { color: #B8D4E8; font-size: 13px; text-decoration: none; }
.admin-back:hover { color: #fff; }
.logout-btn {
  border: 1px solid #4A6C8A; background: transparent; color: #B8D4E8;
  font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer;
}
.logout-btn:hover { color: #fff; border-color: #fff; }

/* P1-1 登录门禁 */
.login-card {
  max-width: 380px; margin: 12vh auto; padding: 32px 28px;
  background: #fff; border-radius: 14px; box-shadow: 0 10px 30px rgba(20,60,95,.12);
  text-align: center;
}
.login-card h2 { font-size: 18px; margin: 0 0 8px; }
.login-tip { font-size: 12px; color: #5A7186; margin: 0 0 18px; line-height: 1.7; }
.login-tip code { background: #EEF3F8; padding: 1px 5px; border-radius: 4px; }
.login-input {
  width: 100%; box-sizing: border-box; padding: 10px 12px; margin-bottom: 12px;
  border: 1px solid #CBD8E2; border-radius: 8px; font-size: 14px;
}
.login-btn {
  width: 100%; padding: 11px; border: none; border-radius: 8px;
  background: #2385BB; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
}
.login-btn:disabled { opacity: .6; cursor: wait; }
.login-err { font-size: 12px; color: #D64545; margin: 12px 0 0; }
.login-card .admin-back { display: inline-block; margin-top: 16px; color: #2385BB; }
.admin-tabs { display: flex; gap: 4px; padding: 10px 16px 0; }
.admin-tab {
  border: none; background: transparent; color: #4A5F74; cursor: pointer;
  font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 8px 8px 0 0;
}
.admin-tab.on { background: #fff; color: #2385BB; box-shadow: 0 -2px 6px rgba(20,60,95,.06); }
.admin-body { padding: 16px 20px; background: #EEF3F8; min-height: calc(100vh - 120px); }
</style>

<!-- ============ 数据看板共享设计系统（全局类，供各 Panel 复用） ============ -->
<style>
/* ---- 页面底色：浅色商务风微渐变 ---- */
.dash-bg {
  background: linear-gradient(180deg, #F6FAFD 0%, #EDF3F9 100%);
  min-height: calc(100vh - 190px);
  border-radius: 16px;
  padding: 18px 20px 26px;
}
.dash-title { font-size: 18px; font-weight: 800; color: #12334D; margin: 0; letter-spacing: .2px; }
.dash-sub { font-size: 12px; color: #5A7186; margin: 3px 0 0; }

/* ---- 可信度条 ---- */
.dash-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
  margin: 12px 0 16px; padding: 9px 14px;
  background: #fff; border: 1px solid #E3EBF2; border-radius: 12px;
  font-size: 12px; color: #4A5F74; box-shadow: 0 1px 2px rgba(20,60,95,.03);
}
.dash-meta b { color: #2385BB; font-weight: 700; }
.dash-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px;
}
.dash-badge.real { background: #E6F6EE; color: #1E8E5A; }
.dash-badge.demo { background: #FFF4E0; color: #B7791F; }
.dash-badge.info { background: #E8F2FB; color: #1E6FA8; }

/* ---- KPI 卡片 ---- */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi-card {
  display: flex; align-items: center; gap: 11px;
  background: #fff; border: 1px solid rgba(255,255,255,.8); border-radius: 14px;
  padding: 13px 14px; box-shadow: 0 1px 2px rgba(20,60,95,.04), 0 6px 18px rgba(20,60,95,.06);
  transition: transform .15s ease, box-shadow .15s ease;
}
.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 6px 22px rgba(20,60,95,.12); }
.kpi-icon {
  width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 19px;
}
.kpi-body { min-width: 0; }
.kpi-num { font-size: 21px; font-weight: 800; color: #12334D; line-height: 1.1; font-variant-numeric: tabular-nums; }
.kpi-num small { font-size: 12px; font-weight: 700; color: #8AA0B5; }
.kpi-label { font-size: 11.5px; color: #7A8FA3; margin-top: 2px; white-space: nowrap; }
.kpi-foot { font-size: 10.5px; color: #A0B0C0; margin-top: 1px; }

/* ---- 卡片网格 ---- */
.dash-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; margin-bottom: 14px; }
.dash-card {
  background: #fff; border: 1px solid rgba(255,255,255,.8); border-radius: 14px;
  box-shadow: 0 1px 2px rgba(20,60,95,.04), 0 6px 18px rgba(20,60,95,.06);
  padding: 14px 16px; min-width: 0;
}
.dash-card-hd { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.dash-card-hd h4 { margin: 0; font-size: 13.5px; font-weight: 800; color: #12334D; }
.dash-card-hd .sub { font-size: 11px; color: #7A8FA3; }
.dash-chart { width: 100%; height: 240px; }
.dash-chart.sm { height: 210px; }
.dash-empty { color: #A9B8C6; font-size: 12px; text-align: center; padding: 34px 0; }

/* ---- 表格 ---- */
.dash-tbl-wrap { max-height: 320px; overflow-y: auto; }
.dash-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.dash-tbl th { text-align: left; color: #8AA0B5; font-weight: 700; padding: 6px 8px; border-bottom: 1px solid #EEF2F6; white-space: nowrap; }
.dash-tbl td { padding: 6px 8px; border-bottom: 1px solid #F5F8FB; color: #3A5268; vertical-align: middle; }
.dash-tbl tr:hover td { background: #F7FBFE; }

/* ---- 小标签 chip ---- */
.chip {
  display: inline-block; font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px;
  background: #E8F2FB; color: #1E6FA8; white-space: nowrap;
}
.chip.gold { background: #FFF4E0; color: #B7791F; }
.chip.green { background: #E6F6EE; color: #1E8E5A; }
.chip.red { background: #FDEBEE; color: #C2455A; }
.chip.purple { background: #EFEBFC; color: #6A55C4; }
.chip.gray { background: #F0F3F6; color: #6B7A8D; }

/* ---- 开关 ---- */
.dash-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: #5A7186; background: #fff;
  border: 1px solid #CBD8E2; border-radius: 9px; padding: 6px 12px; cursor: pointer;
}
.dash-toggle.on { border-color: #D4A24E; color: #B7791F; }
.dash-toggle input { margin: 0; accent-color: #D4A24E; }

/* ---- 反馈/进度 ---- */
.prog { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: #EDF2F6; }
.prog .pos { background: linear-gradient(90deg, #2FA878, #3CC792); }
.prog .neg { background: linear-gradient(90deg, #E0516B, #EF7A8E); }
.prog .neu { background: #C3D0DC; }

.admin-toolbar { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 14px; }
.admin-sub { font-size: 12px; color: #7A8FA3; }
</style>
