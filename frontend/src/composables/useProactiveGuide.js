// TASK-10 主动提醒（伴游式规则引擎）
// - 规则：到达景点(<60m 到点讲解提示) / 接近下一站(<80m) / 演出临近(0-30min) / 高温补水
// - 每条规则带 cooldown(冷却) + oncePerSession(整会话一次)，防刷屏
// - 输出的提示消息统一为 {role:'assistant', kind:'notice', content, includeInContext:false, actions:[...]}
// - 数字人冲突保护：loading/speaking/avatarSpeaking 任一 true 时，由 App 侧决定不强插语音、只显示文字卡片
import { useGeofence } from './useGeofence'
import { distanceMeters } from '../utils/distance'

export const NOTICE_ACTIONS = {
  START_GUIDE: { id: 'start-guide', label: '开始讲解' },
  DISMISS: { id: 'dismiss', label: '稍后' },
  GO_NEXT: { id: 'go-next', label: '去下一站' },
}

// ===== 规则状态（单例，防重复触发）=====
const cooldownUntil = {}   // ruleId -> 下次可触发时间戳
const onceDone = new Set() // ruleId -> 本会话已触发过

function canFire(ruleId, { cooldownMs = 60000, once = false } = {}) {
  const now = Date.now()
  if (once && onceDone.has(ruleId)) return false
  if (cooldownUntil[ruleId] && now < cooldownUntil[ruleId]) return false
  if (once) onceDone.add(ruleId)
  else cooldownUntil[ruleId] = now + cooldownMs
  return true
}

function makeNotice(content, actions = []) {
  return { role: 'assistant', kind: 'notice', content, includeInContext: false, interactionId: null, actions }
}

// 从 showTime（如 "平日 10:00 / 11:30 / 13:30 / 15:00"）解析出今天 HH:MM 的分钟数列表
function parseShowMinutes(showTime) {
  if (!showTime) return []
  const out = []
  const re = /(\d{1,2}):(\d{2})/g
  let m
  while ((m = re.exec(showTime)) !== null) {
    const h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) out.push(h * 60 + min)
  }
  return out
}

// 找到距 nowMinutes 之后 0~30 分钟内最近的一场演出分钟数，没有则 null
function nextShowWithin(showTime, nowMinutes) {
  const times = parseShowMinutes(showTime).sort((a, b) => a - b)
  if (!times.length) return null
  for (const t of times) {
    const diff = t - nowMinutes
    if (diff >= 0 && diff <= 30) return t
  }
  return null
}

