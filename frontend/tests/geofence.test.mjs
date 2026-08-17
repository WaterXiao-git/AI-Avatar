// 地理围栏状态机测试：进入/离开滞回/防重复
// 坐标约定：位置与 POI 同一坐标系（本项目 BD09）。测试用 lat 偏移近似米距。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useGeofence, ENTER_RADIUS, EXIT_RADIUS } from '../src/composables/useGeofence.js'

const POI = { id: 'a', name: '灵山大佛', lat: 31.4364, lng: 120.10289 }
const OTHER = { id: 'b', name: '灵山梵宫', lat: 31.43442, lng: 120.10885 }
const METER_LAT = 1 / 111195 // 1m 纬度 ≈ 1/111195 度
const METER_LNG = 1 / (111320 * Math.cos(POI.lat * Math.PI / 180)) // 无锡纬度 1m 经度

function atMetersNorth(p, meters) {
  return { lat: p.lat + meters * METER_LAT, lng: p.lng }
}
function atMetersEast(p, meters) {
  return { lat: p.lat, lng: p.lng + meters * METER_LNG }
}
// 200m 东侧 POI：用于模拟「最近点切换」触发的滞回离开
const B_EAST = { id: 'b2', name: '东侧点', lat: POI.lat, lng: POI.lng + 200 * METER_LNG }

test('enter event within 60m radius, isNew true', () => {
  const f = useGeofence()
  f.reset()
  const r = f.update(atMetersNorth(POI, 30), [POI, OTHER])
  assert.ok(r && r.event === 'enter')
  assert.equal(r.poi.id, 'a')
  assert.equal(r.isNew, true)
  assert.ok(r.distance < ENTER_RADIUS)
})

test('no enter beyond 60m', () => {
  const f = useGeofence()
  f.reset()
  const r = f.update(atMetersNorth(POI, 100), [POI, OTHER])
  assert.equal(r, null)
  assert.equal(f.state.insideId, null)
})

test('second enter for same POI is not isNew (dedup)', () => {
  const f = useGeofence()
  f.reset()
  f.update(atMetersEast(POI, 10), [POI, B_EAST])
  assert.equal(f.state.insideId, 'a')
  // 走到 130m 东：b2 成为最近（70m，未入 60m），a 已超 90m → 清空 insideId
  f.update(atMetersEast(POI, 130), [POI, B_EAST])
  assert.equal(f.state.insideId, null)
  // 回到 a：再次进入，isNew=false（防重复提醒）
  const r2 = f.update(atMetersEast(POI, 10), [POI, B_EAST])
  assert.ok(r2 && r2.isNew === false)
})

test('hysteresis: stays inside until a different POI is nearest AND inside POI >90m', () => {
  const f = useGeofence()
  f.reset()
  f.update(atMetersEast(POI, 10), [POI, B_EAST])
  assert.equal(f.state.insideId, 'a')
  // 70m 东：仍以 a 为最近点（70<130），不清空
  const r = f.update(atMetersEast(POI, 70), [POI, B_EAST])
  assert.equal(r, null)
  assert.equal(f.state.insideId, 'a')
  // 130m 东：b2 最近且距 70m（>60 不入场），a 距 130m（>90）→ 触发滞回清空
  f.update(atMetersEast(POI, 130), [POI, B_EAST])
  assert.equal(f.state.insideId, null)
})

test('reset clears state', () => {
  const f = useGeofence()
  f.reset()
  f.update(atMetersNorth(POI, 10), [POI])
  assert.equal(f.state.insideId, 'a')
  f.reset()
  assert.equal(f.state.insideId, null)
  assert.deepEqual(f.state.triggeredIds, [])
})

test('invalid input returns null', () => {
  const f = useGeofence()
  f.reset()
  assert.equal(f.update(null, [POI]), null)
  assert.equal(f.update({ lng: null, lat: null }, [POI]), null)
  assert.equal(f.update(atMetersNorth(POI, 10), []), null)
})

test('radii are exported correctly (60m enter / 90m exit)', () => {
  assert.equal(ENTER_RADIUS, 60)
  assert.equal(EXIT_RADIUS, 90)
})
