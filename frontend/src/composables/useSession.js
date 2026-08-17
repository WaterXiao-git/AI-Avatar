import { ref } from 'vue'

// 会话管理：启动一次会话，session_id 存 sessionStorage，刷新同 tab 复用
const sessionId = ref(sessionStorage.getItem('lingshan_session_id') || '')
export { sessionId }  // 具名导出，供 useTourSession 等事件上报复用

async function startSession(language = 'zh-CN') {
  // 已有会话则直接复用（module-level 单例 + sessionStorage 持久）
  if (sessionId.value) return sessionId.value
  try {
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'qa', language }),  // TASK-13.3 多语言
    })
    const data = await res.json()
    if (data.session_id) {
      sessionId.value = data.session_id
      sessionStorage.setItem('lingshan_session_id', data.session_id)
    }
  } catch (e) {
    // 后端未启动时静默失败，聊天/讲解不阻塞（session_id 保持为空）
  }
  return sessionId.value
}

export function useSession() {
  return { sessionId, startSession }
}
