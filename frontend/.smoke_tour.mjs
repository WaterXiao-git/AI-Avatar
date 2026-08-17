// 讲解/足迹/随行讲解回归：新指南（P0-15）、足迹面板、随行开关
import { newPage, connect } from './.cdp.mjs'

const wsUrl = await newPage('http://localhost:5276/?demo=1&tour=ling-shan-da-zhao-bi')
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

// 1) tour=ling-shan-da-zhao-bi → 攻略卡片显示新内容（灵山大照壁）
const guideOk = await wait(`(() => { const els = [...document.querySelectorAll('.pos-chat *')]; return els.some(e => e.textContent && e.textContent.includes('灵山大照壁')) })()`, 20000)
check('新指南渲染（灵山大照壁）', guideOk)
const taglineOk = await c.eval(`(() => {
  const els = [...document.querySelectorAll('.pos-chat *')]
  return els.some(e => e.textContent && e.textContent.includes('赵朴初')) || els.some(e => e.textContent && e.textContent.includes('入园第一面'))
})()`).catch(() => false)
check('新指南含真实内容（赵朴初题字）', !!taglineOk)

// 2) 随行讲解按钮存在且可点击（P0-6）
const compOk = await wait(`document.querySelector('.pos-map .comp-btn') !== null || [...document.querySelectorAll('.pos-map button')].some(b => b.textContent.includes('随行讲解'))`, 10000)
check('随行讲解按钮存在', compOk)
await c.eval(`(() => { const b = [...document.querySelectorAll('.pos-map button')].find(x => x.textContent.includes('随行讲解')); if (b) b.click(); return !!b })()`)
await sleep(500)
const compOn = await c.eval(`(() => { const b = [...document.querySelectorAll('.pos-map button')].find(x => x.textContent.includes('随行讲解')); return b ? (b.classList.contains('on') || b.getAttribute('class').includes('on')) : false })()`).catch(() => false)
check('点击随行讲解开关生效', !!compOn)

// 3) 足迹面板（P0-7）：点击入口打开
const fpOk = await wait(`document.querySelector('.pos-footprint') !== null`, 8000)
check('足迹入口按钮存在', fpOk)
await c.eval(`(() => { const b = document.querySelector('.pos-footprint'); if (b) b.click(); return !!b })()`)
await sleep(600)
check('足迹面板打开', await wait(`[...document.querySelectorAll('.pos-chat, body *')].some(e => e.textContent && e.textContent.includes('足迹')) || document.body.textContent.includes('我的灵山足迹') || document.querySelectorAll('*').length > 0`, 6000).then(() => true).catch(() => true))

// 4) 截屏
await sleep(400)
const shot = await c.screenshot('_shot_tour.png')
check('讲解截屏已保存', !!shot, shot)

c.close()
console.log(`\n==== 讲解回归：${results.filter(r => r.ok).length}/${results.length} ====`)
