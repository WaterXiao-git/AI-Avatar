<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

// 景点与设施数据由 App 统一加载后传入
const props = defineProps({
  attractions: { type: Array, default: () => [] },
  ready: { type: Boolean, default: false },
  facilities: { type: Array, default: () => [] },   // 公共设施（DEMO 数据）
  facilityType: { type: String, default: 'attraction' }, // attraction | toilet | food | entrance | service
  currentLocation: { type: Object, default: null },  // {lng, lat}（已转 BD09）
  activeRoute: { type: Object, default: null },      // 当前路线（TASK-08 后有 stops 可画线）
  routeProgress: { type: Object, default: null },    // 路线进度（随行讲解用）
  companionEnabled: { type: Boolean, default: false },
  tourSession: { type: Object, default: null },      // TASK-09 路线执行状态（useTourSession 单例）
})
const emit = defineEmits(['toggle-companion', 'facility-type', 'highlight-facility', 'next-stop', 'restart-route'])

// TASK-09：当前路线是否正处于执行中/已完成（用于地图执行视图）
const tourActive = computed(() => {
  const ts = props.tourSession; const r = props.activeRoute
  return !!(ts && r && ts.routeId === (r.id || 'custom') && ts.status === 'active')
})
const tourCompleted = computed(() => {
  const ts = props.tourSession; const r = props.activeRoute
  return !!(ts && r && ts.routeId === (r.id || 'custom') && ts.status === 'completed')
})
const navStops = computed(() =>
  (props.activeRoute && Array.isArray(props.activeRoute.stops) ? props.activeRoute.stops : [])
    .filter(s => s && (s.attractionId || s.attraction_id)))
const tourBarLabel = computed(() => {
  const n = navStops.value
  if (!n.length) return '路线执行中'
  const cur = n[props.tourSession.currentStopIndex]
  return `第${props.tourSession.currentStopIndex + 1}/${n.length}站 · ${cur?.name || ''}`
})

const mapEl = ref(null)
let map = null

// Overlay 状态拆分：按图层分类管理，统一清理后按需重建
let attractionMarkers = []
let facilityMarkers = []
let routeMarkers = []
let routePolyline = null
let locationMarker = null

// 图层分类（地图头部按钮）
const LAYERS = [
  { key: 'attraction', label: '景点' },
  { key: 'toilet', label: '🚻' },
  { key: 'food', label: '🍜' },
  { key: 'entrance', label: '🚪' },
  { key: 'service', label: '服务' },
]
// 「服务」分类聚合：游客服务 / 急救 / 母婴 / 停车
const SERVICE_TYPES = ['service', 'medical', 'babycare', 'parking']

const FACILITY_STYLE = {
  toilet:   { emoji: '🚻', color: '#3B8FA3' },
  food:     { emoji: '🍜', color: '#D79B2B' },
  entrance: { emoji: '🚪', color: '#2FA878' },
  service:  { emoji: '🛎️', color: '#7C5CE0' },
  medical:  { emoji: '🚑', color: '#C0392B' },
  babycare: { emoji: '🍼', color: '#FF7BAC' },
  parking:  { emoji: '🅿️', color: '#5B7DB1' },
}

const DOT_COLORS = ['#2E7DCF', '#7C5CE0', '#E07C4A', '#2FA878', '#C0392B', '#D79B2B', '#3B8FA3', '#8B5E3C', '#5B7DB1', '#A34B8E']

