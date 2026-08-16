<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { fetchAttractions } from '../api'

const mapEl = ref(null)
let map = null
let markers = []

onMounted(async () => {
  // 兜底：无 BMapGL（未加载脚本/无 AK）时显示占位文案，不崩溃
  if (typeof BMapGL === 'undefined') {
    mapEl.value.innerHTML = '地图加载中（请配置百度地图 AK）…'
    return
  }
  map = new BMapGL.Map(mapEl.value)
  map.centerAndZoom(new BMapGL.Point(120.087, 31.428), 13)
  map.enableScrollWheelZoom(true)

  try {
    const list = await fetchAttractions()
    list.forEach(a => {
      const mk = new BMapGL.Marker(new BMapGL.Point(a.lng, a.lat))
      mk.setLabel(new BMapGL.Label(a.name, { offset: new BMapGL.Size(14, -24) }))
      map.addOverlay(mk)
      markers.push(mk)
    })
  } catch (e) { /* 后端未启动时忽略 */ }
})

onBeforeUnmount(() => {
  if (map && markers.length) markers.forEach(m => map.removeOverlay(m))
})
</script>

<template>
  <div class="map-panel">
    <div ref="mapEl" class="map-canvas"></div>
    <div class="map-badge">百度地图</div>
  </div>
</template>

<style scoped>
.map-panel {
  position: relative; border-radius: var(--radius); overflow: hidden;
  box-shadow: var(--shadow); flex: 1; min-height: 180px;
  background: #EAF4FB;
}
.map-canvas { width: 100%; height: 100%; min-height: 180px; }
.map-badge {
  position: absolute; left: 8px; bottom: 8px; z-index: 1;
  background: rgba(255,255,255,.9); border-radius: 4px; padding: 2px 8px;
  font-size: 11px; color: var(--text-sub);
}
</style>
