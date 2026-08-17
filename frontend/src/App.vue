<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import WeatherBar from './components/WeatherBar.vue'
import AttractionList from './components/AttractionList.vue'
import MapPanel from './components/MapPanel.vue'
import DigitalHuman from './components/DigitalHuman.vue'
import ChatPanel from './components/ChatPanel.vue'
import RouteCardRow from './components/RouteCardRow.vue'
import RouteCustomizer from './components/RouteCustomizer.vue'
import FootprintPanel from './components/FootprintPanel.vue'
import { useChat } from './composables/useChat'
import { useSpeech } from './composables/useSpeech'
import { planRoute, fetchFacilities, submitFeedback, trackEvent } from './api'
import { useScenicData } from './composables/useScenicData'
import { useSession } from './composables/useSession'
import { useTourSession, navigableStops as navigableStopsOf } from './composables/useTourSession'
import { useGeolocation } from './composables/useGeolocation'
import { wgs84ToBd09 } from './utils/geoTransform'
import { distanceMeters } from './utils/distance'
import { getGuide } from './data/guides'
import { useProactiveGuide } from './composables/useProactiveGuide'
import { useI18n } from './composables/useI18n'
import { useDemo } from './composables/useDemo'

const dhRef = ref(null)
const { messages, loading, speaking, ask, setSpeakHandler, setWelcome } = useChat()
const speech = useSpeech()
const inputText = ref('')
// TASK-12：数字人真实说话状态（魔珐 payload 驱动），防回声需同时考虑它
const avatarSpeaking = ref(false)

// TASK-13.3 多语言：语言切换驱动欢迎词/预设问题/问答/TTS
const i18n = useI18n()

// ===== 统一景区数据（App 全局加载一次，子组件共享） =====
const { attractions, routes, ready, loadScenicData } = useScenicData()

// ===== 公共设施（DEMO 数据）与地图图层 =====
const facilities = ref([])
const facilityType = ref('attraction')   // attraction | toilet | food | entrance | service
const currentLocation = ref(null)        // {lng, lat}（BD09，TASK-09 定位后填充）
const companionEnabled = ref(false)      // 随行讲解开关
const avatarCfg = ref({})                // 后台数字人配置（P0-8：全量生效）

// ===== TASK-09 路线执行状态（单例）+ 定位（到点/地图当前位置） =====
const tour = useTourSession()
const { tourSession, startRoute, advanceStop, reset: resetTour } = tour
const geo = useGeolocation()
// TASK-14 比赛 Demo 模式：?demo=1 时模拟位置/演出临近/路线进度，仅演示、不读真实 GPS
const demo = useDemo()
// 定位原始坐标 WGS84 → BD09，喂给地图「我的位置」（真实 GPS 与 demo 模拟位置共用同一条转换链）
watch(geo.position, (p) => {
  if (p && p.lng != null && p.lat != null) {
    const [lng, lat] = wgs84ToBd09(p.lng, p.lat)
    currentLocation.value = { lng, lat }
  }
}, { immediate: true })
// demo 模拟位置：attractions 坐标已是 BD09（与真实 GPS 转换后的 currentLocation 同坐标系），直接复用
watch(demo.position, (p) => {
  if (p && p.lng != null && p.lat != null) {
    currentLocation.value = { lng: p.lng, lat: p.lat }
  }
})

// ===== TASK-10 主动提醒（伴游式规则引擎） =====
const weatherTemp = ref(null)  // 用于高温补水提醒（解析自 /api/weather）
async function loadWeatherTemp() {
  try {
    const r = await fetch('/api/weather').then(x => x.json())
    const t = parseInt(String(r.temp || '').replace(/[^\d-]/g, ''), 10)
    if (!Number.isNaN(t)) weatherTemp.value = t
  } catch (e) { /* 天气失败不影响主流程 */ }
}
// P0-8：读取后台数字人配置并全量生效（welcome_text / persona / reply_length /
// idle_disconnect_seconds / default_mode / proactive_enabled）
async function loadAvatarConfig() {
  try {
    const r = await fetch('/api/config/avatar').then(x => x.json())
    if (!r || typeof r !== 'object') return
    avatarCfg.value = r
    if (r.welcome_text) setWelcome(r.welcome_text)
    // 默认模式（qa / tour）：首屏未主动切换时应用
    if (r.default_mode === 'tour' && mode.value === 'qa') {
      handleMode('tour')
    }
    // 空闲自动断开时长（秒）：写回由 resetIdle 立即生效
    resetIdle()
  } catch (e) { /* 配置读取失败使用默认欢迎词 */ }
}

