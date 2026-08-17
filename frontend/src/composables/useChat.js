import { ref } from 'vue'

// 返回聊天状态与动作。speak 回调由 App 注入（魔珐星云 speak 或 TTS 兜底）
export function useChat() {
  const messages = ref([{ role: 'assistant', content: '你好呀！我是小景，有什么可以帮助您？' }])
  const loading = ref(false)
  const speaking = ref(false)

  let onSpeak = null
  const setSpeakHandler = (fn) => { onSpeak = fn }

  async function ask(text) {
    if (loading.value) return
    messages.value.push({ role: 'user', content: text })
    loading.value = true

    const history = messages.value.map(m => ({ role: m.role, content: m.content }))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let answer = ''
      let buffer = ''   // SSE 行可能被 TCP 分包，需缓冲不完整行
      const assistantMsg = { role: 'assistant', content: '' }
      messages.value.push(assistantMsg)
      // 关键：必须通过响应式代理元素写 content，直接改原始对象不会触发视图更新
      const liveMsg = messages.value[messages.value.length - 1]

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()  // 最后一段可能不完整，留到下一块
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue   // 跳过注释/keepalive
          const data = t.slice(5).trim()
          if (!data || data === '[DONE]') continue  // SSE 流结束标记
          const payload = JSON.parse(data)
          if (payload.error) throw new Error(payload.error)
          if (payload.delta) { answer += payload.delta; liveMsg.content = answer }
        }
      }
      // 流结束后：语音朗读 + 口型（魔珐星云优先，TTS 兜底）
      if (onSpeak && answer.trim()) { speaking.value = true; await onSpeak(answer.trim()) }
    } catch (e) {
      messages.value.push({ role: 'assistant', content: `出错了：${e.message}` })
    } finally {
      loading.value = false
      speaking.value = false
    }
  }

  return { messages, loading, speaking, ask, setSpeakHandler }
}
