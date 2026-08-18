import { ref } from 'vue'

// 会话管理：启动一次会话，session_id 存 sessionStorage，刷新同 tab 复用
const sessionId = ref(sessionStorage.getItem('lingshan_session_id') || '')
export { sessionId }  // 具名导出，供 useTourSession 等事件上报复用

// R2-02 演示/真实会话隔离：sessionStorage 记录该会话的 demo 标记。
// 已存在会话仅当 demo 标记一致时复用；不一致（真实↔演示串号）则清掉重建新会话，
// 保证 ?demo=1 的 sessions/interactions/events/feedback 全部是 is_demo=1。
function storedSessionDemo() {
  return sessionStorage.getItem('lingshan_session_is_demo') === '1'
}

async function startSession(language = 'zh-CN', demo = false) {
  const wantDemo = !!demo
  // demo 标记与当前会话不一致 → 不能复用旧会话，清掉重建（防真实/演示数据混入）
  if (sessionId.value && storedSessionDemo() !== wantDemo) {
    sessionId.value = ''
    sessionStorage.removeItem('lingshan_session_id')
  }
  // 已有同标记会话则直接复用（module-level 单例 + sessionStorage 持久）
  if (sessionId.value) return sessionId.value
  try {
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'qa', language, demo: wantDemo }),  // TASK-13.3 多语言 + R2-02 demo 隔离
    })
    const data = await res.json()
    if (data.session_id) {
      sessionId.value = data.session_id
      sessionStorage.setItem('lingshan_session_id', data.session_id)
      sessionStorage.setItem('lingshan_session_is_demo', wantDemo ? '1' : '0')
    }
  } catch (e) {
    // 后端未启动时静默失败，聊天/讲解不阻塞（session_id 保持为空）
  }
  return sessionId.value
}

export function useSession() {
  return { sessionId, startSession }
}
