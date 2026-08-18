// 最小 CDP 驱动：连接本机 Edge (9224) 的调试端口，用于人工回归冒烟。
// 依赖 Node >= 22 的全局 WebSocket；无需安装 playwright。
const HTTP = 'http://localhost:9224'

export async function newPage(url) {
  const res = await fetch(`${HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  return (await res.json()).webSocketDebuggerUrl
}

export async function listPages() {
  const res = await fetch(`${HTTP}/json/list`)
  return res.json()
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err })
  let seq = 0
  const pending = new Map()
  const handlers = new Map()  // method -> [fn]
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      return
    }
    if (m.method && handlers.has(m.method)) {
      for (const fn of handlers.get(m.method)) {
        try { fn(m.params || {}) } catch (e) { console.error('cdp handler err', e) }
      }
    }
  }
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, fn) {
      if (!handlers.has(method)) handlers.set(method, [])
      handlers.get(method).push(fn)
    },
    async eval(expression, awaitPromise = true) {
      const r = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
      if (r.exceptionDetails) throw new Error('eval exception: ' + (r.exceptionDetails.text || ''))
      return r.result.value
    },
    async sleep(ms) { await new Promise(r => setTimeout(r, ms)) },
    async screenshot(filename) {
      const r = await this.send('Page.captureScreenshot', { format: 'png' })
      const fs = await import('node:fs')
      fs.writeFileSync(filename, Buffer.from(r.data, 'base64'))
      return filename
    },
    close() { try { ws.close() } catch (e) {} },
  }
}

// 驱动单页的便捷封装：注入 $text / $click 等辅助
export async function drivePage(wsUrl) {
  const c = await connect(wsUrl)
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const wait = async (expr, timeout = 15000, interval = 300) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      try { if (await c.eval(expr)) return true } catch (e) {}
      await sleep(interval)
    }
    return false
  }
  return { c, sleep, wait }
}
