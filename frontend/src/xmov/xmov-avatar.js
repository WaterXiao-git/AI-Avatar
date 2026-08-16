// 魔珐星云 Lite SDK 封装。
// 对外暴露：init() / speak(text) / interrupt() / destroy()
const APP_ID = import.meta.env.VITE_XMOV_APP_ID || ''
const APP_SECRET = import.meta.env.VITE_XMOV_APP_SECRET || ''
const GATEWAY = import.meta.env.VITE_XMOV_GATEWAY || 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session'

export class XmovAvatar {
  constructor(containerEl) {
    this.container = containerEl
    this.avatar = null
    this.ready = false
  }

  get enabled() {
    return typeof window.XmovAvatar !== 'undefined' && !!APP_ID && !!APP_SECRET
  }

  async init() {
    if (!this.enabled) return { ok: false, reason: 'sdk-or-creds-missing' }
    if (this.avatar) return { ok: true }
    try {
      this.avatar = new window.XmovAvatar({
        containerId: this.container,
        appId: APP_ID,
        appSecret: APP_SECRET,
        gatewayServer: GATEWAY,
        enableLogger: import.meta.env.DEV,
        onStateChange: (state) => { /* 状态变化，可抛事件 */ },
        onVoiceStateChange: (status) => { /* 语音状态 */ },
      })
      await this.avatar.init({
        onDownloadProgress: (p) => { /* 首连下载角色资源 */ },
        onError: (e) => console.error('魔珐星云 init error', e),
      })
      this.ready = true
      return { ok: true }
    } catch (e) {
      console.error('魔珐星云 init failed', e)
      return { ok: false, reason: String(e) }
    }
  }

  // 整段播报（说话+口型+表情+动作全自动）
  speak(text) {
    if (!this.ready) return false
    try { this.avatar.speak(text, true, true); return true } catch (e) { console.error(e); return false }
  }

  // 打断当前播报（配合顶部「打断」按钮）
  interrupt() {
    if (!this.ready) return
    try { this.avatar.interactiveidle(); } catch (e) { /* 忽略 */ }
  }

  destroy() {
    if (this.avatar && this.avatar.destroy) { try { this.avatar.destroy() } catch (e) {} }
    this.avatar = null
    this.ready = false
  }
}
