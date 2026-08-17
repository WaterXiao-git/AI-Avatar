<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { fetchAttractions } from '../api'
import { FALLBACK_ATTRACTIONS } from '../data/fallback'

const mapEl = ref(null)
let map = null
let markers = []

// 编号彩色圆点图标（SVG data URI，无需额外图片资源）
const DOT_COLORS = ['#2E7DCF', '#7C5CE0', '#E07C4A', '#2FA878', '#C0392B', '#D79B2B', '#3B8FA3', '#8B5E3C', '#5B7DB1', '#A34B8E']
function makeIcon(idx) {
  const s = 28
  const c = DOT_COLORS[idx % DOT_COLORS.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="${c}" stroke="#ffffff" stroke-width="2"/>
    <text x="${s / 2}" y="${s / 2 + 4}" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${idx + 1}</text>
  </svg>`
  return new BMapGL.Icon('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new BMapGL.Size(s, s), { anchor: new BMapGL.Size(s / 2, s / 2) })
}

function addMarkers(list) {
  list.forEach((a, i) => {
    const pt = new BMapGL.Point(a.lng, a.lat)
    const mk = new BMapGL.Marker(pt, { icon: makeIcon(i) })
    // 名称标签默认隐藏，悬停显示，避免点位密集时文字重叠
    const label = new BMapGL.Label(a.name, {
      position: pt,
      offset: new BMapGL.Size(12, -8),
    })
    label.setStyle({
      color: '#2A4560', fontSize: '12px', fontWeight: '600',
      background: 'rgba(255,255,255,.94)', border: '1px solid rgba(140,190,225,.7)',
      borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap',
    })
    label.setZIndex(999)
    mk.setLabel(label)
    label.hide()
    mk.addEventListener('mouseover', () => label.show())
    mk.addEventListener('mouseout', () => label.hide())
    map.addOverlay(mk)
    markers.push(mk)
  })
}

onMounted(async () => {
  // 兜底：无 BMapGL（未加载脚本/无 AK）时显示占位文案，不崩溃
  if (typeof BMapGL === 'undefined') {
    mapEl.value.innerHTML = '地图加载中（请配置百度地图 AK）…'
    return
  }
  map = new BMapGL.Map(mapEl.value)
  map.enableScrollWheelZoom(true)

  let list = FALLBACK_ATTRACTIONS
  try { list = await fetchAttractions() } catch (e) { /* 后端未启动用兜底数据 */ }
  addMarkers(list)

  // 视野自适应全部真实点位（灵山胜境中心约 120.106, 31.432），带边距防止标记被裁剪
  map.setViewport(list.map(a => new BMapGL.Point(a.lng, a.lat)), { padding: 40 })
})

onBeforeUnmount(() => {
  if (map && markers.length) markers.forEach(m => map.removeOverlay(m))
})
</script>

<template>
  <div class="map-panel glass">
    <div class="map-head">
      <span class="map-title">🗺️ 景区地图</span>
      <span class="map-hint">悬停点位查看名称</span>
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
  padding: 8px 12px;
  background: linear-gradient(90deg, rgba(226,243,253,.9), rgba(255,255,255,.7));
  border-bottom: 1px solid rgba(140,190,225,.4);
}
.map-title { font-size: 13px; font-weight: 700; color: #2A4560; }
.map-hint { font-size: 11px; color: #7B93A9; }
.map-canvas { flex: 1; width: 100%; min-height: 120px; background: #EAF4FB; }
</style>
