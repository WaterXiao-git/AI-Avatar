// isLiveLocation 纯函数测试（R3-02 位置有效性：定位关闭/坐标缺失都不得算作实时位置）
// shouldUseLocation（FIX-FINAL-01）：只有「随行讲解」ON 才允许启用定位
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLiveLocation, shouldUseLocation } from '../src/utils/location.js'

test('定位未开启时，即使残留旧坐标也不算有效位置', () => {
  assert.equal(isLiveLocation(false, { lng: 120.0855, lat: 31.427 }), false)
})

test('定位开启且坐标完整才算有效位置', () => {
  assert.equal(isLiveLocation(true, { lng: 120.0855, lat: 31.427 }), true)
})

test('定位开启但坐标为 null 不算', () => {
  assert.equal(isLiveLocation(true, null), false)
})

test('定位开启但 lat/lng 缺省不算', () => {
  assert.equal(isLiveLocation(true, { lng: null, lat: 31.427 }), false)
  assert.equal(isLiveLocation(true, { lng: 120.0855, lat: undefined }), false)
})

test('随行讲解 OFF → 不允许启用定位（GPS / demo 模拟都不启动）', () => {
  assert.equal(shouldUseLocation(false), false)
})

test('随行讲解 ON → 才允许启用定位', () => {
  assert.equal(shouldUseLocation(true), true)
})

test('随行讲解 OFF 时，即使残留坐标也不算实时位置（无“偷偷跑 GPS”的假状态）', () => {
  assert.equal(isLiveLocation(shouldUseLocation(false), { lng: 120.0855, lat: 31.427 }), false)
  assert.equal(isLiveLocation(shouldUseLocation(true), { lng: 120.0855, lat: 31.427 }), true)
})
