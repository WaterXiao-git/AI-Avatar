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
