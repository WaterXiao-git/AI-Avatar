// Admin 后台 API：全部走真实后端接口，不做假数据
// P1-1：管理端鉴权 —— ADMIN_TOKEN 配置在后端 .env；前端登录后存入 sessionStorage，
// 所有管理请求携带 Authorization: Bearer <token>。不硬编码任何密钥。
const BASE = '/api'

export function setAdminToken(t) {
  if (t) sessionStorage.setItem('lingshan_admin_token', t)
  else sessionStorage.removeItem('lingshan_admin_token')
}

export function getAdminToken() {
  try { return sessionStorage.getItem('lingshan_admin_token') || '' } catch (e) { return '' }
}

export function hasAdminToken() {
  return !!getAdminToken()
}

function authHeaders(extra = {}) {
  const t = getAdminToken()
  return t ? { ...extra, Authorization: 'Bearer ' + t } : extra
}

// P1-1：校验 token 是否有效（后端 401 即失败），用于登录页
export async function verifyToken(token) {
  const res = await fetch(BASE + '/analytics/summary', { headers: { Authorization: 'Bearer ' + token } })
  return res.ok
}

export async function getJSON(path) {
  const res = await fetch(BASE + path, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export async function putJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export async function sendJSON(path, method, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? authHeaders({ 'Content-Type': 'application/json' }) : authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

// 知识库：文档上传（multipart，P1-1 需鉴权）
export async function uploadDocument(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(BASE + '/knowledge/documents', { method: 'POST', body: fd, headers: authHeaders() })
  if (!res.ok) throw new Error(`upload ${res.status}`)
  return res.json()
}