// P0-8：主动提醒总开关（后台配置 proactive_enabled，默认开启）
function isProactiveEnabled() {
  return avatarCfg.value.proactive_enabled !== false
}
// TASK-13.3 语言切换：切语言 → 更新欢迎词（英文用内置英文欢迎词，中文回到后台配置）
function handleLangChange(next) {
  i18n.setLanguage(next)
  if (next === 'en-US') {
    setWelcome(i18n.welcome())
  } else {
    loadAvatarConfig()
  }
}
// P0-12：行为事件统一上报（自动带 session_id + demo 标记）
function track(type, extra = {}) {
  trackEvent({ event_type: type, ...extra })
}

const proactive = useProactiveGuide()
proactive.configure({
  position: () => currentLocation.value,         // BD09
  attractions: () => attractions.value,          // 含 lat/lng(BD09)/showTime
  activeRoute: () => currentRoute.value,          // 游览中的路线（接近下一站规则）
  tourSession: () => tourSession,                 // 路线执行状态
  weatherTemp: () => weatherTemp.value,
  autoGuide: () => companionEnabled.value,        // 随行讲解开关=自动讲解开关
  busy: () => loading.value || speaking.value || avatarSpeaking.value,  // 数字人忙碌（不插播语音）
  // TASK-14 demo：演出临近用模拟时钟（非 demo 返回真实时间）
  now: demo.demoNowProvider(() => currentLocation.value, () => attractions.value),
  // P0-7：真实围栏到访 → 上报 footprint 事件（足迹只统计这个，不统计路线点击/进度）
  onArrive: (poi, dist) => track('attraction_arrival', {
    attraction_id: poi && poi.id,
    payload: { distance: Math.round(dist || 0) },
  }),
})
// 位置更新 → 规则评估 → notice 卡片 / 自动讲解（真实 GPS 或 demo 模拟位置均触发）
function evaluateNotices() {
  if (!isProactiveEnabled()) return  // P0-8：后台关闭主动提醒则不评估
  if (!geo.enabled.value && !demo.isDemo) return  // 未开启定位（且非 demo）不评估
  const notices = proactive.onPosition()
  if (!notices || !notices.length) return
  for (const n of notices) {
    if (n.type === 'auto-guide') {
      // 数字人冲突保护：忙碌时不强插语音
      if (loading.value || speaking.value || avatarSpeaking.value) continue
      tourAttraction(n.poi)
    } else if (n && n.kind === 'notice') {
      // 防重复：同样的提示已存在则不重复插入
      if (messages.value.some(m => m.kind === 'notice' && m.content === n.content)) continue
      messages.value.push(n)
      track('proactive_notice', { payload: { notice: n.content } })
    }
  }
}
watch(geo.position, evaluateNotices)
watch(demo.position, evaluateNotices)

// ===== 会话（session_id 存 sessionStorage，聊天埋点关联） =====
const { sessionId, startSession } = useSession()

// ===== 模式与上下文 =====
const mode = ref('qa')               // qa 问答 / tour 讲解

// P0-12：模式切换埋点
watch(mode, (m, old) => {
  if (old && old !== m) track('mode_change', { payload: { from: old, to: m } })
})
const currentAttraction = ref(null)
const currentRoute = ref(routes.value[0])  // 默认推荐路线：祈福禅悟线
const customRoute = ref(null)
const currentGuide = ref(null)       // 当前讲解景点的攻略卡片内容
const showCustomizer = ref(false)
const customizing = ref(false)
const exhibition = ref(false)
const showFootprint = ref(false)   // TASK-13.2 我的灵山足迹弹层

