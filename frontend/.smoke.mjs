// 人工回归冒烟（demo 模式）：连接 Edge 9224 的 CDP 页面，逐项断言并截图。
import { listPages, connect } from './.cdp.mjs'

const targetUrl = 'http://localhost:5276/?demo=1'
const pages = await listPages()
const target = pages.find(t => t.url.startsWith('http://localhost:5276/') && t.url.includes('demo=1') && t.type === 'page')
if (!target) { console.error('NO_TARGET'); process.exit(1) }
const { c, sleep, wait } = await (async () => {
  const cc = await connect(target.webSocketDebuggerUrl)
  await cc.send('Page.enable')
  await cc.send('Runtime.enable')
  return { c: cc, sleep: (ms) => new Promise(r => setTimeout(r, ms)), wait: async (expr, timeout = 15000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      try { if (await cc.eval(expr)) return true } catch (e) {}
      await new Promise(r => setTimeout(r, 300))
    }
    return false
  } }
})()

const results = []
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : '')) }

// 1) 页面加载 + demo 徽标
const demoOk = await wait(`document.querySelector('.demo-badge') !== null`, 20000)
check('demo 徽标可见', demoOk)

// 2) 景点卡片渲染
const attrOk = await wait(`document.querySelectorAll('.pos-attractions [class*="attr"]').length >= 3 || document.querySelectorAll('.pos-attractions button, .pos-attractions div').length >= 3`, 15000)
check('景点卡片渲染', attrOk)

// 3) 数字人/聊天面板存在
const chatOk = await wait(`document.querySelector('.pos-chat') !== null`, 10000)
check('聊天面板存在', chatOk)

// 4) 发送一条 FAQ 问题 → 等待 AI 回复
const inputOk = await wait(`document.querySelector('.pos-chat .chat-input') !== null`, 10000)
check('聊天输入框存在', inputOk)
await c.eval(`(() => {
  const ta = document.querySelector('.chat-input')
  if (!ta) return false
  ta.value = '灵山门票多少钱？'
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await sleep(400)
await c.eval(`(() => {
  const send = document.querySelector('.send-btn')
  if (!send) return false
  send.click()
  return true
})()`)
await sleep(500)
const replyOk = await wait(`[...document.querySelectorAll('.pos-chat [class*="msg"], .pos-chat .bubble')].some(el => el.textContent.length > 20)`, 40000)
check('FAQ 提问获得回复', replyOk, await c.eval(`(() => {
  const els = [...document.querySelectorAll('.pos-chat [class*="msg"], .pos-chat .bubble')]
  return els.length ? els[els.length-1].textContent.trim().slice(0, 60) : 'none'
})()`))

// 5) 截屏
await sleep(600)
const shot = await c.screenshot('_shot_regression_demo.png')
check('截屏已保存', shot === '_shot_regression_demo.png', shot)

c.close()
const pass = results.filter(r => r.ok).length
console.log(`\n==== 冒烟结果：${pass}/${results.length} 通过 ====`)
process.exit(results.every(r => r.ok) ? 0 : 1)