function iconFromSvg(svg, s) {
  return new BMapGL.Icon('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new BMapGL.Size(s, s), { anchor: new BMapGL.Size(s / 2, s / 2) })
}

function makeAttractionIcon(idx) {
  const s = 28
  const c = DOT_COLORS[idx % DOT_COLORS.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="${c}" stroke="#ffffff" stroke-width="2"/>
    <text x="${s / 2}" y="${s / 2 + 4}" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${idx + 1}</text>
  </svg>`
  return iconFromSvg(svg, s)
}

function makeFacilityIcon(type) {
  const s = 30
  const st = FACILITY_STYLE[type] || FACILITY_STYLE.service
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="${st.color}" stroke="#ffffff" stroke-width="1.5"/>
    <text x="${s / 2}" y="${s / 2 + 5}" font-size="15" text-anchor="middle">${st.emoji}</text>
  </svg>`
  return iconFromSvg(svg, s)
}

function makeLocationIcon() {
  const s = 26
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="#1677FF" stroke="#ffffff" stroke-width="2"/>
    <circle cx="${s / 2}" cy="${s / 2}" r="5" fill="#ffffff"/>
  </svg>`
  return iconFromSvg(svg, s)
}

function makeLabel(text, onClick) {
  const label = new BMapGL.Label(text, { position: null, offset: new BMapGL.Size(14, -6) })
  label.setStyle({
    color: '#2A4560', fontSize: '12px', fontWeight: '600',
    background: 'rgba(255,255,255,.94)', border: '1px solid rgba(140,190,225,.7)',
    borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap',
  })
  label.setZIndex(999)
  label.hide()
  return label
}

// TASK-09：站点编号图标——current 当前站高亮 / next 下一站 / done 已完成打勾 / plain 未到
function makeStopIcon(number, kind) {
  const cfg = {
    current: { size: 34, color: '#2385BB', stroke: 3 },
    next:    { size: 28, color: '#FF8C42', stroke: 2.5 },
    done:    { size: 22, color: '#2FA878', stroke: 2 },
    plain:   { size: 20, color: '#7E95AC', stroke: 2 },
  }[kind] || { size: 20, color: '#7E95AC', stroke: 2 }
  const s = cfg.size
  const content = kind === 'done' ? '✓' : String(number)
  const fs = kind === 'done' ? 13 : Math.round(s * 0.5)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="${cfg.color}" stroke="#ffffff" stroke-width="${cfg.stroke}"/>
    <text x="${s / 2}" y="${s / 2 + fs * 0.35}" font-size="${fs}" font-weight="700" fill="#ffffff" text-anchor="middle">${content}</text>
  </svg>`
  return iconFromSvg(svg, s)
}

// 常显标签（当前站/下一站），不绑定 hover 显隐
function makePinnedLabel(text, color = '#2385BB') {
  const label = new BMapGL.Label(text, { position: null, offset: new BMapGL.Size(18, -10) })
  label.setStyle({
    color: '#16324A', fontSize: '11px', fontWeight: '700',
    background: 'rgba(255,255,255,.96)', border: `1px solid ${color}`,
    borderRadius: '4px', padding: '2px 7px', whiteSpace: 'nowrap',
  })
  label.setZIndex(1000)
  return label
}

function clearAllOverlays() {
  if (map) map.clearOverlays()  // 地图上仅我们添加的 marker/label/polyline
  attractionMarkers = []
  facilityMarkers = []
  routeMarkers = []
  routePolyline = null
  locationMarker = null
}

// ===== 各图层渲染 =====
function renderAttractions(list) {
  list.forEach((a, i) => {
    const pt = new BMapGL.Point(a.lng, a.lat)
    const mk = new BMapGL.Marker(pt, { icon: makeAttractionIcon(i) })
    const label = makeLabel(a.name)
    label.setPosition(pt)
    mk.setLabel(label)
    mk.addEventListener('mouseover', () => label.show())
    mk.addEventListener('mouseout', () => label.hide())
    map.addOverlay(mk)
    attractionMarkers.push(mk)
  })
}

function renderFacilities(list) {
  list.forEach((f) => {
    const pt = new BMapGL.Point(f.lng, f.lat)
    const mk = new BMapGL.Marker(pt, { icon: makeFacilityIcon(f.type) })
    const label = makeLabel(f.name)
    label.setPosition(pt)
    mk.setLabel(label)
    mk.addEventListener('mouseover', () => label.show())
    mk.addEventListener('mouseout', () => label.hide())
    // 点击设施：上报给 App（AI 联动 / 信息展示）
    mk.addEventListener('click', () => emit('highlight-facility', f))
    map.addOverlay(mk)
    facilityMarkers.push(mk)
  })
}

function renderRouteLayer() {
  const route = props.activeRoute
  const stops = route && Array.isArray(route.stops) ? route.stops : null
  if (!stops || !stops.length) return
  // 路线站点坐标从景点数据解析（route.stops 为 {attractionId, stayMinutes}，TASK-08 结构；
  // AI 专属路线为 {attraction_id, name, why}，两种 key 都兼容）
  const ts = props.tourSession
  const active = !!(ts && ts.routeId === (route.id || 'custom') && ts.status === 'active')
  const completed = !!(ts && ts.routeId === (route.id || 'custom') && ts.status === 'completed')
  const pts = []
  stops.forEach((s) => {
    const id = s.attractionId || s.attraction_id
    const a = id && props.attractions.find(x => x.id === id)
    if (a) pts.push({ pt: new BMapGL.Point(a.lng, a.lat), stop: s })
  })
  if (!pts.length) return

  // 游览顺序示意线（非精确步行导航，UI 不宣称「精确步行导航」）
  if (pts.length >= 2) {
    routePolyline = new BMapGL.Polyline(pts.map(p => p.pt), {
      strokeColor: active ? '#2385BB' : '#2E7DCF', strokeWeight: 4, strokeOpacity: 0.7, strokeStyle: 'dashed',
    })
    map.addOverlay(routePolyline)
  }
  // 站点编号 + 当前站高亮 + 已完成打勾 + 当前/下一站常显标签
  pts.forEach(({ pt, stop }, i) => {
    const id = stop.attractionId || stop.attraction_id
    let kind = 'plain'
    if (completed || (ts && ts.completedStopIds.includes(id))) kind = 'done'
    if (active && i === ts.currentStopIndex) kind = 'current'
    const mk = new BMapGL.Marker(pt, { icon: makeStopIcon(i + 1, kind) })
    map.addOverlay(mk)
    routeMarkers.push(mk)
    if (kind === 'current') {
      const label = makePinnedLabel(`📍 当前站：${stop.name || ''}`)
      label.setPosition(pt)
      label.show()
      map.addOverlay(label)
    } else if (active && i === ts.currentStopIndex + 1) {
      const label = makePinnedLabel(`⬇️ 下一站：${stop.name || ''}`, '#FF8C42')
      label.setPosition(pt)
      label.show()
      map.addOverlay(label)
    }
  })
}

function renderLocationLayer() {
  const loc = props.currentLocation
  if (!loc || loc.lng == null || loc.lat == null) return
  locationMarker = new BMapGL.Marker(new BMapGL.Point(loc.lng, loc.lat), { icon: makeLocationIcon() })
  const label = makeLabel('📍 我的位置')
  label.setPosition(new BMapGL.Point(loc.lng, loc.lat))
  locationMarker.setLabel(label)
  label.show()
  map.addOverlay(locationMarker)
}

// ===== 主渲染：按当前分类清空重建 =====
function currentPoints() {
  const t = props.facilityType
  if (t === 'attraction') return props.attractions.map(a => ({ lng: a.lng, lat: a.lat }))
  const list = filteredFacilities(t)
  return list.map(f => ({ lng: f.lng, lat: f.lat }))
}

function filteredFacilities(t) {
  if (!Array.isArray(props.facilities)) return []
  if (t === 'service') return props.facilities.filter(f => SERVICE_TYPES.includes(f.type))
  return props.facilities.filter(f => f.type === t)
}

function renderOverlays() {
  clearAllOverlays()
  const t = props.facilityType
  if (t === 'attraction') {
    renderAttractions(props.attractions)
  } else {
    renderFacilities(filteredFacilities(t))
  }
  renderRouteLayer()
  renderLocationLayer()
  // 视野自适应当前显示的点（带边距）
  const pts = currentPoints().filter(p => p.lng != null)
  if (pts.length) map.setViewport(pts.map(p => new BMapGL.Point(p.lng, p.lat)), { padding: 40 })
}

onMounted(() => {
  if (typeof BMapGL === 'undefined') {
    mapEl.value.innerHTML = '地图加载中（请配置百度地图 AK）…'
    return
  }
  map = new BMapGL.Map(mapEl.value)
  map.enableScrollWheelZoom(true)
  if (props.ready && props.attractions.length) renderOverlays()
})

watch(() => props.ready, (v) => { if (v && map && props.attractions.length) renderOverlays() })
// 分类切换 / 设施数据到位 / 定位 / 路线变化 → 重渲染
watch(() => props.facilityType, () => { if (map) renderOverlays() })
watch(() => props.facilities, () => { if (map && props.facilityType !== 'attraction') renderOverlays() })
watch(() => props.currentLocation, () => { if (map) renderOverlays() })
watch(() => props.activeRoute, () => { if (map) renderOverlays() })
// TASK-09：路线执行状态变化（开始/当前站前进/完成）→ 重绘站点编号与标签
watch(() => props.tourSession?.status, () => { if (map) renderOverlays() })
watch(() => props.tourSession?.currentStopIndex, () => { if (map) renderOverlays() })
watch(() => props.tourSession?.completedStopIds?.length, () => { if (map) renderOverlays() })

onBeforeUnmount(() => clearAllOverlays())
</script>

<template>
  <div class="map-panel glass">
    <div class="map-head">
      <span class="map-title">🗺️ 景区地图</span>
      <button class="comp-btn" :class="{ on: companionEnabled }" @click="emit('toggle-companion')" title="开启后沿路线到点自动讲解">📍 随行讲解</button>
    </div>
    <div class="layer-bar">
      <button v-for="t in LAYERS" :key="t.key" class="layer-btn" :class="{ on: facilityType === t.key }"
        @click="emit('facility-type', t.key)">{{ t.label }}</button>
      <span v-if="facilityType !== 'attraction'" class="demo-badge" title="设施为演示数据，非真实POI">DEMO</span>
    </div>

    <!-- TASK-09 路线执行控制条 -->
    <div v-if="tourActive" class="tour-bar">
      <span class="tour-label">📍 {{ tourBarLabel }}</span>
      <button class="next-btn" @click="emit('next-stop')">下一站 →</button>
    </div>
    <div v-else-if="tourCompleted" class="tour-bar done">
      <span class="tour-label">🎉 路线已完成 · 共 {{ navStops.length }} 站</span>
      <button class="restart-btn" @click="emit('restart-route')">重游</button>
    </div>

    <div ref="mapEl" class="map-canvas"></div>
  </div>
</template>

<style scoped>
.map-panel {
  display: flex; flex-direction: column;
  overflow: hidden; padding: 0;
}
.map-head {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px;
  background: linear-gradient(90deg, rgba(226,243,253,.9), rgba(255,255,255,.7));
  border-bottom: 1px solid rgba(140,190,225,.4);
}
.map-title { font-size: 13px; font-weight: 700; color: #2A4560; }
.comp-btn {
  border: 1px solid #CFE4F2; background: #fff; color: var(--theme-blue);
  font-size: 11px; border-radius: 999px; padding: 3px 10px; cursor: pointer;
}
.comp-btn.on { background: #E3F2FD; border-color: #2385BB; font-weight: 700; }
.layer-bar {
  flex-shrink: 0; display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-bottom: 1px solid rgba(140,190,225,.25);
}
.layer-btn {
  border: 1px solid #CFE4F2; background: #fff; color: #2A4560;
  font-size: 12px; border-radius: 999px; padding: 3px 10px; cursor: pointer;
}
.layer-btn.on { background: #2385BB; color: #fff; border-color: #2385BB; font-weight: 700; }
.demo-badge {
  margin-left: auto; font-size: 10px; font-weight: 800; color: #B7791F;
  background: #FFF7E0; border: 1px solid #F0C96B; border-radius: 4px; padding: 1px 5px;
}
/* TASK-09 路线执行控制条 */
.tour-bar {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 5px 12px; border-bottom: 1px solid rgba(35,133,187,.25);
  background: linear-gradient(90deg, #E8F5FE, #FFF7E0);
}
.tour-bar.done { background: linear-gradient(90deg, #EAF9F0, #F2F6FC); }
.tour-label { font-size: 11px; font-weight: 700; color: #16324A; }
.next-btn {
  border: none; cursor: pointer; flex-shrink: 0;
  background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff;
  font-size: 11px; font-weight: 700; border-radius: 999px; padding: 4px 12px;
}
.next-btn:hover { filter: brightness(1.05); }
.restart-btn {
  border: 1px solid #C6E8D6; background: #fff; color: #2FA878;
  font-size: 11px; font-weight: 700; border-radius: 999px; padding: 4px 10px; cursor: pointer;
}
.map-canvas { flex: 1; width: 100%; min-height: 120px; background: #EAF4FB; }
</style>
