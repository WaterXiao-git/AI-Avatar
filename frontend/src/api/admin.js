// Admin 后台 API：全部走真实后端接口，不做假数据
const BASE = '/api'

export async function getJSON(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export async function putJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export async function sendJSON(path, method, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

// 知识库：文档上传（multipart）
export async function uploadDocument(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(BASE + '/knowledge/documents', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`upload ${res.status}`)
  return res.json()
}
