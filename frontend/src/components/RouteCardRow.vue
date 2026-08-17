<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchRoutes } from '../api'
import { FALLBACK_ROUTES } from '../data/fallback'

const props = defineProps({
  currentRouteId: { type: String, default: '' },
  customRoute: { type: Object, default: null },
})
const emit = defineEmits(['tour', 'open-customize'])

const routes = ref(FALLBACK_ROUTES)
onMounted(async () => {
  try { routes.value = await fetchRoutes() } catch (e) { /* 后端未启动用兜底 */ }
})

// 默认推荐路线：官方推荐的祈福禅悟线
const defaultRoute = computed(() => routes.value.find(r => r.id === 'qifu') || routes.value[0])

function pick(r, isCustom = false) {
  emit('tour', { route: r, custom: isCustom })
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
          <p class="route-params">{{ customRoute.spots }}景点 · {{ customRoute.km }}公里 · {{ customRoute.hours }}小时</p>
          <p class="route-reason">{{ customRoute.reason }}</p>
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
          <p class="route-params">{{ r.spots }}景点 · {{ r.km }}公里 · {{ r.hours }}小时</p>
          <p class="route-tags">
            <span class="tag" v-for="t in r.tags" :key="t">{{ t }}</span>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.route-panel { padding: 10px 12px 12px; }
.route-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
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

.route-scroll { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
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
  height: 104px; background-size: cover; background-position: center;
  position: relative;
}
.badge {
  position: absolute; top: 6px; left: 6px;
  background: rgba(255, 123, 172, .92); color: #fff;
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
}
.custom-badge { background: linear-gradient(135deg, #FFB347, #FF7BAC); }
.route-meta { padding: 7px 10px 9px; background: #fff; }
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
</style>
