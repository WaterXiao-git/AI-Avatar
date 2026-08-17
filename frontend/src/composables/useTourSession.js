// 路线执行状态（TASK-09）：
// 选择路线 → 开始游览 → 当前站 → 下一站 → 已完成。
// - 状态机：idle | active | completed
// - localStorage 持久化（key: lingshan-tour-session），刷新后继续
// - 事件上报：route_start / route_stop_reached / route_complete（POST /api/events）
// 注意：TASK-08 后路线可执行站点（navigable）为 stops 中带真实 attractionId 的项；
// 缺失 POI（天下第一掌/百子戏弥勒/佛手广场/灵山精舍）仅文案，不参与执行。
import { reactive } from 'vue'
import { trackEvent } from '../api'
import { sessionId } from './useSession'

const STORAGE_KEY = 'lingshan-tour-session'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      return {
        routeId: d.routeId || null,
        status: d.status || 'idle',
        startedAt: d.startedAt || null,
        currentStopIndex: d.currentStopIndex || 0,
        completedStopIds: Array.isArray(d.completedStopIds) ? d.completedStopIds : [],
      }
    }
  } catch (e) { /* 损坏则回退初始态 */ }
  return { routeId: null, status: 'idle', startedAt: null, currentStopIndex: 0, completedStopIds: [] }
}

const saved = load()
export const tourSession = reactive({
  routeId: saved.routeId,
  status: saved.status,
  startedAt: saved.startedAt,
  currentStopIndex: saved.currentStopIndex,
  completedStopIds: saved.completedStopIds,
})

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    routeId: tourSession.routeId,
    status: tourSession.status,
    startedAt: tourSession.startedAt,
    currentStopIndex: tourSession.currentStopIndex,
    completedStopIds: tourSession.completedStopIds,
  }))
}

export function isNavigableStop(s) {
  return !!(s && (s.attractionId || s.attraction_id))
}
export function navigableStops(route) {
  return (route && Array.isArray(route.stops) ? route.stops : []).filter(isNavigableStop)
}
function stopId(s) { return s ? (s.attractionId || s.attraction_id) : null }

function report(type, route, payload = {}, attractionId = null) {
  try {
    trackEvent({
      session_id: sessionId.value,
      event_type: type,
      route_id: route?.id || tourSession.routeId || null,
      attraction_id: attractionId,
      payload,
    })
  } catch (e) { /* 上报失败静默 */ }
}

export function useTourSession() {
  function startRoute(route) {
    const nav = navigableStops(route)
    tourSession.routeId = route?.id || 'custom'
    tourSession.status = 'active'
    tourSession.startedAt = new Date().toISOString()
    tourSession.currentStopIndex = 0
    tourSession.completedStopIds = []
    persist()
    report('route_start', route, { stopCount: nav.length })
    if (nav.length) report('route_stop_reached', route, { index: 0 }, stopId(nav[0]))
  }

  // 当前站完成 → 前进到下一站；已是最后一站 → completed
  function advanceStop(route) {
    if (tourSession.status !== 'active') return
    const nav = navigableStops(route)
    if (!nav.length) return
    const cur = nav[tourSession.currentStopIndex]
    const id = stopId(cur)
    if (id && !tourSession.completedStopIds.includes(id)) {
      tourSession.completedStopIds.push(id)
    }
    if (tourSession.currentStopIndex + 1 < nav.length) {
      tourSession.currentStopIndex += 1
      report('route_stop_reached', route, { index: tourSession.currentStopIndex }, stopId(nav[tourSession.currentStopIndex]))
    } else {
      tourSession.status = 'completed'
      report('route_complete', route, { totalStops: nav.length })
    }
    persist()
  }

  function reset() {
    tourSession.routeId = null
    tourSession.status = 'idle'
    tourSession.startedAt = null
    tourSession.currentStopIndex = 0
    tourSession.completedStopIds = []
    try { localStorage.removeItem(STORAGE_KEY) } catch (e) { /* 忽略 */ }
  }

  // 该路线当前是否为进行中/已完成（供卡片状态展示）
  function sessionStateFor(route) {
    if (!route || tourSession.routeId !== (route.id || 'custom')) return 'idle'
    return tourSession.status  // active | completed | idle
  }

  return { tourSession, startRoute, advanceStop, reset, sessionStateFor }
}
