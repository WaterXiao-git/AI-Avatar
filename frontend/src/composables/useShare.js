import { ref } from 'vue'

// TASK-13 分享：优先系统分享（navigator.share），不支持则复制到剪贴板
const toastMsg = ref('')
let toastTimer = null

function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2000)
}

async function share(text, { title = '灵山导览', fallback = '已复制到剪贴板' } = {}) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch (e) {
    // 用户取消分享（AbortError）不提示；其它错误继续走剪贴板兜底
    if (e && e.name === 'AbortError') return 'cancelled'
  }
  // 兜底：剪贴板
  try {
    await navigator.clipboard.writeText(text)
    showToast(fallback)
    return 'copied'
  } catch (e) {
    showToast('分享失败')
    return 'failed'
  }
}

export function useShare() {
  return { share, toastMsg }
}