const currentRouteId = computed(() => (customRoute.value ? 'custom' : (currentRoute.value?.id || '')))
const contextLabel = computed(() => {
  if (mode.value !== 'tour') return ''
  if (currentAttraction.value) return currentAttraction.value.name
  if (customRoute.value) return customRoute.value.name
  return currentRoute.value?.name || ''
})

// ===== 说话：魔珐星云优先，Edge-TTS 兜底 =====
let currentAudio = null
let idleTimer = null

function speakText(text) {
  if (dhRef.value && dhRef.value.speak(text)) {
    resetIdle()
    return Promise.resolve()
  }
  // 截图调试：noavatar 模式下不请求 TTS，仅渲染文案
  if (new URLSearchParams(location.search).has('noavatar')) return Promise.resolve()
  // 兜底：Edge-TTS 播放（TASK-13.3 按语言选 voice）
  currentAudio = new Audio('/api/tts?text=' + encodeURIComponent(text) + '&language=' + encodeURIComponent(i18n.language.value))
  const audio = currentAudio
  return new Promise((resolve) => {
    audio.onended = resolve; audio.onerror = resolve; audio.play()
  })
}
setSpeakHandler(speakText)

function resetIdle() {
  clearTimeout(idleTimer)
  // P0-8：空闲自动断开时长由后台配置（默认 90s）。魔珐按会话+在线时长计费，缩短挂机时间省积分
  const secs = Number(avatarCfg.value.idle_disconnect_seconds)
  const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 90000
  idleTimer = setTimeout(() => { if (dhRef.value && !speaking.value) dhRef.value.destroy() }, ms)
}
resetIdle()

// ===== 讲解模式：自动播报 =====
function narrate(text) {
  messages.value.push({ role: 'assistant', content: text })
  return speakText(text)
}

// TASK-08：路线核心站点统计——X 为可导航站点（有真实 attractionId），Y 为文案站点总数
function routeStopStats(r) {
  if (r && Array.isArray(r.stops) && r.stops.length) {
    return { core: r.stops.filter(s => s && (s.attractionId || s.attraction_id)).length, total: r.stops.length }
  }
  return { core: 0, total: 0 }
}

function tourAttraction(a) {
  mode.value = 'tour'
  currentAttraction.value = a
  currentGuide.value = getGuide(a.id)
  const g = currentGuide.value
  const text = g
    ? `来到「${a.name}」，${g.tagline}！${a.intro}${a.showTime ? '，演出时间：' + a.showTime : ''}。最值得玩的是：${g.highlights[0]}；${g.highlights[1]}。`
    : `【${a.name}】${a.intro}${a.showTime ? '。演出时间：' + a.showTime : ''}`
  narrate(text)
  // P0-12：景点讲解埋点（guide_start 表示开始讲解该景点）
  track('guide_start', { attraction_id: a && a.id })
}

function tourRoute({ route, custom = false }) {
  mode.value = 'tour'
  currentRoute.value = route
  customRoute.value = custom ? route : null
  currentAttraction.value = null
  currentGuide.value = null
  if (custom && route.stops && route.stops.length) {
    const stops = route.stops.map(s => `${s.name}（${s.why}）`).join(' → ')
    narrate(`【${route.name}】${route.reason}。行程：${stops}。约${route.hours}小时、${route.km}公里。`)
  } else {
    const { core, total } = routeStopStats(route)
    narrate(`【${route.name}】${route.desc}。核心站点${core}/${total}、约${route.km}公里、${route.hours}小时。推荐：${route.tags.join('、')}。`)
  }
}

function handleMode(m) {
  mode.value = m
  if (m === 'tour' && !currentAttraction.value && !currentRoute.value) {
    tourRoute({ route: routes.value[0] })  // 无上下文时默认讲解官方推荐线
  }
}

