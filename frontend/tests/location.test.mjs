// isLiveLocation 纯函数测试（R3-02 位置有效性：定位关闭/坐标缺失都不得算作实时位置）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLiveLocation } from '../src/utils/location.js'

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
