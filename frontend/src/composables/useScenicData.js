// 统一景区数据状态（module-level singleton）
// App 全局加载一次，景点卡片/地图/路线卡片共享同一份数据；
// 后端未启动时统一回退到 FALLBACK 兜底数据。
import { ref } from 'vue'
import { fetchAttractions, fetchRoutes } from '../api'
import { FALLBACK_ATTRACTIONS, FALLBACK_ROUTES } from '../data/fallback'

const attractions = ref(FALLBACK_ATTRACTIONS)
const routes = ref(FALLBACK_ROUTES)
const loading = ref(false)
const loaded = ref(false)
const error = ref(null)
// 首次加载尝试已结束（成功或失败）：此时 attractions/routes 为最终值
// （后端可用时为后端数据，否则为 FALLBACK）。供子组件在数据确定后再渲染。
const ready = ref(false)

export function useScenicData() {
  async function loadScenicData() {
    // 已加载过则不再重复请求（module-level 单例只拉一次）
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const [as, rs] = await Promise.all([fetchAttractions(), fetchRoutes()])
      if (Array.isArray(as) && as.length) attractions.value = as
      if (Array.isArray(rs) && rs.length) routes.value = rs
      loaded.value = true
    } catch (e) {
      // 后端未启动：保留 FALLBACK 兜底数据，页面仍可正常演示
      error.value = e
    } finally {
      loading.value = false
      ready.value = true
    }
  }

  return {
    attractions,
    routes,
    loading,
    loaded,
    error,
    ready,
    loadScenicData,
  }
}