// ===== TASK-09 路线执行：开始 / 继续 / 下一站 =====
function startGeolocation() {
  if (demo.isDemo) {
    // demo：优先沿当前路线各站景点坐标模拟移动；无路线时退化为遍历全部景点坐标，
    // 同样触发到点/接近/演出等 LBS 规则。绝不读取真实 GPS、不上报伪造客流。
    let coords = navigableStopsOf(currentRoute.value)
      .map(s => {
        const a = attractions.value.find(x => String(x.id) === String(s.attractionId || s.attraction_id))
        return a && a.lng != null ? { lng: a.lng, lat: a.lat, name: a.name } : null
      })
      .filter(Boolean)
    if (!coords.length) {
      coords = attractions.value
        .filter(a => a.lng != null)
        .map(a => ({ lng: a.lng, lat: a.lat, name: a.name }))
    }
    demo.startSim(coords)
    return
  }
  geo.start()  // 游览中开启真实定位，地图显示「我的位置」并供 TASK-10 到点提醒
}

// P0-6：随行讲解开关 = 定位生命周期开关。
// 打开 → 启动定位（真实 GPS 或 demo 模拟）驱动到点/演出提醒；关闭 → 停止定位并清理围栏状态。
function toggleCompanion() {
  companionEnabled.value = !companionEnabled.value
  if (companionEnabled.value) {
    startGeolocation()
    track('location_enable', {})
  } else {
    geo.stop()
    demo.stopSim()
    proactive.reset()
    track('location_disable', {})
  }
}

function enterTourRoute(route) {
  currentRoute.value = route
  if ((route.id || 'custom') === 'custom') customRoute.value = route
  mode.value = 'tour'
  currentAttraction.value = null
  currentGuide.value = null
}

function onStartRoute(route) {
  const normalized = { ...route, id: route.id || 'custom' }
  startRoute(normalized)
  enterTourRoute(normalized)
  const nav = navigableStopsOf(normalized)
  const first = nav[0]
  narrate(`开始游览「${normalized.name}」！${normalized.desc || ''} 全程核心站点${nav.length}站，第一站「${first?.name || ''}」，跟我出发吧！`)
  startGeolocation()
}

function onContinueRoute(route) {
  const normalized = { ...route, id: route.id || 'custom' }
  enterTourRoute(normalized)
  const nav = navigableStopsOf(normalized)
  const cur = nav[tourSession.currentStopIndex]
  narrate(`继续「${normalized.name}」游览，当前在第${tourSession.currentStopIndex + 1}/${nav.length}站「${cur?.name || ''}」。`)
  startGeolocation()
}

function onNextStop() {
  const route = currentRoute.value
  if (!route) return
  advanceStop(route)
  if (tourSession.status === 'completed') {
    narrate(`🎉 恭喜完成「${route.name}」全部 ${navigableStopsOf(route).length} 个站点！今天的灵山之行圆满结束。`)
  } else {
    const cur = navigableStopsOf(route)[tourSession.currentStopIndex]
    // P0-7：路线进度前进 ≠ 真实到访，措辞改为「前往下一站」，真实到访由地理围栏 attraction_arrival 上报
    narrate(`前往第${tourSession.currentStopIndex + 1}站「${cur?.name || ''}」${cur?.intro ? '：' + cur.intro.slice(0, 60) + '…' : ''}`)
  }
}

function onRestartRoute() {
  const route = currentRoute.value
  if (route) onStartRoute(route)
}

// ===== TASK-10 主动提醒：notice 卡片操作 =====
function onNoticeAction(action, msg) {
  if (!action) return
  if (action.id === 'start-guide' && action.payload && action.payload.attractionId) {
    const a = attractions.value.find(x => String(x.id) === String(action.payload.attractionId))
    if (a) tourAttraction(a)
  } else if (action.id === 'go-next') {
    onNextStop()
  }
  // dismiss：静默忽略（卡片保留在聊天历史）
}

