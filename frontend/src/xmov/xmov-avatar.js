// 魔珐星云 Lite SDK 封装。
// 对外暴露：init() / speak(text) / interrupt() / destroy()
const APP_ID = import.meta.env.VITE_XMOV_APP_ID || ''
const APP_SECRET = import.meta.env.VITE_XMOV_APP_SECRET || ''
const GATEWAY = import.meta.env.VITE_XMOV_GATEWAY || 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session'

export class XmovAvatar {
  constructor(containerEl, options = {}) {
    this.container = containerEl
    this.avatar = null
    this.ready = false
    this.visualReady = false   // 3D 是否真正上屏（画布检测到内容）
    this.checkTimer = null
    // TASK-12：真实说话状态（由 SDK onVoiceStateChange/onSpeakStateChange 驱动，
    // payload 为字符串 "start"/"end"/"speak_start"/"speak_end"/"speak_error"，不是 0/1 枚举）
    this.speaking = false
    this.onSpeakingChange = options?.onSpeakingChange || null
  }

  // 手动注册说话状态回调（可覆盖构造时传入的）
  setSpeakingHandler(fn) {
    this.onSpeakingChange = typeof fn === 'function' ? fn : null
    return this
  }

  // 归一化状态变更：值有变化才回调，避免重复通知
  _setSpeaking(v) {
    const bool = !!v
    if (this.speaking === bool) return
    this.speaking = bool
    if (this.onSpeakingChange) {
      try { this.onSpeakingChange(bool) } catch (e) { console.error('[魔珐星云] onSpeakingChange 回调异常', e) }
    }
  }

  get enabled() {
    return typeof window.XmovAvatar !== 'undefined' && !!APP_ID && !!APP_SECRET
  }

  credReason() {
    if (typeof window.XmovAvatar === 'undefined') return 'SDK 脚本未加载'
    if (!APP_ID) return 'VITE_XMOV_APP_ID 未配置'
    if (!APP_SECRET) return 'VITE_XMOV_APP_SECRET 未配置'
    return ''
  }

  async init() {
    if (!this.enabled) return { ok: false, reason: this.credReason() }
    if (this.avatar) return { ok: true }
    try {
      this.avatar = new window.XmovAvatar({
        containerId: this.container,
        appId: APP_ID,
        appSecret: APP_SECRET,
        gatewayServer: GATEWAY,
        enableLogger: false, // 关掉 SDK 逐帧日志刷屏；真实错误仍由 onError/onMessage 暴露
        // Lite SDK 必需：onMessage 是所有内部消息/错误的分发口，缺失会导致 init 直接抛错
        onMessage: (msg) => {
          const raw = JSON.stringify(msg)
          if (msg && msg.code !== undefined && msg.code !== 0) {
            console.warn('[魔珐星云] onMessage(code!=0)', raw)
          } else {
            console.log('[魔珐星云] onMessage', raw)
          }
        },
        onStateChange: (s) => console.log('[魔珐星云] state', JSON.stringify(s)),
        // TASK-12：真实 payload 是字符串状态（start/end/speak_start/speak_end/speak_error），
        // 依据 SDK 源码 onVoiceStateChange(state, duration) / onSpeakStateChange(state, speechId) 契约，
        // 绝不猜 0=idle/1=speaking 数字枚举。
        onVoiceStateChange: (s) => {
          console.log('[魔珐星云] voice', JSON.stringify(s))
          if (s === 'start') this._setSpeaking(true)
          else if (s === 'end') this._setSpeaking(false)
        },
        onSpeakStateChange: (s) => {
          console.log('[魔珐星云] speak', JSON.stringify(s))
          if (s === 'speak_start') this._setSpeaking(true)
          else if (s === 'speak_end' || s === 'speak_error') this._setSpeaking(false)
        },
        onConnected: () => console.log('[魔珐星云] onConnected'),
        onDisconnect: (e) => console.warn('[魔珐星云] onDisconnect', JSON.stringify(e)),
        onDisconnected: () => console.warn('[魔珐星云] onDisconnected'),
        onError: (e) => console.error('魔珐星云 error', JSON.stringify(e)),
        onNetworkInfo: (i) => { if (new URLSearchParams(location.search).has('diag')) console.log('[魔珐星云] network', JSON.stringify(i)) },
        onStartSessionWarning: (w) => console.warn('[魔珐星云] session warning', JSON.stringify(w)),
        onlineCallback: () => {},
        onAAFrameHandle: () => {},
        onAudioPlaybackData: () => {},
      })
      await this.avatar.init({
        onDownloadProgress: (p) => { /* 首连下载角色资源 */ },
        onError: (e) => console.error('魔珐星云 init error', e),
      })
      this.ready = true
      this.startVisualCheck()
      return { ok: true }
    } catch (e) {
      console.error('魔珐星云 init failed', e)
      const msg = (e && (e.message || e.msg)) ? String(e.message || e.msg) : String(e)
      return { ok: false, reason: msg }
    }
  }

