// 坐标系转换纯函数测试：境外直通 / 境内偏移量级 / 复合转换
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wgs84ToGcj02, gcj02ToBd09, wgs84ToBd09 } from '../src/utils/geoTransform.js'

test('out-of-China coordinates pass through unchanged', () => {
  // lng=0 / lat=0 明显不在中国境内（lng<72.004）
  assert.deepEqual(wgs84ToGcj02(0, 0), [0, 0])
  // lng=180 越界
  const [l, t] = wgs84ToGcj02(180, 45)
  assert.equal(l, 180)
  assert.equal(t, 45)
})

test('wgs84ToGcj02 offsets China coordinates (east + slight south in Wuxi)', () => {
  const [lng, lat] = wgs84ToGcj02(120.3, 31.5)  // 无锡附近（实测 ≈ 120.3046, 31.4981）
  assert.ok(lng > 120.3, `lng ${lng} should drift east`)
  assert.ok(lat < 31.5, `lat ${lat} drifts south for Wuxi`)
  // 偏移量级：约几十米到两百米，不应离谱
  assert.ok(Math.abs(lng - 120.3) < 0.01, 'east drift < ~1km')
  assert.ok(Math.abs(lat - 31.5) < 0.01, 'south drift < ~1km')
})

test('gcj02ToBd09 adds a further small offset', () => {
  const [lng, lat] = gcj02ToBd09(120.3, 31.5)
  assert.ok(lng > 120.3 && lat > 31.5)
})

test('wgs84ToBd09 composite: Wuxi coordinates stay near source (~1.1km scale)', () => {
  const [lng, lat] = wgs84ToBd09(120.3, 31.5)
  // 实测 BD09(120.3,31.5) ≈ (120.3112, 31.5037)：东偏约 1.1km、北偏约 0.4km。
  // 校验：不能返回原值，也不能飞出所在城市。
  assert.ok(lng > 120.3 && lng < 120.32, `lng: ${lng}`)
  assert.ok(lat > 31.5 && lat < 31.515, `lat: ${lat}`)
})
