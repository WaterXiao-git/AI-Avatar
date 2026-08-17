// 冒烟测试主线驱动（§21 demo 主线，紧凑时序版）
// 关键时序：demo 位置模拟仅在「开始游览」后启动，每 8s 进一站且每个站点首次进入才触发到点；
// 因此：问3小时 → AI生成路线 → 开始游览 → 立刻开启随行讲解 → 到点自动讲解 → 识景 → 卫生间 → 演出提醒 → 反馈 → /admin
// 用法: node smoke_drive.cjs <recorderOutdir>   结束时写 outdir/.stop 停录屏
const WebSocket = globalThis.WebSocket
const fs = require('fs')
const OUT = process.argv[2] || 'smoke_run'
const PAGE = 'EF426E15'
const PHOTO = 'D:/Code/Claude Code/软件杯数字人/improve2/frontend/public/model/attraction-dafo.png'

let ws, id = 0, pending = new Map()
function onMsg(ev) { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) })
const t0 = Date.now()
const log = (m) => console.log('[' + Math.round((Date.now() - t0) / 1000) + 's] ' + m)
const wait = (ms) => new Promise(r => setTimeout(r, ms))
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  if (r.exceptionDetails) return { err: (r.exceptionDetails.exception?.description || 'eval-err').slice(0, 160) }
  return r.result?.value
}
async function clickSel(sel) {
  return ev("(() => { const el = document.querySelector('" + sel + "'); if (!el) return { ok: false, why: 'MISS' }; el.click(); return { ok: true }; })()")
}
async function chatSend(text) {
  const r = await ev("(() => { const input = document.querySelector('.chat-input'); if (!input) return { ok: false, why: 'no-input' }; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, " + JSON.stringify(text) + "); input.dispatchEvent(new Event('input', { bubbles: true })); return { ok: true }; })()")
  await wait(150)
  const s = await clickSel('.send-btn')
  return { ...r, send: s }
}
async function poll(fnExpr, timeoutMs, label) {
  const dl = Date.now() + timeoutMs
  while (Date.now() < dl) {
    const v = await ev(fnExpr)
    if (v && !v.err && v !== false && v !== null && v !== undefined) return v
    await wait(800)
  }
  log('POLL-TIMEOUT: ' + label)
  return null
}
// 聊天区最后一条消息文本
const lastMsg = () => ev("(() => { const all = [...document.querySelectorAll('.msg')].map(x => x.textContent.trim()).filter(Boolean); return all.length ? all[all.length - 1] : ''; })()")