// ===== P0-5 附近设施闭环：点击设施标记 → 基于当前位置计算真实距离 + DEMO 标注 =====
const FACILITY_TYPE_LABEL = { toilet: '卫生间', food: '餐饮', entrance: '出入口', service: '游客服务' }
function onHighlightFacility(f) {
  if (!f) return
  let distanceText = ''
  let dist = null
  if (currentLocation.value && f.lat != null && f.lng != null) {
    dist = Math.round(distanceMeters(currentLocation.value.lat, currentLocation.value.lng, f.lat, f.lng))
    distanceText = `距你约 ${dist} 米`
  }
  const label = FACILITY_TYPE_LABEL[f.type] || '设施'
  messages.value.push({
    role: 'assistant',
    content: `📍 ${label}「${f.name}」${distanceText ? '，' + distanceText : ''}。当前为演示数据，位置仅供参考，正式上线前需官方核实。`,
    interactionId: null, kind: 'notice', includeInContext: false,
  })
  // P0-12：设施点击埋点（携带计算出的距离）
  track('facility_click', { attraction_id: null, payload: { facility_id: f.id, name: f.name, type: f.type, distance: dist } })
}

// ===== 问答 =====
// 设施意图识别：问题提到卫生间/餐饮/出入口/游客服务等 → 自动切换地图对应设施图层
const FACILITY_RULES = [
  { keys: ['卫生间', '厕所', '洗手间', '公厕', 'wc'], type: 'toilet' },
  { keys: ['餐厅', '餐饮', '吃饭', '美食', '小吃'], type: 'food' },
  { keys: ['出口', '大门', '出入口'], type: 'entrance' },
  { keys: ['游客中心', '服务中心', '服务台', '急救', '母婴', '停车'], type: 'service' },
]
function detectFacilityIntent(text) {
  if (!text) return null
  const q = text.toLowerCase()
  for (const r of FACILITY_RULES) {
    if (r.keys.some(k => q.includes(k))) return r.type
  }
  return null
}

function onChatSend(text, opts = {}) {
  // 设施意图：地图切到对应设施图层（回答仍走 AI）
  const ft = detectFacilityIntent(text)
  if (ft) facilityType.value = ft
  // 先记录当前上下文（供 interaction 埋点关联景点/路线），再切问答模式
  const ctx = { attraction_id: currentAttraction.value?.id || null, route_id: currentRouteId.value || null }
  mode.value = 'qa'
  currentAttraction.value = null
  currentGuide.value = null
  // P0-12：文字提问行为埋点（input_type 区分 text/voice/vision）
  track('chat_send', {
    payload: { text, input_type: opts.inputType || 'text', facility_type: ft || null, mode: mode.value },
  })
  ask(text, {
    sessionId: sessionId.value,
    mode: mode.value,
    context: ctx,
    inputType: opts.inputType || 'text',
    language: i18n.language.value,  // TASK-13.3 多语言
  })
}

// ===== 图片识景结果：景点→讲解，文字→填输入框，问题→直接展示视觉回答 =====
function onVisionResult(result) {
  if (!result) return
  // P0-12：图片分析行为埋点（携带结果类型与是否带问题）
  track('vision_upload', {
    payload: {
      type: result.type || 'unknown',
      recognized_name: result.recognized_name || '',
      has_question: !!(result.suggested_question || result.question),
    },
  })
  if (result.type === 'attraction' && result.attraction_id) {
    const a = attractions.value.find(x => x.id === result.attraction_id)
    if (a) { tourAttraction(a); return }
  }
  // P0-11：图片自由问答 → 直接展示视觉模型回答（后端已落 interaction，input_type='vision'），不再重复走主 LLM
  if (result.type === 'qa' && result.description) {
    messages.value.push({ role: 'assistant', content: result.description, interactionId: result.interaction_id || null, kind: 'chat', includeInContext: true })
    return
  }
  if (result.ocr_text) {
    inputText.value = result.ocr_text
    return
  }
  if (result.suggested_question) {
    onChatSend(result.suggested_question, { inputType: 'vision' })
    return
  }
  // 未知 / 失败：把说明作为助手消息展示
  const note = result.description || result.note
  if (note) {
    messages.value.push({ role: 'assistant', content: note, interactionId: null, kind: 'chat', includeInContext: true })
  }
}

