// CDP 页面录屏工具 v3（事件驱动 + 解除节流）
// 用法: node screen_rec.cjs <pageId> <outdir> [ackMs] [quality]
//   - 先解除后台节流（setIdleOverride / setFocusEmulationEnabled / lifecycle active），
//     再 Page.startScreencast 逐帧抓 JPEG -> outdir/f_XXXXX.jpg + frames.tsv(file,ts_ms)
//   - ackMs 控制帧率上限（约 1/ackMs fps）；页面静止时自动无帧
//   - 检测 outdir/.stop 后停止
const WebSocket = globalThis.WebSocket
const PAGE = process.argv[2]
const OUT = process.argv[3]
const ACK_MS = parseInt(process.argv[4] || '40', 10)
const QUALITY = parseInt(process.argv[5] || '85', 10)
const MAX_MS = 900000

const fs = require('fs')
fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) if (/^f_\d+\.jpg$/.test(f) || f === 'frames.tsv') fs.unlinkSync(OUT + '/' + f)
const stopFile = OUT + '/.stop'
try { fs.unlinkSync(stopFile) } catch (e) {}

let frameCount = 0
const tsv = fs.openSync(OUT + '/frames.tsv', 'w')
fs.writeSync(tsv, 'file\tts_ms\n')

async function main() {
  const list = await (await fetch('http://localhost:9224/json/list')).json()
  const tab = list.find(t => t.id.startsWith(PAGE))
  if (!tab) throw new Error('page not found: ' + PAGE)
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return }
    if (msg.method === 'Page.screencastFrame') {
      const { data, sessionId, metadata } = msg.params
      const fname = 'f_' + String(frameCount).padStart(5, '0') + '.jpg'
      fs.writeFileSync(OUT + '/' + fname, Buffer.from(data, 'base64'))
      fs.writeSync(tsv, fname + '\t' + (metadata?.timestamp || 0) + '\n')
      frameCount++
      setTimeout(() => {
        ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId } }))
      }, ACK_MS)
    }
  }
  const send = (m, p = {}) => new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method: m, params: p }))
  })
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  await send('Runtime.enable')
  await send('Page.enable')
  // 解除节流：标签页已由 Target.activateTarget 激活，这里再强制浏览器不休眠
  try { await send('Emulation.setIdleOverride', { isUserActive: true }) } catch (e) {}
  try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }) } catch (e) {}
  try { await send('Page.setWebLifecycleState', { state: 'active' }) } catch (e) {}
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  await send('Page.startScreencast', { format: 'jpeg', quality: QUALITY, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  console.log('recording started ->', OUT)

  const startedAt = Date.now()
  const tick = setInterval(() => {
    if (fs.existsSync(stopFile) || Date.now() - startedAt > MAX_MS) {
      clearInterval(tick)
      try { send('Page.stopScreencast') } catch (e) {}
      setTimeout(() => {
        fs.closeSync(tsv)
        console.log('recording stopped, frames:', frameCount)
        process.exit(0)
      }, 300)
    }
  }, 200)
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
