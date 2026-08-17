// 路线执行状态机测试（useTourSession）
// 模块顶层读取 sessionStorage/localStorage，先注入浏览器全局 mock 再动态 import。
import { test, before } from 'node:test'
import assert from 'node:assert/strict'

const mem = new Map()
before(() => {
  globalThis.sessionStorage = {
    getItem: (k) => (mem.has('ss_' + k) ? mem.get('ss_' + k) : null),
    setItem: (k, v) => mem.set('ss_' + k, String(v)),
    removeItem: (k) => mem.delete('ss_' + k),
  }
  globalThis.localStorage = {
    getItem: (k) => (mem.has('ls_' + k) ? mem.get('ls_' + k) : null),
    setItem: (k, v) => mem.set('ls_' + k, String(v)),
    removeItem: (k) => mem.delete('ls_' + k),
  }
  globalThis.location = { search: '' }
  // trackEvent 里的 fetch 在 Node 不存在 → 被 try/catch 吞掉，无需 mock
})

const { useTourSession, navigableStops, isNavigableStop } = await import('../src/composables/useTourSession.js')

function sampleRoute() {
  return {
    id: 'qifu',
    name: '祈福禅悟线',
    stops: [
      { name: '灵山大佛', attractionId: 'ling-dashan-fo' },
      { name: '灵山梵宫', attractionId: 'ling-shan-fan-gong' },
      { name: '天下第一掌', why: '无 POI 坐标' },  // 不可导航：无 attractionId
      { name: '祥符禅寺', attractionId: 'xiang-fu-chan-si' },
    ],
  }
}

function resetStorage() { mem.clear() }

test('isNavigableStop: only stops with attractionId navigate', () => {
  assert.equal(isNavigableStop({ attractionId: 'x' }), true)
  assert.equal(isNavigableStop({ attraction_id: 'x' }), true)
  assert.equal(isNavigableStop({ name: '无POI' }), false)
  assert.equal(isNavigableStop(null), false)
})

test('navigableStops filters to navigable stops only', () => {
  const route = sampleRoute()
  const nav = navigableStops(route)
  assert.equal(nav.length, 3)
  assert.deepEqual(nav.map(s => s.attractionId), ['ling-dashan-fo', 'ling-shan-fan-gong', 'xiang-fu-chan-si'])
})

test('startRoute sets active state', () => {
  resetStorage()
  const { tourSession, startRoute, sessionStateFor } = useTourSession()
  const route = sampleRoute()
  startRoute(route)
  assert.equal(tourSession.status, 'active')
  assert.equal(tourSession.routeId, 'qifu')
  assert.equal(tourSession.currentStopIndex, 0)
  assert.equal(sessionStateFor(route), 'active')
})

test('advanceStop walks to completion over navigable stops only', () => {
  resetStorage()
  const { tourSession, startRoute, advanceStop } = useTourSession()
  const route = sampleRoute()
  startRoute(route)
  // 3 个可导航站：advanceStop 前进两次仍未完成（当前站 0→1→2）
  advanceStop(route)
  assert.equal(tourSession.currentStopIndex, 1)
  assert.equal(tourSession.status, 'active')
  advanceStop(route)
  assert.equal(tourSession.currentStopIndex, 2)
  assert.equal(tourSession.status, 'active')
  // 最后一次 advance → completed
  advanceStop(route)
  assert.equal(tourSession.status, 'completed')
  // completed 后不再前进
  advanceStop(route)
  assert.equal(tourSession.currentStopIndex, 2)
})

test('sessionStateFor returns idle for other routes', () => {
  resetStorage()
  const { tourSession, reset, sessionStateFor } = useTourSession()
  reset()  // 单例可能残留上一用例的 completed 状态
  assert.equal(tourSession.status, 'idle')
  assert.equal(sessionStateFor({ id: 'other' }), 'idle')
})

test('reset returns to idle and clears route', () => {
  resetStorage()
  const { tourSession, startRoute, reset } = useTourSession()
  startRoute(sampleRoute())
  assert.equal(tourSession.status, 'active')
  reset()
  assert.equal(tourSession.status, 'idle')
  assert.equal(tourSession.routeId, null)
})
