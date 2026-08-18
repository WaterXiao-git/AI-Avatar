// distanceMeters / findNearestFacilities 纯函数测试（Haversine）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanceMeters, findNearestFacilities } from '../src/utils/distance.js'

test('same point is 0', () => {
  assert.equal(distanceMeters(31.4364, 120.10289, 31.4364, 120.10289), 0)
})

test('1 degree of latitude is ~111.2 km', () => {
  const d = distanceMeters(0, 0, 1, 0)
  assert.ok(d > 110000 && d < 112000, `actual: ${d}`)
})

test('symmetric', () => {
  const a = distanceMeters(31.4364, 120.10289, 31.43442, 120.10885)
  const b = distanceMeters(31.43442, 120.10885, 31.4364, 120.10289)
  assert.ok(Math.abs(a - b) < 1e-6)
})

test('Wuxi real attractions: dashan-fo to fan-gong is ~0.6 km apart', () => {
  const d = distanceMeters(31.4364, 120.10289, 31.43442, 120.10885)
  assert.ok(d > 500 && d < 800, `actual: ${d}`)
})

test('60m threshold boundary works: 50m < 60m, 100m > 60m', () => {
  // 1m latitude ≈ 1/111195 deg at equator-equivalent precision for tiny offsets
  const poi = { lat: 31.4364, lng: 120.10289 }
  const near = { lat: poi.lat + 50 / 111195, lng: poi.lng }
  const far = { lat: poi.lat + 100 / 111195, lng: poi.lng }
  assert.ok(distanceMeters(poi.lat, poi.lng, near.lat, near.lng) < 60)
  assert.ok(distanceMeters(poi.lat, poi.lng, far.lat, far.lng) > 60)
})

// ===== R2-03：findNearestFacilities —— 最近设施必须由程序真实计算距离 =====
const FACILITIES = [
  { id: 'toilet-001', name: 'DEMO 卫生间·大佛旁', type: 'toilet', lng: 120.1028, lat: 31.4372 },
  { id: 'toilet-002', name: 'DEMO 卫生间·梵宫东', type: 'toilet', lng: 120.1098, lat: 31.4344 },
  { id: 'toilet-003', name: 'DEMO 卫生间·九龙灌浴', type: 'toilet', lng: 120.1066, lat: 31.4312 },
  { id: 'food-001', name: 'DEMO 餐厅·梵宫素斋', type: 'food', lng: 120.1091, lat: 31.434 },
  { id: 'medical-001', name: 'DEMO 急救点', type: 'medical', lng: 120.106, lat: 31.4332 },
  { id: 'parking-001', name: 'DEMO 停车场·正门', type: 'parking', lng: 120.099, lat: 31.4305 },
]

test('findNearestFacilities picks the truly nearest facility of a type', () => {
  // 游客位置靠近大佛（toilet-001 最近）
  const near = findNearestFacilities(31.4364, 120.10289, FACILITIES, 'toilet')
  assert.ok(near, 'should find a toilet')
  assert.equal(near.id, 'toilet-001')
  // 距离必须落在程序计算的真实范围内（Haversine ~89m，不是 LLM 猜的）
  assert.ok(near.distance_m > 60 && near.distance_m < 200, `distance: ${near.distance_m}`)
})

test('findNearestFacilities filters by type and rounds distance', () => {
  const near = findNearestFacilities(31.4364, 120.10289, FACILITIES, 'food')
  assert.equal(near.id, 'food-001')
  assert.equal(Number.isInteger(near.distance_m), true)
})

test('service group aggregates medical/parking/service', () => {
  // 最近的是 medical-001（约 0.47km），而不是被遗漏
  const near = findNearestFacilities(31.4364, 120.10289, FACILITIES, 'service')
  assert.ok(near, 'service 聚合层应命中')
  assert.equal(near.id, 'medical-001')
  assert.equal(near.type, 'medical')
})

test('findNearestFacilities returns null without location or empty list', () => {
  assert.equal(findNearestFacilities(null, null, FACILITIES, 'toilet'), null)
  assert.equal(findNearestFacilities(31.4364, 120.10289, [], 'toilet'), null)
  // 该类型不存在
  assert.equal(findNearestFacilities(31.4364, 120.10289, FACILITIES, 'babycare'), null)
})