// ===== 预设问题 → 路线/景点相关直接讲解（按攻略播报），其余走 AI 问答 =====
function onPresetTour(p) {
  if (p.type === 'attraction') {
    const a = attractions.value.find(x => x.id === p.id)
    if (a) { tourAttraction(a); return }
  } else if (p.type === 'route') {
    const r = routes.value.find(x => x.id === p.id)
    if (r) { tourRoute({ route: r }); return }
  }
  onChatSend(p.label || '')
}

// ===== 专属路线生成 =====
async function generateRoute(payload) {
  customizing.value = true
  try {
    const r = await planRoute(payload)
    customRoute.value = r
    showCustomizer.value = false
    tourRoute({ route: r, custom: true })
  } catch (e) {
    alert('专属路线生成失败：' + e.message)
  } finally {
    customizing.value = false
  }
}

// ===== 语音（对话交互：识别到一句话即自动提问，问答/展览一致）=====
function onVoiceResult(final) {
  // 小景正在思考/播报（含数字人真实说话中）时忽略新语音，避免音箱回声被麦克风拾取导致自触发
  if (speaking.value || loading.value || avatarSpeaking.value) return
  // P0-12：语音提问行为埋点
  track('voice_send', { payload: { text: final } })
  onChatSend(final, { inputType: 'voice' })
}
function toggleMic() {
  if (speech.listening.value) { speech.stop(); return }
  // P0-10：按当前界面语言设置识别语言（zh-CN / en-US）
  speech.start({ language: i18n.language.value, onResult: onVoiceResult, onError: (e) => alert('语音识别不可用：' + e + '，请改用文字输入。') })
}

// ===== 展览模式（全屏，横竖屏自适应，默认语音交互）=====
async function toggleExhibition() {
  exhibition.value = !exhibition.value
  if (exhibition.value) {
    try { await document.documentElement.requestFullscreen?.() } catch (e) { /* 全屏被浏览器拦截则忽略 */ }
    // P0-10：展览模式也按当前界面语言识别
    if (speech.supported.value && !speech.listening.value) speech.start({ language: i18n.language.value, onResult: onVoiceResult, onError: () => {} })
  } else {
    if (document.fullscreenElement) { try { await document.exitFullscreen() } catch (e) {} }
    speech.stop()
  }
}
function onFsChange() {
  if (!document.fullscreenElement && exhibition.value) {
    exhibition.value = false
    speech.stop()
  }
}
onMounted(() => {
  document.addEventListener('fullscreenchange', onFsChange)
  loadWeatherTemp()  // TASK-10 高温补水提醒的实时温度
  // P0-12：页面打开埋点（demo 标记由 trackEvent 自动注入）
  track('page_open', { payload: { lang: i18n.language.value } })
  // TASK-11 数字人配置 + TASK-13.3 多语言：英文模式用内置英文欢迎词，中文模式用后台配置
  if (i18n.language.value === 'en-US') setWelcome(i18n.welcome())
  else loadAvatarConfig()
  startSession(i18n.language.value)  // 启动会话（sessionStorage 持久），TASK-13.3 带语言
  loadScenicData()  // 统一加载景区/路线数据，子组件共享同一份
  fetchFacilities().then(d => { if (Array.isArray(d)) facilities.value = d }).catch(() => {})  // 设施图层（DEMO）
  // ?tour=景点id 调试钩子：自动讲解该景点（截图验证攻略卡片用）
  const t = new URLSearchParams(location.search).get('tour')
  if (t) {
    const a = attractions.value.find(x => x.id === t) || attractions.value[0]
    if (a) setTimeout(() => tourAttraction(a), 600)
  }
})