  // 检测 3D 是否真正上屏：采样画布非透明像素。
  // 主显示画布是 webgl2 上下文，getContext('2d') 会返回 null → 必须先把帧画到临时
  // 2D 画布再 getImageData（Chrome/Edge 支持 drawImage(webglCanvas)，同步取当前帧）。
  isPainted() {
    const stage = document.querySelector(this.container)
    if (!stage) return false
    const canvases = stage.querySelectorAll('canvas')
    if (new URLSearchParams(location.search).has('diag') && !window.__xmovDiagLogged) {
      window.__xmovDiagLogged = true
      const info = Array.from(canvases).map(c => {
        let t = null
        try { t = c.getContext('2d') && '2d' } catch (e) {}
        if (!t) { try { t = c.getContext('webgl2') && 'webgl2' } catch (e) {} }
        if (!t) { try { t = c.getContext('webgl') && 'webgl' } catch (e) {} }
        return `${c.width}x${c.height}:${t || 'none'}`
      })
      console.log('[魔珐星云] isPainted canvases:', info.join(' | '))
    }
    const tmp = document.createElement('canvas')
    const tctx = tmp.getContext('2d', { willReadFrequently: true })
    if (new URLSearchParams(location.search).has('diag') && !window.__xmovLayoutLogged) {
      window.__xmovLayoutLogged = true
      try {
        const info = Array.from(canvases).map(c => {
          const r = c.getBoundingClientRect()
          const cs = getComputedStyle(c)
          return `${c.width}x${c.height} rect:${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.left)},${Math.round(r.top)}) computedW:${cs.width} computedH:${cs.height} objFit:${cs.objectFit}`
        })
        const stage = document.querySelector(this.container)
        const sr = stage ? stage.getBoundingClientRect() : null
        console.log('[魔珐星云] layout:', info.join(' | '), '| stage:', sr ? `${Math.round(sr.width)}x${Math.round(sr.height)}` : 'none')
      } catch (e) { console.log('[魔珐星云] layout diag failed', e) }
    }
    for (const c of canvases) {
      const w = c.width, h = c.height
      if (w < 50 || h < 50) continue   // 跳过小探针画布
      let ctx = null
      try { ctx = c.getContext('2d') } catch (e) { ctx = null }
      if (!ctx) {
        // webgl 画布：借道临时 2D 画布读帧
        try {
          tmp.width = w; tmp.height = h
          tctx.clearRect(0, 0, w, h)
          tctx.drawImage(c, 0, 0)
          ctx = tctx
        } catch (e) { continue }
      }
      // 缩小采样：webgl 画布缩小到 60×107 再统计颜色，开销小且能区分「纯背景」vs「数字人主体」
      try {
        const sw = 60, sh = Math.max(1, Math.round(60 * h / w))
        if (ctx === tctx) {
          // 已在临时 2D 画布上：再缩一次
          const tmp2 = document.createElement('canvas'); tmp2.width = sw; tmp2.height = sh
          const c2 = tmp2.getContext('2d', { willReadFrequently: true })
          c2.drawImage(tmp, 0, 0, w, h, 0, 0, sw, sh)
          ctx = c2
        } else {
          tmp.width = sw; tmp.height = sh
          tctx.clearRect(0, 0, sw, sh)
          tctx.drawImage(c, 0, 0, w, h, 0, 0, sw, sh)
          ctx = tctx
        }
        const d = ctx.getImageData(0, 0, sw, sh).data
        const colorBuckets = new Set()
        let solid = 0
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3], r = d[i], g = d[i + 1], b = d[i + 2]
          if (a < 30) continue          // 透明跳过
          if (r < 12 && g < 12 && b < 12) continue // 纯黑跳过
          if (r > 240 && g > 240 && b > 240) continue // 纯白跳过
          solid++
          // 颜色量化到 5bit×3 → 一个桶代表「相近颜色」，纯背景只有 1~2 种桶
          colorBuckets.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3))
        }
        if (new URLSearchParams(location.search).has('diag')) {
          console.log(`[魔珐星云] paint: solid=${solid}/${sw * sh} colors=${colorBuckets.size}`)
        }
        // 数字人主体：非背景像素占比明显（>1.5%）且颜色多样（≥5 种）
        const ratio = solid / (sw * sh)
        return ratio > 0.015 && colorBuckets.size >= 5
      } catch (e) { /* 画布不可读则跳过 */ }
    }
    return false
  }

  // 轮询直到 3D 上屏（init 成功后约 3s 开始，1.2s 一次）
  startVisualCheck() {
    clearTimeout(this.checkTimer)
    const check = () => {
      if (this.visualReady) return
      this.visualReady = this.isPainted()
      if (!this.visualReady) this.checkTimer = setTimeout(check, 1200)
    }
    this.checkTimer = setTimeout(check, 3000)
  }

  // 整段播报（说话+口型+表情+动作全自动）
  speak(text) {
    const diag = new URLSearchParams(location.search).has('diag')
    if (!this.ready || !this.visualReady) {
      if (diag) console.log('[XmovDiag] speak() -> false', { ready: this.ready, visualReady: this.visualReady, visual: this.isPainted(), text: text.slice(0, 30) })
      return false
    }
    try {
      this.avatar.speak(text, true, true)
      if (diag) console.log('[XmovDiag] speak() -> true（已发魔珐服务端 TTS）')
      return true
    } catch (e) { console.error(e); return false }
  }

  // 打断当前播报（配合顶部「打断」按钮）
  interrupt() {
    if (!this.ready) return
    try { this.avatar.interactiveidle(); } catch (e) { /* 忽略 */ }
  }

  destroy() {
    clearTimeout(this.checkTimer)
    if (this.avatar && this.avatar.destroy) { try { this.avatar.destroy() } catch (e) {} }
    this.avatar = null
    this.ready = false
    this.visualReady = false
  }
}