async function main() {
  const list = await (await fetch('http://localhost:9224/json/list')).json()
  const tab = list.find(t => t.id.startsWith(PAGE))
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  ws.onmessage = onMsg
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  await send('Runtime.enable'); await send('Page.enable')

  // 0) 应用就绪
  const ready = await poll("({ ready: document.readyState, input: !!document.querySelector('.chat-input') })", 20000, 'app-ready')
  log('app-ready: ' + JSON.stringify(ready))

  // 1) 语音问「3小时怎么玩」→ 文字代替（CDP 无法注入麦克风音频，报告注明）
  log('STEP1 提问: 我只有3小时，灵山怎么玩最合适？')
  await chatSend('我只有3小时，灵山怎么玩最合适？')
  // 等待流式回复 + 朗读完成：最后一条消息连续 3 次(2s)采样不变即稳定
  let prev = '', stable = 0
  const dl = Date.now() + 45000
  while (Date.now() < dl && stable < 3) {
    await wait(2000)
    const cur = await ev("(() => { const all=[...document.querySelectorAll('.msg')].map(x=>x.textContent.trim()).filter(Boolean); return all.length ? all[all.length-1].slice(0,80) : ''; })()")
    if (cur && cur !== prev) { prev = cur; stable = 0 } else if (cur) { stable++ }
  }
  const afterQ = await ev("({ routeCards: document.querySelectorAll('.start-btn').length, mode: (document.querySelector('.mode-chip')||{}).textContent || '' })")
  log('STEP1 回复完成: routeCards=' + afterQ.routeCards + ' mode=' + afterQ.mode + ' stable=' + stable)

  // 2) 开启随行讲解（自动讲解开关）
  const comp = await clickSel('.comp-btn')
  log('STEP2 随行讲解 click: ' + JSON.stringify(comp))
  await wait(1000)

  // 3) 开始游览「亲子喜乐线」（首站即九龙灌浴，位置一落地同时触发 到点自动讲解 + 演出提醒）
  const started = await ev("(() => { const btns=[...document.querySelectorAll('.start-btn')]; const b=btns.find(x=>{const c=x.closest('.route-card:not(.custom)'); return c&&c.textContent.indexOf('亲子喜乐线')>=0;}); if(!b) return { ok:false }; b.click(); return { ok:true }; })()")
  log('STEP3 亲子喜乐线开始游览: ' + JSON.stringify(started))
  await wait(3000)
  const tour = await ev("({ mode: (document.querySelector('.mode-chip')||{}).textContent || '' })")
  log('STEP3 游览中 mode=' + tour.mode)

  // 4) 到点触发讲解 + 演出临近提醒：位置到九龙灌浴，自动讲解 + 🎭 卡片同时出现
  log('STEP4 等待到点自动讲解...')
  const arrive = await poll("(() => { const t = document.body.innerText; const i = t.indexOf('来到「'); return i >= 0 ? t.slice(i, i + 70) : ''; })()", 40000, 'arrive-guide')
  log('STEP4 到点讲解: ' + JSON.stringify(arrive))
  const show = await poll("(() => { const ns = [...document.querySelectorAll('.msg.notice .notice-text')].map(n => n.textContent.trim()); const t = ns.find(x => x.indexOf('演出') >= 0 || x.indexOf('🎭') >= 0); return t || ''; })()", 35000, 'show-notice')
  // 兜底：若演出提醒未出现，点「重游」重启位置循环（回到九龙灌浴），show 冷却未消费时即重新触发
  if (!show) {
    log('STEP4 演出提醒未出现，尝试「重游」重启位置...')
    await ev("[...document.querySelectorAll('.restart-btn')].find(b => b.closest('.route-card') && b.closest('.route-card').textContent.indexOf('亲子喜乐线') >= 0)?.click()")
    await wait(1200)
  }
  const show2 = show || await poll("(() => { const ns = [...document.querySelectorAll('.msg.notice .notice-text')].map(n => n.textContent.trim()); const t = ns.find(x => x.indexOf('演出') >= 0 || x.indexOf('🎭') >= 0); return t || ''; })()", 35000, 'show-notice-retry')
  log('STEP4 演出提醒: ' + JSON.stringify(show2 || show))
  await wait(3000)

  // 5) 上传灵山照片识景（DOM.setFileInputFiles 触发 change → /api/vision）
  log('STEP5 上传照片识景: ' + PHOTO)
  await send('DOM.enable')
  const doc = await send('DOM.getDocument', { depth: -1 })
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
  if (q && q.nodeId) {
    await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [PHOTO] })
    const rec = await poll("(() => { const t = document.body.innerText; const i = t.indexOf('已识别'); return i >= 0 ? t.slice(i, i + 30) : ''; })()", 20000, 'vision-recognized')
    log('STEP5 识景结果: ' + JSON.stringify(rec))
  } else {
    log('STEP5 未找到文件输入')
  }

  // 6) 问附近卫生间（服务设施图层联动）
  log('STEP6 提问: 附近有卫生间吗？')
  await chatSend('附近有卫生间吗？')
  await wait(13000)
  const toilet = await ev("(() => { const btns = [...document.querySelectorAll('.layer-btn')].filter(b => b.textContent.trim().indexOf('🚻') >= 0); const on = btns.find(b => b.className.indexOf('on') >= 0); return { layerOn: !!on }; })()")
  const last6 = await lastMsg()
  log('STEP6 卫生间图层=' + JSON.stringify(toilet) + ' 最后消息=' + last6.slice(0, 60))

  // 7) 用户反馈 👍（头部 mini-btn 中文字为「反馈」的那个）
  await ev("[...document.querySelectorAll('.mini-btn')].find(b => b.textContent.indexOf('反馈') >= 0)?.click()")
  await wait(1200)
  const fbOpen = await ev("!!document.querySelector('.fb-mask')")
  await clickSel('.fb-score') // 👍 有帮助
  await wait(400)
  await clickSel('.fb-ok')    // 发送
  await wait(2500)
  log('STEP7 反馈提交: modal=' + fbOpen)

  // 8) 打开 /admin 展示知识库与真实交互统计
  log('STEP8 跳转 /admin...')
  await send('Page.navigate', { url: 'http://localhost:5276/admin' })
  await wait(5000)
  // 切到「游客分析」tab 展示真实交互统计（最近提问/景点热度/路线使用）
  await ev("[...document.querySelectorAll('.admin-tab')].find(t => t.textContent.indexOf('游客分析') >= 0)?.click()")
  await wait(2500)
  const admin = await ev("(() => { const t = document.body.innerText; return { hasOverview: t.indexOf('概览') >= 0, hasKb: t.indexOf('知识库') >= 0, hasAnalytics: t.indexOf('游客分析') >= 0, hasFaq: t.indexOf('最近提问') >= 0, hasHot: t.indexOf('景点热度') >= 0, hasRoute: t.indexOf('路线使用') >= 0 }; })()")
  log('STEP8 admin 验证: ' + JSON.stringify(admin))
  await wait(1500)

  // 9) 收尾
  log('DONE 全部主线步骤完成，停止录屏')
  try { fs.writeFileSync(OUT + '/.stop', '') } catch (e) { console.error('stop-file:', e.message) }
  await wait(1500)
  ws.close()
  process.exit(0)
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
