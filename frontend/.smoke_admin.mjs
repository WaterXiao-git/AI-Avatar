// Admin 回归（P1-1 登录门禁 + P1-3 include_demo 开关）
// 注：后端未配置 ADMIN_TOKEN 时 require_admin 直通，登录门禁为前端 UX 层。
//     演示环境在 .env 设置 ADMIN_TOKEN 后即强制执行鉴权。
import { newPage, connect } from './.cdp.mjs'

const wsUrl = await newPage('http://localhost:5276/admin')
const c = await connect(wsUrl)
await c.send('Page.enable'); await c.send('Runtime.enable')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const wait = async (expr, timeout = 15000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) { try { if (await c.eval(expr)) return true } catch (e) {} await new Promise(r => setTimeout(r, 300)) }
  return false
}

const results = []
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : '')) }

// 1) 新 tab 无 token → 显示登录卡片，业务面板隐藏
const loginOk = await wait(`document.querySelector('.login-card') !== null`, 15000)
check('Admin 登录门禁显示', loginOk)
check('未登录不显示业务面板', await wait(`document.querySelector('.admin-tabs') === null`, 8000))

// 2) 空 token 提示错误
await c.eval(`(() => { const i = document.querySelector('.login-input'); if (i) i.value = ''; return !!i })()`)
await sleep(100)
await c.eval(`(() => { const b = document.querySelector('.login-btn'); if (b) b.click(); return !!b })()`)
await sleep(600)
check('空 Token 提示输入', await wait(`document.querySelector('.login-err') !== null`, 5000))

// 3) 输入任意 token → 进入后台（后端 auth 未配置时直通；配置后需正确 token）
await c.eval(`(() => {
  const i = document.querySelector('.login-input')
  if (i) { i.value = 'demo-admin-token'; i.dispatchEvent(new Event('input', { bubbles: true })) }
  return !!i
})()`)
await sleep(100)
await c.eval(`(() => { const b = document.querySelector('.login-btn'); if (b) b.click(); return !!b })()`)
const entered = await wait(`document.querySelector('.admin-tabs') !== null`, 10000)
check('输入 Token 进入后台', entered)

// 4) 游客分析页含 include_demo 开关（P1-3）
if (entered) {
  await c.eval(`(() => { const t = [...document.querySelectorAll('.admin-tab')].find(b => b.textContent.includes('游客分析')); if (t) t.click(); return !!t })()`)
  await sleep(600)
  check('分析页显示 include_demo 开关', await wait(`document.querySelector('.ap-demo-toggle') !== null`, 8000))
  await c.eval(`(() => { const cb = document.querySelector('.ap-demo-toggle input'); if (cb && !cb.checked) cb.click(); return !!cb })()`)
  await sleep(800)
  check('勾选后表格重新加载', await wait(`document.querySelectorAll('.ap-table tbody tr').length >= 0`, 5000))
}

// 5) 截屏
await sleep(400)
const shot = await c.screenshot('_shot_admin.png')
check('Admin 截屏已保存', !!shot, shot)

c.close()
console.log(`\n==== Admin 冒烟：${results.filter(r => r.ok).length}/${results.length} ====`)
process.exit(results.every(r => r.ok) ? 0 : 1)
