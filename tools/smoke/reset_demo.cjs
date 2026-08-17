// 清空游览会话存储 + 重载演示页到干净状态（TASK-09 会从 localStorage 恢复游览，必须清掉）
const WebSocket = globalThis.WebSocket
async function main() {
  const list = await (await fetch('http://localhost:9224/json/list')).json()
  const tab = list.find(t => t.id.startsWith('EF426E15'))
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let id = 0; const pending = new Map()
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) })
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  await send('Runtime.enable'); await send('Page.enable')
  const cleared = await send('Runtime.evaluate', { expression: `(() => { const ls = localStorage.getItem('lingshan-tour-session'); localStorage.clear(); sessionStorage.clear(); return { hadTour: !!ls, ls, ss: sessionStorage.length }; })()`, returnByValue: true })
  console.log('cleared:', JSON.stringify(cleared.result?.value))
  await send('Page.navigate', { url: 'http://localhost:5276/?demo=1' })
  const dl = Date.now() + 25000
  while (Date.now() < dl) {
    await new Promise(r => setTimeout(r, 1200))
    const r = await send('Runtime.evaluate', { expression: `({ ready: document.readyState, input: !!document.querySelector('.chat-input'), demo: !!document.querySelector('.demo-badge'), cont: !!document.querySelector('.cont-btn') })`, returnByValue: true })
    const v = r.result?.value
    if (v && v.ready === 'complete' && v.input && v.demo) { console.log('RELOADED READY, contBtn=', v.cont); process.exit(0) }
  }
  console.error('TIMEOUT'); process.exit(1)
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
