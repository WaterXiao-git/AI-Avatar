import { ref } from 'vue'

// 浏览器语音识别（Web Speech API，中文）。展览模式下「开口即问」依赖此能力。
export function useSpeech() {
  const supported = ref(false)
  const listening = ref(false)
  const interim = ref('') // 实时中间结果（边听边显示）

  if (typeof window !== 'undefined') {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    supported.value = !!SR
  }

  let rec = null

  function start({ onResult, onError, onEnd } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || listening.value) return
    rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      // TASK-12：中间结果不累加。interim 每次事件都刷新为完整当前文本，
      // 用累加会让显示文本无限变长。每次 event 重建，最后整体赋值。
      let final = ''
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interimText += r[0].transcript
      }
      interim.value = interimText
      if (final.trim() && onResult) onResult(final.trim())
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') listening.value = false
      if (onError) onError(e.error)
    }
    rec.onend = () => {
      listening.value = false
      interim.value = ''
      if (onEnd) onEnd()
    }
    try { rec.start(); listening.value = true } catch (e) { /* 重复启动忽略 */ }
  }

  function stop() {
    if (rec) { try { rec.stop() } catch (e) { /* 忽略 */ } }
    rec = null
    listening.value = false
  }

  return { supported, listening, interim, start, stop }
}