export function useProactiveGuide() {
  const fence = useGeofence()

  // 依赖 getter，由 App.vue configure() 注入，保证每次评估取到最新值
  const getters = {
    position: null,          // () => {lat,lng}
    attractions: null,       // () => [{id,name,lat,lng,showTime}]
    activeRoute: null,       // () => route | null（游览中的路线）
    tourSession: null,       // () => tourSession
    weatherTemp: null,       // () => number | null（摄氏温度）
    autoGuide: null,         // () => boolean（用户是否开启自动讲解）
    busy: () => false,       // () => boolean（数字人 loading/speaking/avatarSpeaking）
    now: () => new Date(),   // () => Date（TASK-14 demo 模式注入模拟时钟，仅用于演出临近评估）
    onArrive: null,          // (poi, distance) => void（P0-7：真实围栏到访时上报 footprint 事件）
  }
  function configure(d) { Object.assign(getters, d) }

  /**
   * 每次位置更新时调用，评估所有规则，返回一条或多条 notice（最多 2 条，防刷屏）。
   * 若 autoGuide 开启且数字人不忙，到达规则改为返回 {type:'auto-guide', poi}，由 App 直接调用讲解。
   */
  function onPosition() {
    const pos = getters.position && getters.position()
    if (!pos || pos.lng == null) return []
    const attractions = getters.attractions ? getters.attractions() : []
    const out = []

    // 1) 到达景点：进入 60m 围栏且首次进入该 POI
    const enter = fence.update(pos, attractions)
    if (enter && enter.event === 'enter' && enter.isNew) {
      // P0-7：真实围栏到访 → 上报 footprint（App 注入的 onArrive 回调）
      if (typeof getters.onArrive === 'function') {
        try { getters.onArrive(enter.poi, enter.distance) } catch (e) { /* 埋点失败静默 */ }
      }
      const n = arriveNotice(enter.poi)
      if (n) out.push(n)
    }

    // 2) 接近下一站（仅游览中，距离当前下一站 < 80m）
    const next = nearNextStopNotice(pos, attractions)
    if (next) out.push(next)

    // 3) 演出临近（当前所在 POI 或最近景点 30 分钟内有演出）
    const show = showNotice(pos, attractions)
    if (show) out.push(show)

    // 4) 高温补水（整会话一次）
    const hot = hotNotice()
    if (hot) out.push(hot)

    return out.slice(0, 2)
  }

  // —— 到达景点：自动讲解 or 文字卡片 + 操作按钮 ——
  function arriveNotice(poi) {
    const auto = getters.autoGuide ? getters.autoGuide() : false
    if (auto && !getters.busy()) {
      // 用户已开启自动讲解：不弹卡片，直接触发讲解（由 App 调用 tourAttraction）
      return { type: 'auto-guide', poi }
    }
    return makeNotice(
      `📍 已到达「${poi.name}」\n要让小灵为你讲解吗？`,
      [{ ...NOTICE_ACTIONS.START_GUIDE, payload: { attractionId: poi.id } }, NOTICE_ACTIONS.DISMISS]
    )
  }

  // —— 接近下一站 ——
  function nearNextStopNotice(pos, attractions) {
    const route = getters.activeRoute ? getters.activeRoute() : null
    const ts = getters.tourSession ? getters.tourSession() : null
    if (!route || !ts || ts.status !== 'active') return null
    const stops = (Array.isArray(route.stops) ? route.stops : [])
      .filter(s => s && (s.attractionId || s.attraction_id))
    if (ts.currentStopIndex >= stops.length - 1) return null // 已是最后一站，无需提醒
    const next = stops[ts.currentStopIndex + 1]
    const pid = next.attractionId || next.attraction_id
    const poi = attractions.find(a => String(a.id) === String(pid))
    if (!poi || poi.lng == null) return null
    const d = distanceMeters(pos.lat, pos.lng, poi.lat, poi.lng)
    if (d <= 80 && canFire('near-next', { cooldownMs: 120000 })) {
      return makeNotice(
        `🧭 下一站「${poi.name}」就在前方 ${Math.round(d)} 米\n要我继续带路吗？`,
        [{ ...NOTICE_ACTIONS.GO_NEXT, payload: {} }, NOTICE_ACTIONS.DISMISS]
      )
    }
    return null
  }

  // —— 演出临近 ——
  function showNotice(pos, attractions) {
    if (!attractions.length) return null
    const now = (getters.now ? getters.now() : new Date())
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    // 只看当前所在 POI；不在围栏内则看最近的景点
    let target = null
    if (fence.state.insideId) {
      target = attractions.find(a => String(a.id) === String(fence.state.insideId)) || null
    }
    if (!target) {
      let minD = Infinity
      attractions.forEach(a => {
        if (a.lng == null) return
        const d = distanceMeters(pos.lat, pos.lng, a.lat, a.lng)
        if (d < minD) { minD = d; target = a }
      })
    }
    if (!target || !target.showTime) return null
    const start = nextShowWithin(target.showTime, nowMinutes)
    if (start != null && canFire('show', { cooldownMs: 300000 })) {
      const hh = String(Math.floor(start / 60)).padStart(2, '0')
      const mm = String(start % 60).padStart(2, '0')
      return makeNotice(`🎭 「${target.name}」${hh}:${mm} 有演出\n要不要提前过去占个位置？`, [NOTICE_ACTIONS.DISMISS])
    }
    return null
  }

  // —— 高温补水 ——
  function hotNotice() {
    const t = getters.weatherTemp ? getters.weatherTemp() : null
    if (t == null || t < 35) return null
    if (!canFire('hot', { once: true })) return null
    return makeNotice(`☀️ 今天 ${t}℃，天气炎热\n注意补水防晒，小灵会一路陪着你`, [NOTICE_ACTIONS.DISMISS])
  }

  function reset() {
    fence.reset()
  }

  return { configure, onPosition, reset, fence }
}
