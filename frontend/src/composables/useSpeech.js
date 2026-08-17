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
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim.value += r[0].transcript
      }
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
