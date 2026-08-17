const BASE = '/api'

async function getJSON(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export const fetchAttractions = () => getJSON('/attractions')
export const fetchRoutes = () => getJSON('/routes')
export const fetchWeather = () => getJSON('/weather')

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
