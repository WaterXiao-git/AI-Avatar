// 地理围栏（TASK-10 主动提醒的到点检测）：
// - 进入半径 60m、离开半径 90m，滞回（先进入后须超过 90m 才算离开，避免在边界抖动重复触发）
// - 保存 insideId（当前在哪个 POI 围栏内）+ triggeredIds（本会话已提醒过的 POI，防重复）
// 坐标约定：位置与 POI 均须为同一坐标系（本项目统一 BD09）。
import { distanceMeters } from '../utils/distance.js'

export const ENTER_RADIUS = 60
export const EXIT_RADIUS = 90

const state = { insideId: null, triggeredIds: [] }

export function useGeofence() {
  /**
   * 输入当前位置与 POI 列表，返回进入事件或 null。
   * @returns {null | {event:'enter', poi, distance, isNew}}
   */
  function update(position, pois) {
    if (!position || position.lng == null || !Array.isArray(pois) || !pois.length) return null

    // 找距离最近的 POI
    let nearest = null
    let minD = Infinity
    pois.forEach((p) => {
      if (p.lng == null || p.lat == null) return
      const d = distanceMeters(position.lat, position.lng, p.lat, p.lng)
      if (d < minD) { minD = d; nearest = p }
    })
    if (!nearest) return null

    // 已在围栏内：不动
    if (state.insideId === nearest.id) return null

    if (minD <= ENTER_RADIUS) {
      state.insideId = nearest.id
      const isNew = !state.triggeredIds.includes(nearest.id)
      if (isNew) state.triggeredIds.push(nearest.id)
      return { event: 'enter', poi: nearest, distance: minD, isNew }
    }

    // 滞回离开：当前 inside 的 POI 距离超过 EXIT_RADIUS 才清空
    if (state.insideId) {
      const cur = pois.find(p => p.id === state.insideId)
      if (cur && cur.lng != null) {
        const d = distanceMeters(position.lat, position.lng, cur.lat, cur.lng)
        if (d > EXIT_RADIUS) state.insideId = null
      }
    }
    return null
  }

  function reset() {
    state.insideId = null
    state.triggeredIds = []
  }

  return { ENTER_RADIUS, EXIT_RADIUS, update, reset, state }
}
