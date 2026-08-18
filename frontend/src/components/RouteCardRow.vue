<script setup>
import { computed } from 'vue'
// 路线数据由 App 统一加载后传入（useScenicData 单例），组件不再自行请求
const props = defineProps({
  routes: { type: Array, default: () => [] },
  currentRouteId: { type: String, default: '' },
  customRoute: { type: Object, default: null },
  tourSession: { type: Object, default: null },  // TASK-09 路线执行状态（useTourSession 单例）
})
const emit = defineEmits(['tour', 'open-customize', 'start-route', 'continue-route'])

function pick(r, isCustom = false) {
  emit('tour', { route: r, custom: isCustom })
}

// TASK-08：诚实显示「核心站点 X/Y」——X 为可导航站点（有真实 attractionId），Y 为文案列出的全部站点。
// 不假装把 inflated 的 spots 总数当可执行站点数（如 2/21）。
function stopLabel(r) {
  if (r && Array.isArray(r.stops) && r.stops.length) {
    const core = r.stops.filter(s => s && (s.attractionId || s.attraction_id)).length
    return `核心站点 ${core}/${r.stops.length}`
  }
  return `${r?.spots ?? 0}景点`
}

// ===== TASK-09 路线执行状态 =====
const ts = computed(() => props.tourSession || { routeId: null, status: 'idle' })
// 某条路线当前状态：active | completed | idle（未开始/其他路线）
function sessionState(r) {
  if (ts.value.routeId !== (r?.id || 'custom')) return 'idle'
  return ts.value.status
}
function navigableCount(r) {
  return (Array.isArray(r?.stops) ? r.stops : []).filter(s => s && (s.attractionId || s.attraction_id)).length
}
function currentStopLabel(r) {
  const n = navigableCount(r)
  if (!n) return ''
  return `第${ts.value.currentStopIndex + 1}/${n}站`
}
</script>

