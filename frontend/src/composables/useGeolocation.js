import { ref } from 'vue'

// 定位：仅用于当前游览中的到点讲解、附近设施和路线提示。
// 隐私：默认不把连续 GPS 轨迹上传后端（仅前端本地使用，事件只可记录
// location_enable / attraction_arrival，不记录连续经纬度历史）。
const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator

// 模块级单例状态
const permission = ref('unavailable')   // 'prompt' | 'granted' | 'denied' | 'unavailable'
const enabled = ref(false)              // 定位是否开启
const position = ref(null)              // { lng, lat, accuracy, timestamp }（WGS84）
const error = ref('')
let watchId = null

function _onPos(pos) {
  position.value = {
    lng: pos.coords.longitude,
    lat: pos.coords.latitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  }
  error.value = ''
}

function _onErr(e) {
  error.value = e && e.message ? e.message : '定位失败'
}

async function _checkPermission() {
  if (!supported || !navigator.permissions || !navigator.permissions.query) return 'prompt'
  try {
    const st = await navigator.permissions.query({ name: 'geolocation' })
    return st.state // 'granted' | 'prompt' | 'denied'
  } catch (e) {
    return 'prompt'
  }
}

export function useGeolocation() {
  async function start() {
    if (!supported) {
      error.value = '当前浏览器不支持定位'
      return
    }
    permission.value = await _checkPermission()
    if (permission.value === 'denied') {
      error.value = '定位权限被拒绝，可在浏览器设置中开启'
      return
    }
    if (watchId !== null) return // 已在监听
    watchId = navigator.geolocation.watchPosition(_onPos, _onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    })
    enabled.value = true
  }

  function stop() {
    if (watchId !== null && supported) navigator.geolocation.clearWatch(watchId)
    watchId = null
    enabled.value = false
  }

  return { supported, permission, enabled, position, error, start, stop }
}