// TASK-09：刷新后恢复/校验路线执行会话。
// 专属路线（id=custom）对象不持久化，刷新后无法继续 → 回退 idle；
// 官方路线恢复为 active 并选中对应路线，地图回到当前站。
watch(ready, (v) => {
  if (!v || tourSession.status === 'idle') return
  if (tourSession.status === 'active' && tourSession.routeId === 'custom') {
    resetTour()
    return
  }
  const target = routes.value.find(r => r.id === tourSession.routeId)
  if (tourSession.status === 'active' && target) {
    currentRoute.value = target
    mode.value = 'tour'
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFsChange)
  demo.stopSim()  // TASK-14 demo：清理模拟位置定时器
  geo.stop()      // P0-6：卸载时停止真实定位（随行讲解生命周期闭环）
})

// ===== 顶部操作 =====
function interruptAll() {
  if (dhRef.value) dhRef.value.interrupt()
  if (currentAudio) { currentAudio.pause(); currentAudio = null }
  speech.stop()
}
function handleDisconnect() {
  if (confirm('确定断开连接？')) { if (dhRef.value) dhRef.value.destroy() }
}
// TASK-11 反馈提交：POST /api/feedback（形成运营闭环）
async function handleFeedbackSubmit(payload) {
  // P0-12：反馈行为埋点（携带评分与点踩标签）
  track('feedback', { payload: { rating: payload?.rating, tags: payload?.tags || [] } })
  try {
    await submitFeedback(payload)
  } catch (e) { /* 反馈失败静默（不打断游客操作） */ }
}
</script>

<template>
  <div class="page-canvas" :class="{ exhibition }">
    <!-- 左上角：标题 + 天气 -->
    <WeatherBar class="pos-weather" />

    <!-- TASK-14 demo 模式标识：仅用于比赛演示，模拟位置/演出/路线进度，不读真实 GPS -->
    <div v-if="demo.isDemo" class="demo-badge" title="仅用于比赛演示：模拟位置/演出临近/路线进度，不读取真实 GPS 与客流">🎬 演示模式</div>

    <!-- TASK-13.2 我的灵山足迹入口 -->
    <button class="pos-footprint fp-btn" :title="'我的灵山足迹'" @click="showFootprint = true">👣</button>

    <!-- 顶部横栏：5 个热门景点卡片 -->
    <AttractionList
      class="pos-attractions"
      :items="attractions"
      :active-id="currentAttraction?.id"
      @tour="tourAttraction"
    />

    <!-- 左中：百度地图（景点 + 设施图层 + 路线执行 + 随行讲解开关） -->
    <MapPanel
      class="pos-map"
      :attractions="attractions"
      :ready="ready"
      :facilities="facilities"
      :facility-type="facilityType"
      :current-location="currentLocation"
      :active-route="currentRoute"
      :tour-session="tourSession"
      :companion-enabled="companionEnabled"
      @facility-type="facilityType = $event"
      @toggle-companion="toggleCompanion"
      @highlight-facility="onHighlightFacility"
      @next-stop="onNextStop"
      @restart-route="onRestartRoute"
    />

    <!-- 左下角：游览路线（含路线执行状态）+ 生成专属路线 -->
    <RouteCardRow
      class="pos-routes"
      :routes="routes"
      :current-route-id="currentRouteId"
      :custom-route="customRoute"
      :tour-session="tourSession"
      @tour="tourRoute"
      @open-customize="showCustomizer = true"
      @start-route="onStartRoute"
      @continue-route="onContinueRoute"
    />

    <!-- 中间：数字人（问答/讲解双模式 + 展览模式） -->
    <DigitalHuman
      ref="dhRef"
      class="pos-dh"
      :mode="mode"
      :context-label="contextLabel"
      :exhibition="exhibition"
      @mode="handleMode"
      @toggle-exhibition="toggleExhibition"
      @interrupt="interruptAll"
      @speaking-change="v => (avatarSpeaking = v)"
    />

    <!-- 右侧 1/3：文字问答框（语音 + 图片输入） -->
    <ChatPanel
      v-model="inputText"
      class="pos-chat"
      :disabled="loading"
      :messages="messages"
      :mode="mode"
      :guide="currentGuide"
      :listening="speech.listening.value"
      :interim="speech.interim.value"
      :mic-supported="speech.supported.value"
      :auto-ask="true"
      :language="i18n.language.value"
      :presets="i18n.presets()"
      @send="onChatSend"
      @tour="onPresetTour"
      @vision="onVisionResult"
      @mic-toggle="toggleMic"
      @feedback-submit="handleFeedbackSubmit"
      @disconnect="handleDisconnect"
      @notice-action="onNoticeAction"
      @language-change="handleLangChange"
    />

    <!-- 专属路线生成弹层 -->
    <RouteCustomizer
      :open="showCustomizer"
      :loading="customizing"
      @close="showCustomizer = false"
      @submit="generateRoute"
    />

    <!-- TASK-13.2 我的灵山足迹弹层（真实事件聚合，非 LLM 猜测） -->
    <FootprintPanel
      :open="showFootprint"
      :session-id="sessionId"
      @close="showFootprint = false"
    />
  </div>