<template>
  <section class="route-panel glass">
    <div class="route-head">
      <span class="route-title">🧭 游览路线</span>
      <button class="gen-btn" @click="emit('open-customize')">
        ✨ 生成专属路线
      </button>
    </div>

    <div class="route-scroll">
      <!-- AI 生成的专属路线卡片（最前） -->
      <div v-if="customRoute" class="route-card custom" :class="{ active: currentRouteId === 'custom' }" @click="pick(customRoute, true)">
        <div class="route-pic custom-pic" :style="{ backgroundImage: `url(${customRoute.image || '/model/route-2.png'})` }">
          <span class="badge custom-badge">AI 专属</span>
        </div>
        <div class="route-meta">
          <p class="route-name">{{ customRoute.name }}</p>
          <p class="route-params">{{ stopLabel(customRoute) }} · {{ customRoute.km }}公里 · {{ customRoute.hours }}小时</p>
          <p class="route-reason">{{ customRoute.reason }}</p>
          <!-- TASK-09 路线执行状态 -->
          <div v-if="sessionState(customRoute) === 'active'" class="route-actions">
            <span class="ongoing">{{ currentStopLabel(customRoute) }} · {{ stopLabel(customRoute) }}</span>
            <button class="cont-btn" @click.stop="emit('continue-route', customRoute)">继续游览</button>
          </div>
          <div v-else-if="sessionState(customRoute) === 'completed'" class="route-actions">
            <span class="done-label">✅ 已完成</span>
            <button class="restart-btn" @click.stop="emit('start-route', customRoute)">重游</button>
          </div>
          <button v-else class="start-btn" @click.stop="emit('start-route', customRoute)">开始游览</button>
        </div>
      </div>

      <!-- 6 条官方路线 -->
      <div
        v-for="r in routes"
        :key="r.id"
        class="route-card"
        :class="{ active: r.id === currentRouteId }"
        @click="pick(r)"
      >
        <div class="route-pic" :style="{ backgroundImage: `url(${r.image})` }">
          <span v-if="r.id === 'qifu'" class="badge">默认推荐</span>
        </div>
        <div class="route-meta">
          <p class="route-name">{{ r.name }}</p>
          <p class="route-params">{{ stopLabel(r) }} · {{ r.km }}公里 · {{ r.hours }}小时</p>
          <p class="route-tags">
            <span class="tag" v-for="t in r.tags" :key="t">{{ t }}</span>
          </p>
          <!-- TASK-09 路线执行状态 -->
          <div v-if="sessionState(r) === 'active'" class="route-actions">
            <span class="ongoing">{{ currentStopLabel(r) }} · {{ stopLabel(r) }}</span>
            <button class="cont-btn" @click.stop="emit('continue-route', r)">继续游览</button>
          </div>
          <div v-else-if="sessionState(r) === 'completed'" class="route-actions">
            <span class="done-label">✅ 已完成</span>
            <button class="restart-btn" @click.stop="emit('start-route', r)">重游</button>
          </div>
          <button v-else class="start-btn" @click.stop="emit('start-route', r)">开始游览</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.route-panel {
  padding: 8px 10px 10px;
  display: flex; flex-direction: column; overflow: hidden;
}
.route-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px; flex-shrink: 0;
}
.route-title { font-size: 15px; font-weight: 800; color: #16324A; }
.gen-btn {
  border: none; cursor: pointer;
  background: linear-gradient(135deg, #FFB347, #FF7BAC);
  color: #fff; font-size: 13px; font-weight: 700;
  border-radius: 999px; padding: 7px 16px;
  box-shadow: 0 4px 12px rgba(255,123,172,.35);
  transition: transform .15s, box-shadow .15s;
}
.gen-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(255,123,172,.45); }

.route-scroll {
  display: flex; gap: 10px; overflow-x: auto; overflow-y: auto;
  min-height: 0; padding-bottom: 4px;
  /* 卡片用自然高度而非被拉伸填满，避免内容被压缩裁切 */
  align-items: flex-start;
}
.route-card {
  width: 178px; flex-shrink: 0;
  background: var(--card-bg); border-radius: 12px; overflow: hidden;
  box-shadow: var(--shadow); cursor: pointer;
  transition: box-shadow .2s, transform .2s;
}
.route-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); }
.route-card.active { box-shadow: 0 0 0 3px #FFC107, var(--shadow-hover); }
.route-card.custom { outline: 2px solid rgba(255,123,172,.5); }
.route-pic {
  height: 78px; background-size: cover; background-position: center;
  position: relative;
}
.badge {
  position: absolute; top: 6px; left: 6px;
  background: rgba(255, 123, 172, .92); color: #fff;
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
}
.custom-badge { background: linear-gradient(135deg, #FFB347, #FF7BAC); }
.route-meta { padding: 6px 9px 7px; background: #fff; }
.route-name { font-size: 13px; font-weight: 700; }
.route-params { font-size: 11px; color: var(--theme-blue); margin: 2px 0 4px; }
.route-reason {
  font-size: 11px; color: #6B7A8D; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.route-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  background: #F2F6FC; color: var(--theme-blue);
  font-size: 10px; padding: 2px 6px; border-radius: 4px;
}

/* TASK-09 路线执行状态 */
.route-actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px; }
.start-btn {
  width: 100%; margin-top: 5px; border: none; cursor: pointer;
  background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff;
  font-size: 12px; font-weight: 700; border-radius: 999px; padding: 5px 0;
}
.start-btn:hover { filter: brightness(1.05); }
.ongoing { font-size: 11px; color: #D97A2B; font-weight: 700; }
.cont-btn {
  border: 1px solid #F0C96B; background: #FFF7E0; color: #B7791F;
  font-size: 11px; font-weight: 700; border-radius: 999px; padding: 4px 10px; cursor: pointer;
}
.done-label { font-size: 11px; color: #2FA878; font-weight: 800; }
.restart-btn {
  border: 1px solid #C6E8D6; background: #EAF9F0; color: #2FA878;
  font-size: 11px; font-weight: 700; border-radius: 999px; padding: 4px 10px; cursor: pointer;
}
</style>
