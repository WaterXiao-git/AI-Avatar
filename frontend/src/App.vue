<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import WeatherBar from './components/WeatherBar.vue'
import AttractionList from './components/AttractionList.vue'
import MapPanel from './components/MapPanel.vue'
import DigitalHuman from './components/DigitalHuman.vue'
import ChatPanel from './components/ChatPanel.vue'
import RouteCardRow from './components/RouteCardRow.vue'
import RouteCustomizer from './components/RouteCustomizer.vue'
import { useChat } from './composables/useChat'
import { useSpeech } from './composables/useSpeech'
import { planRoute } from './api'
import { FALLBACK_ROUTES, FALLBACK_ATTRACTIONS } from './data/fallback'
import { getGuide } from './data/guides'

const dhRef = ref(null)
const { messages, loading, speaking, ask, setSpeakHandler } = useChat()
const speech = useSpeech()
const inputText = ref('')

// ===== 模式与上下文 =====
const mode = ref('qa')               // qa 问答 / tour 讲解
const currentAttraction = ref(null)
const currentRoute = ref(FALLBACK_ROUTES[0])  // 默认推荐路线：祈福禅悟线
const customRoute = ref(null)
const currentGuide = ref(null)       // 当前讲解景点的攻略卡片内容
const showCustomizer = ref(false)
const customizing = ref(false)
const exhibition = ref(false)

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
  // 兜底：Edge-TTS 播放
  currentAudio = new Audio('/api/tts?text=' + encodeURIComponent(text))
  const audio = currentAudio
  return new Promise((resolve) => {
    audio.onended = resolve; audio.onerror = resolve; audio.play()
  })
}
setSpeakHandler(speakText)

function resetIdle() {
  clearTimeout(idleTimer)
  // 90s 空闲自动断开：魔珐按会话+在线时长计费，缩短挂机时间省积分
  idleTimer = setTimeout(() => { if (dhRef.value && !speaking.value) dhRef.value.destroy() }, 90000)
}
resetIdle()

// ===== 讲解模式：自动播报 =====
function narrate(text) {
  messages.value.push({ role: 'assistant', content: text })
  return speakText(text)
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
    narrate(`【${route.name}】${route.desc}。共${route.spots}个景点、约${route.km}公里${route.hours}小时。推荐：${route.tags.join('、')}。`)
  }
}

function handleMode(m) {
  mode.value = m
  if (m === 'tour' && !currentAttraction.value && !currentRoute.value) {
    tourRoute({ route: FALLBACK_ROUTES[0] })  // 无上下文时默认讲解官方推荐线
  }
}

// ===== 问答 =====
function onChatSend(text) {
  mode.value = 'qa'
  currentAttraction.value = null
  currentGuide.value = null
  ask(text)
}

// ===== 预设问题 → 路线/景点相关直接讲解（按攻略播报），其余走 AI 问答 =====
function onPresetTour(p) {
  if (p.type === 'attraction') {
    const a = FALLBACK_ATTRACTIONS.find(x => x.id === p.id)
    if (a) { tourAttraction(a); return }
  } else if (p.type === 'route') {
    const r = FALLBACK_ROUTES.find(x => x.id === p.id)
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
  // 小景正在思考/播报时忽略新语音，避免音箱回声被麦克风拾取导致自触发
  if (speaking.value || loading.value) return
  onChatSend(final)
}
function toggleMic() {
  if (speech.listening.value) { speech.stop(); return }
  speech.start({ onResult: onVoiceResult, onError: (e) => alert('语音识别不可用：' + e + '，请改用文字输入。') })
}

// ===== 展览模式（全屏，横竖屏自适应，默认语音交互）=====
async function toggleExhibition() {
  exhibition.value = !exhibition.value
  if (exhibition.value) {
    try { await document.documentElement.requestFullscreen?.() } catch (e) { /* 全屏被浏览器拦截则忽略 */ }
    if (speech.supported.value && !speech.listening.value) speech.start({ onResult: onVoiceResult, onError: () => {} })
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
  // ?tour=景点id 调试钩子：自动讲解该景点（截图验证攻略卡片用）
  const t = new URLSearchParams(location.search).get('tour')
  if (t) {
    const a = FALLBACK_ATTRACTIONS.find(x => x.id === t) || FALLBACK_ATTRACTIONS[0]
    if (a) setTimeout(() => tourAttraction(a), 600)
  }
})
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFsChange))

// ===== 顶部操作 =====
function interruptAll() {
  if (dhRef.value) dhRef.value.interrupt()
  if (currentAudio) { currentAudio.pause(); currentAudio = null }
  speech.stop()
}
function handleDisconnect() {
  if (confirm('确定断开连接？')) { if (dhRef.value) dhRef.value.destroy() }
}
function handleFeedback() { alert('感谢反馈！') }
</script>

<template>
  <div class="page-canvas" :class="{ exhibition }">
    <!-- 左上角：标题 + 天气 -->
    <WeatherBar class="pos-weather" />

    <!-- 顶部横栏：5 个热门景点卡片 -->
    <AttractionList
      class="pos-attractions"
      :active-id="currentAttraction?.id"
      @tour="tourAttraction"
    />

    <!-- 左中：百度地图 -->
    <MapPanel class="pos-map" />

    <!-- 左下角：游览路线 + 生成专属路线 -->
    <RouteCardRow
      class="pos-routes"
      :current-route-id="currentRouteId"
      :custom-route="customRoute"
      @tour="tourRoute"
      @open-customize="showCustomizer = true"
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
      @send="onChatSend"
      @tour="onPresetTour"
      @mic-toggle="toggleMic"
      @feedback="handleFeedback"
      @disconnect="handleDisconnect"
    />

    <!-- 专属路线生成弹层 -->
    <RouteCustomizer
      :open="showCustomizer"
      :loading="customizing"
      @close="showCustomizer = false"
      @submit="generateRoute"
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