</template>

<style scoped>
/* ===== 单画布绝对定位（桌面横屏默认） ===== */
.pos-weather   { position: absolute; top: 1.2%; left: 1.5%; z-index: 20; }
.pos-attractions { position: absolute; top: 8%; left: 1.5%; width: 44%; z-index: 20; }
.pos-map       { position: absolute; top: 27%; left: 1.5%; width: 22%; height: 37%; z-index: 15; }
.pos-routes    { position: absolute; bottom: 1.5%; left: 1.5%; width: 40%; z-index: 20; max-height: 30%; }
.pos-dh        { position: absolute; top: 1.5%; left: 44%; width: 26%; bottom: 1.5%; z-index: 18; }
.pos-chat      { position: absolute; top: 1.5%; right: 1.5%; width: 27%; bottom: 1.5%; z-index: 20; }

/* TASK-13.2 足迹入口：浮在聊天面板右上角外侧 */
.pos-footprint {
  position: absolute; top: 1.5%; right: calc(27% + 1.5% + 6px); z-index: 30;
  width: 34px; height: 34px; border-radius: 12px; font-size: 16px;
  border: none; cursor: pointer;
  background: rgba(255,255,255,.9); box-shadow: 0 3px 10px rgba(20,60,95,.18);
  transition: transform .15s;
}
.pos-footprint:hover { transform: translateY(-2px); }
@media (max-aspect-ratio: 1/1) { .pos-footprint { right: 4px; top: 2%; } }

/* TASK-14 demo 模式标识：明确标注仅用于比赛演示 */
.demo-badge {
  position: absolute; top: 1.2%; left: 50%; transform: translateX(-50%); z-index: 40;
  background: rgba(20,60,95,.85); color: #FFD66B; font-size: 12px; font-weight: 700;
  padding: 4px 14px; border-radius: 999px; letter-spacing: 1px;
  box-shadow: 0 3px 10px rgba(20,60,95,.3); pointer-events: none;
}

/* 展览模式：数字人大幅放大居中，突出展示 */
.exhibition .pos-dh { left: 44%; width: 27%; top: 6%; bottom: 4%; }
.exhibition .pos-chat { width: 27%; }

/* 中等屏 */
@media (max-width: 1200px) {
  .pos-attractions { width: 44%; }
  .pos-routes { width: 40%; }
  .pos-dh { top: 1.5%; bottom: 1.5%; left: 47%; width: 21%; }
  .pos-chat { width: 28%; }
}

/* 竖屏（含展览模式横竖屏自适应）：上下堆叠 */
@media (max-aspect-ratio: 1/1) {
  .pos-weather { top: 1%; left: 1.5%; }
  .pos-attractions { top: 8%; left: 1.5%; width: 97%; overflow-x: auto; }
  .pos-dh { top: 27%; left: 28%; width: 44%; bottom: auto; height: 34%; }
  .pos-chat { top: auto; bottom: 1%; left: 1.5%; right: 1.5%; width: auto; height: 38%; }
  .pos-map, .pos-routes { display: none; }
}
</style>
