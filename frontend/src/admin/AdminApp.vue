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
      <OverviewPanel v-if="active === 'overview'" />
      <KnowledgePanel v-else-if="active === 'knowledge'" />
      <AnalyticsPanel v-else-if="active === 'analytics'" />
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
.admin-body { padding: 16px; background: #EEF3F8; min-height: calc(100vh - 120px); }
</style>
