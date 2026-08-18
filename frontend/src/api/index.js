const BASE = '/api'

async function getJSON(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export const fetchAttractions = () => getJSON('/attractions')
export const fetchRoutes = () => getJSON('/routes')
export const fetchWeather = () => getJSON('/weather')
export const fetchFacilities = (type) => getJSON('/facilities' + (type ? `?type=${type}` : ''))

// TASK-13.2 我的灵山足迹：真实事件聚合（禁止 LLM 猜测）
export const fetchFootprint = (sessionId) => getJSON('/footprint' + (sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''))

// 行为事件上报（route_start / route_stop_reached / route_complete 等），失败不阻塞主流程
// P0-12/P1-3：自动带上 demo 标记（?demo=1 演示模式），并在缺 session_id 时兜底读取 sessionStorage
export async function trackEvent(payload) {
  try {
    const isDemo = new URLSearchParams(location.search).has('demo')
    const body = {
      session_id: payload.session_id || sessionStorage.getItem('lingshan_session_id') || null,
      ...payload,
      demo: payload.demo !== undefined ? !!payload.demo : isDemo,
    }
    await fetch(BASE + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) { /* 埋点失败静默 */ }
}

// 大模型生成专属路线
export async function planRoute(payload) {
  const res = await fetch(BASE + '/route/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`route/plan ${res.status}`)
  return res.json()
}

// 图片文字识别（提问前把图片转成文字）
export async function ocrImage(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(BASE + '/ocr', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`ocr ${res.status}`)
  return res.json()
}

// 反馈提交（TASK-11）：👍/👎 + 点踩标签
export async function submitFeedback(payload) {
  // R2-02：带 demo 标记（会话存在时后端以会话 is_demo 为准；无会话时用 ?demo=1 兜底）
  const isDemo = new URLSearchParams(location.search).has('demo')
  const res = await fetch(BASE + '/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      session_id: sessionStorage.getItem('lingshan_session_id') || null,
      demo: payload.demo !== undefined ? !!payload.demo : isDemo,
    }),
  })
  if (!res.ok) throw new Error(`feedback ${res.status}`)
  return res.json()
}

// 多模态图片识景 / OCR / 图片问答
export async function analyzeImage(file, options = {}) {
  const fd = new FormData()
  fd.append('file', file)
  if (options.question) fd.append('question', options.question)
  if (options.mode) fd.append('mode', options.mode)
  // P0-11/P0-12：图片问答落 interaction 需要会话关联 + 演示模式标记
  fd.append('session_id', sessionStorage.getItem('lingshan_session_id') || '')
  fd.append('demo', new URLSearchParams(location.search).has('demo') ? 'true' : 'false')
  const res = await fetch(BASE + '/vision', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`vision ${res.status}`)
  return res.json()
}
