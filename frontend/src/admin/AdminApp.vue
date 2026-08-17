<script setup>
// Admin 后台（第一版不引入 Vue Router，按路径 /admin 分发）
import { ref } from 'vue'
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
</script>

<template>
  <div class="admin-shell">
    <header class="admin-head">
      <span class="admin-logo">灵山导览 · 运营后台</span>
      <a class="admin-back" href="/">← 返回前台</a>
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
.admin-back { color: #B8D4E8; font-size: 13px; text-decoration: none; }
.admin-back:hover { color: #fff; }
.admin-tabs { display: flex; gap: 4px; padding: 10px 16px 0; }
.admin-tab {
  border: none; background: transparent; color: #4A5F74; cursor: pointer;
  font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 8px 8px 0 0;
}
.admin-tab.on { background: #fff; color: #2385BB; box-shadow: 0 -2px 6px rgba(20,60,95,.06); }
.admin-body { padding: 16px; background: #EEF3F8; min-height: calc(100vh - 120px); }
</style>
