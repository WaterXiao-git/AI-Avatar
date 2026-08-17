// distanceMeters 纯函数测试（Haversine）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanceMeters } from '../src/utils/distance.js'

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
