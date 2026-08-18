// 距离计算：Haversine 公式。
// 输入两边必须已是同一坐标系（如都转成 BD09 或都转成 GCJ02）再比较。
const EARTH_RADIUS_M = 6371000
const RAD = Math.PI / 180

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * RAD
  const dLng = (lng2 - lng1) * RAD
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

// R2-03：找离 (lat, lng) 最近的设施。距离必须由程序用 Haversine 计算，禁止 LLM 估算。
// type 为设施分类；'service' 是聚合层（游客服务/急救/母婴/停车，与 MapPanel SERVICE_TYPES 一致）。
// 返回 { id, name, type, distance_m } | null。
const SERVICE_GROUP = ['service', 'medical', 'babycare', 'parking']

function expandType(type) {
  if (type === 'service') return SERVICE_GROUP
  return type ? [type] : null
}

export function findNearestFacilities(lat, lng, facilities, type) {
  if (lat == null || lng == null || !Array.isArray(facilities) || !facilities.length) return null
  const types = expandType(type)
  let best = null
  let bestDist = Infinity
  for (const f of facilities) {
    if (!f || f.lat == null || f.lng == null) continue
    if (types && !types.includes(f.type)) continue
    const d = distanceMeters(lat, lng, f.lat, f.lng)
    if (d < bestDist) { bestDist = d; best = f }
  }
  if (!best) return null
  return { id: best.id, name: best.name, type: best.type, distance_m: Math.round(bestDist) }
}
