// TASK-14 比赛 Demo 模式：仅当 URL 带 ?demo=1 时启用。
// - 模拟位置：沿路线景点坐标循环移动（WGS84），供地图「我的位置」、LBS 到点/接近/演出规则触发
// - 模拟演出临近：注入「下一场演出前 10 分钟」的模拟时钟，让演出提醒在演示中稳定出现
// - 明确仅用于比赛演示：界面显示「演示模式」标识，绝不伪装真实 GPS/客流数据
import { ref } from 'vue'
import { distanceMeters } from '../utils/distance'

export const isDemo = new URLSearchParams(location.search).has('demo')

// 模块级单例：demo 模拟位置（BD09 景点坐标，沿路线循环移动，每 stepMs 停一站触发 LBS 规则链）
const position = ref(null)
const active = ref(false)
let timer = null
function startSim(coords, stepMs = 8000) {
  stopSim()
  if (!isDemo || !coords || !coords.length) return
  let i = 0
  position.value = coords[0]
  active.value = true
  timer = setInterval(() => {
    i = (i + 1) % coords.length
    position.value = coords[i]
  }, stepMs)
}
function stopSim() {
  if (timer) clearInterval(timer)
  timer = null
  active.value = false
}

// 解析 showTime（"平日 10:00 / 11:30 ..."）中的 HH:MM 分钟数
function parseMinutes(showTime) {
  if (!showTime) return []
  const out = []
  const re = /(\d{1,2}):(\d{2})/g
  let m
  while ((m = re.exec(showTime)) !== null) {
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10)
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) out.push(h * 60 + min)
  }
  return out
}

// demo 时钟：把「当前时间」固定在最近有演出景点的「当天第一场演出前 10 分钟」，
// 保证 showNotice 的 0~30 分钟窗口命中，演示演出临近提醒。
function demoNowProvider(positionGetter, attractionsGetter) {
  return () => {
    if (!isDemo) return new Date()
    const pos = positionGetter ? positionGetter() : null
    if (!pos || pos.lng == null) return new Date()
    const list = (attractionsGetter ? attractionsGetter() : []) || []
    let best = null, bd = Infinity
    for (const a of list) {
      if (!a.showTime || a.lng == null) continue
      const d = distanceMeters(pos.lat, pos.lng, a.lat, a.lng)
      if (d < bd) { bd = d; best = a }
    }
    if (!best) return new Date()
    const mins = parseMinutes(best.showTime).sort((x, y) => x - y)
    if (!mins.length) return new Date()
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setMinutes(mins[0] - 10)   // 第一场演出前 10 分钟
    return d
  }
}

export function useDemo() {
  return { isDemo, position, active, startSim, stopSim, demoNowProvider }
}
