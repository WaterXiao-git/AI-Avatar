<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { analyzeImage } from '../api'
import { useShare } from '../composables/useShare'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  mode: { type: String, default: 'qa' },
  listening: { type: Boolean, default: false },  // 语音聆听中（由 App 统一管理）
  interim: { type: String, default: '' },
  micSupported: { type: Boolean, default: true },
  autoAsk: { type: Boolean, default: false },    // 展览模式：语音识别到即自动提问
  guide: { type: Object, default: null },        // 当前讲解景点的攻略卡片
  language: { type: String, default: 'zh-CN' },  // TASK-13.3 多语言
  presets: { type: Array, default: null },       // 预设问题（语言相关）
})
const emit = defineEmits(['send', 'mic-toggle', 'feedback', 'disconnect', 'tour', 'vision', 'notice-action', 'feedback-submit', 'language-change', 'share'])

// TASK-13 分享：AI 回答摘要 / 攻略卡片。
// R2-12：分享行为上报——组件只管分享动作，事件埋点交给 App（emit('share')）。
const { share: doShare, toastMsg } = useShare()
function shareText(text) { doShare(text, { title: '灵山导览 · AI 回答', fallback: '已复制 AI 回答' }); emit('share', { type: 'answer' }) }
function shareGuide() {
  const g = props.guide
  if (!g) return
  const text = `【${g.title}】${g.tagline}\n🎯 必玩：${(g.highlights || []).join('；')}\n💡 玩法：${(g.play || []).join('；')}${g.show ? '\n⏰ 演出：' + g.show : ''}${g.verdict ? '\n' + g.verdict : ''}`
  doShare(text, { title: '灵山导览 · 游玩攻略', fallback: '已复制攻略' })
  emit('share', { type: 'guide', title: g.title })
}

const input = defineModel()

// 消息滚动到底：新消息入列 & 流式内容增长时都自动滚到最新
const msgArea = ref(null)
watch(
  () => {
    const arr = props.messages
    const last = arr[arr.length - 1]
    return [arr.length, last ? (last.content || '').length : 0]
  },
  async () => {
    await nextTick()
    if (msgArea.value) msgArea.value.scrollTop = msgArea.value.scrollHeight
  },
)

// 预设问题：和路线/景点相关的直接进讲解模式按攻略播报，无关的走 AI 问答
// TASK-13.3：预设问题由父组件按语言传入（presets prop）
const quick = computed(() => props.presets || [])

function onPreset(q) {
  if (q.tour) emit('tour', q.tour)
  else emit('send', q.label)
}

// TASK-13.3 语言切换
function toggleLang() {
  emit('language-change', props.language === 'en-US' ? 'zh-CN' : 'en-US')
}

function submit(text) {
  const v = (text ?? input.value)?.trim()
  if (v) { emit('send', v); input.value = '' }
}

// ===== TASK-11 反馈：顶部「反馈」→ 这次回答有帮助吗？(👍/👎) → 点踩标签 =====
const DISLIKE_TAGS = ['信息不准确', '没解决问题', '回答太长', '语音体验不好', '路线不合理', '其他']
const fbOpen = ref(false)
const fbScore = ref(0)        // 0 未选 / 1 有帮助 / -1 没帮助
const fbTags = ref([])
const fbComment = ref('')
const fbSending = ref(false)
const fbDone = ref(false)

// 反馈对象：最近一条带 interactionId 的助手消息
function latestInteraction() {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    const m = props.messages[i]
    if (m.role === 'assistant' && m.interactionId) return m
  }
  return null
}
function openFeedback() {
  fbOpen.value = true
  fbScore.value = 0
  fbTags.value = []
  fbComment.value = ''
  fbDone.value = false
}
function pickScore(s) { fbScore.value = s }
function toggleTag(t) {
  fbTags.value = fbTags.value.includes(t)
    ? fbTags.value.filter(x => x !== t)
    : [...fbTags.value, t]
}
async function submitFeedback() {
  if (!fbScore.value || fbSending.value) return
  fbSending.value = true
  const target = latestInteraction()
  emit('feedback-submit', {
    interaction_id: target ? target.interactionId : null,
    score: fbScore.value,
    tags: fbScore.value < 0 ? fbTags.value : [],
    comment: fbComment.value.trim(),
  })
  // 关闭前稍等片刻让 App 发请求（或直接由父组件处理）
  fbSending.value = false
  fbDone.value = true
  setTimeout(() => { fbOpen.value = false; fbDone.value = false }, 900)
}

// 图片提问 / 识景：上传 → /api/vision 分析 → 交 App 处理（讲解/填输入框/问答）
const imgInput = ref(null)
const imgNote = ref('')
const imgBusy = ref(false)
async function onImage(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  imgBusy.value = true; imgNote.value = '正在识别图片中的景点与内容…'
  try {
    // P0-11：把输入框里已打的字作为图片问题一起发（type=qa 图片自由问答），否则纯识景
    const typed = (input.value || '').trim()
    const r = await analyzeImage(file, { question: typed, mode: 'auto' })
    emit('vision', r)
    if (r.type === 'attraction' && r.recognized_name) {
      imgNote.value = `已识别：${r.recognized_name}`
    } else if (r.type === 'qa') {
      imgNote.value = '已根据图片回答你的问题'
    } else if (r.ocr_text) {
      imgNote.value = '已识别图片文字，可编辑后发送'
    } else if (r.type === 'unknown') {
      imgNote.value = r.note || '未能识别图片内容，请直接输入问题。'
    } else {
      imgNote.value = ''
    }
  } catch (err) {
    imgNote.value = '图片识别失败，请直接输入问题。'
  } finally { imgBusy.value = false }
}
</script>

<template>
  <div class="chat-panel glass-deep">
    <!-- TASK-13 分享 toast -->
    <div v-if="toastMsg" class="share-toast">{{ toastMsg }}</div>
    <header class="chat-head">
      <span class="title">小灵 · AI 导览</span>
      <div class="head-right">
        <span class="mode-chip" :class="mode">{{ mode === 'tour' ? '讲解中' : '问答模式' }}</span>
        <!-- TASK-13.3 语言切换 -->
        <button class="mini-btn lang-btn" :title="language === 'en-US' ? 'Switch to 中文' : 'Switch to English'" @click="toggleLang">
          {{ language === 'en-US' ? 'EN·中' : '中·EN' }}
        </button>
        <button class="mini-btn" @click="openFeedback">反馈</button>
        <button class="mini-btn danger" @click="emit('disconnect')">断开</button>
      </div>
    </header>

    <div class="presets">
      <button class="quick" v-for="q in quick" :key="q.label" @click="onPreset(q)">{{ q.label }}</button>
    </div>

    <div class="msg-area" ref="msgArea">
      <!-- TASK-10 主动提醒：notice 消息渲染成可操作的提示卡片 -->
      <div v-for="(m, i) in messages" :key="i">
        <div v-if="m.kind === 'notice'" class="msg notice">
          <div class="notice-card">
            <p class="notice-text">{{ m.content }}</p>
            <div class="notice-actions" v-if="Array.isArray(m.actions) && m.actions.length">
              <button
                v-for="(a, j) in m.actions"
                :key="j"
                class="notice-btn"
                :class="a.id === 'dismiss' ? 'ghost' : 'primary'"
                @click="emit('notice-action', a, m)"
              >{{ a.label }}</button>
            </div>
          </div>
        </div>
        <!-- 攻略卡片推送：提问提到景点时，回答后自动推一条小红书风格攻略卡 -->
        <div v-else-if="m.kind === 'guide' && m.guide" class="msg guide">
          <div class="guide-card inline">
            <div class="gc-head">
              <span class="gc-emoji">{{ m.guide.emoji }}</span>
              <div class="gc-titles">
                <p class="gc-title">📒 {{ m.guide.title }} · 游玩攻略</p>
                <p class="gc-tagline">{{ m.guide.tagline }}</p>
              </div>
            </div>
            <div class="gc-sec"><span class="gc-k">🎯 必玩</span>
              <ul class="gc-list">
                <li v-for="(h, i) in m.guide.highlights" :key="i">{{ h }}</li>
              </ul>
            </div>
            <div class="gc-sec"><span class="gc-k">💡 玩法贴士</span>
              <ul class="gc-list">
                <li v-for="(p, i) in m.guide.play" :key="i">{{ p }}</li>
              </ul>
            </div>
            <div class="gc-line" v-if="m.guide.photo"><span class="gc-k">📸 拍照位</span>{{ m.guide.photo }}</div>
            <div class="gc-line" v-if="m.guide.show"><span class="gc-k">⏰ 演出</span>{{ m.guide.show }}</div>
            <div class="gc-line" v-if="m.guide.note"><span class="gc-k">⚠️ 提示</span>{{ m.guide.note }}</div>
            <p v-if="m.guide.verdict" class="gc-verdict">{{ m.guide.verdict }}</p>
          </div>
        </div>
        <div v-else :class="['msg', m.role]">
          <span class="bubble">{{ m.content }}</span>
          <!-- TASK-13 分享：AI 回答摘要可分享 -->
          <button v-if="m.role === 'assistant' && m.content" class="bubble-share" :title="'分享这条回答'" @click.stop="shareText(m.content)">⤴</button>
        </div>
      </div>
    </div>

    <!-- 当前景点攻略卡片：好玩好懂，帮游客速览 -->
    <div v-if="guide" class="guide-card">
      <div class="gc-head">
        <span class="gc-emoji">{{ guide.emoji }}</span>
        <div class="gc-titles">
          <p class="gc-title">📒 {{ guide.title }} · 游玩攻略</p>
          <p class="gc-tagline">{{ guide.tagline }}</p>
        </div>
        <!-- TASK-13 分享：攻略卡片 -->
        <button class="gc-share" :title="'分享这份攻略'" @click.stop="shareGuide()">⤴</button>
      </div>
      <div class="gc-sec"><span class="gc-k">🎯 必玩</span>
        <ul class="gc-list">
          <li v-for="(h, i) in guide.highlights" :key="i">{{ h }}</li>
        </ul>
      </div>
      <div class="gc-sec"><span class="gc-k">💡 玩法贴士</span>
        <ul class="gc-list">
          <li v-for="(p, i) in guide.play" :key="i">{{ p }}</li>
        </ul>
      </div>
      <div class="gc-line" v-if="guide.photo"><span class="gc-k">📸 拍照位</span>{{ guide.photo }}</div>
      <div class="gc-line" v-if="guide.show"><span class="gc-k">⏰ 演出</span>{{ guide.show }}</div>
      <div class="gc-line" v-if="guide.note"><span class="gc-k">⚠️ 提示</span>{{ guide.note }}</div>
      <p v-if="guide.verdict" class="gc-verdict">{{ guide.verdict }}</p>
    </div>

    <div class="mic-ind" v-if="listening">
      <span class="pulse-dot"></span>
      正在聆听{{ interim ? '：' + interim : '…' }}
    </div>

    <div class="input-row">
      <button
        class="mic-btn"
        :class="{ on: listening }"
        @click="emit('mic-toggle')"
        :disabled="!micSupported"
        :title="micSupported ? (autoAsk ? '说话自动提问' : '语音输入') : '当前浏览器不支持语音'"
      >{{ listening ? '🔴' : '🎤' }}</button>
      <button class="img-btn" :disabled="imgBusy" title="图片提问 / 识景" @click="imgInput.click()">🖼️</button>
      <input ref="imgInput" type="file" accept="image/*" hidden @change="onImage" />
      <input
        v-model="input"
        class="chat-input"
        :placeholder="listening ? '正在听…' : '输入问题，或点麦克风说话'"
        :disabled="disabled"
        @keyup.enter="submit()"
      />
      <button class="send-btn" :disabled="disabled" @click="submit()" aria-label="发送">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </div>
    <p v-if="imgNote" class="img-note">{{ imgNote }}</p>

    <!-- TASK-11 反馈弹层：这次回答对你有帮助吗？ -->
    <div v-if="fbOpen" class="fb-mask" @click.self="fbOpen = false">
      <div class="fb-box">
        <p class="fb-title">这次回答对你有帮助吗？</p>
        <div class="fb-scores">
          <button class="fb-score" :class="{ on: fbScore === 1 }" @click="pickScore(1)">👍 有帮助</button>
          <button class="fb-score" :class="{ on: fbScore === -1 }" @click="pickScore(-1)">👎 没帮助</button>
        </div>
        <div v-if="fbScore === -1" class="fb-tags">
          <button
            v-for="t in DISLIKE_TAGS"
            :key="t"
            class="fb-tag"
            :class="{ on: fbTags.includes(t) }"
            @click="toggleTag(t)"
          >{{ t }}</button>
        </div>
        <input
          v-model="fbComment"
          class="fb-comment"
          :placeholder="fbScore === -1 ? '补充说明（可选）' : '有什么想说的？（可选）'"
        />
        <div class="fb-foot">
          <button class="fb-cancel" @click="fbOpen = false">取消</button>
          <button class="fb-ok" :disabled="!fbScore || fbSending" @click="submitFeedback">
            {{ fbDone ? '✓ 已提交' : '提交' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-panel { display: flex; flex-direction: column; padding: 12px 14px; gap: 10px; overflow: hidden; }
.chat-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.title { font-size: 15px; font-weight: 800; color: #16324A; }
.head-right { display: flex; align-items: center; gap: 8px; }
.mode-chip { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 10px; }
.mode-chip.qa { background: #E3F2FD; color: #2385BB; }
.mode-chip.tour { background: #FFE7F0; color: #FF5E97; }
.mini-btn { border: none; background: none; font-size: 12px; color: #2A4560; cursor: pointer; }
.mini-btn.danger { color: var(--danger); }
.mini-btn.lang-btn {
  border: 1px solid rgba(35,133,187,.4); color: #2385BB;
  border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 700;
}

.presets { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; max-height: 116px; overflow-y: auto; }
.quick {
  border: 1px solid #CFE4F2; background: #fff; color: var(--theme-blue);
  font-size: 12px; border-radius: 999px; padding: 5px 11px; cursor: pointer;
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.quick:hover { background: var(--topbar-bg); }

.msg-area { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.msg.assistant { justify-content: flex-start; }
.msg.guide { justify-content: flex-start; }
.msg.guide .guide-card { max-height: 230px; width: 100%; }
.bubble {
  max-width: 88%; padding: 8px 12px; border-radius: 12px; font-size: 13px;
  line-height: 1.55; word-break: break-word; white-space: pre-wrap;
}
.msg.user .bubble { background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff; border-bottom-right-radius: 4px; }
.msg.assistant .bubble { background: #fff; color: var(--text-main); box-shadow: var(--shadow); border-bottom-left-radius: 4px; }

/* ===== TASK-10 主动提醒卡片 ===== */
.msg.notice { justify-content: flex-start; }
.notice-card {
  max-width: 92%; background: #FFF8E8; border-radius: 12px; padding: 9px 11px 10px;
  border-left: 4px solid #FFB347;
  box-shadow: 0 4px 12px rgba(255,179,71,.22);
}
.notice-text {
  margin: 0 0 7px; font-size: 12.5px; line-height: 1.5; color: #5A4620;
  white-space: pre-wrap; word-break: break-word;
}
.notice-actions { display: flex; gap: 7px; flex-wrap: wrap; }
.notice-btn {
  border: none; cursor: pointer; border-radius: 999px; font-size: 11.5px; font-weight: 700;
  padding: 5px 14px; transition: filter .15s, transform .15s;
}
.notice-btn.primary {
  background: linear-gradient(135deg, #FFB347, #FF7BAC); color: #fff;
  box-shadow: 0 3px 8px rgba(255,123,172,.35);
}
.notice-btn.ghost {
  background: #fff; color: #A08A5C; border: 1px solid #EBD9B0;
}
.notice-btn:hover { filter: brightness(1.05); transform: translateY(-1px); }

/* ===== 景点攻略卡片 ===== */
.guide-card {
  flex-shrink: 0; max-height: 46%; overflow-y: auto;
  background: #fff; border-radius: 12px; padding: 9px 11px;
  border-left: 4px solid #FF7BAC;
  box-shadow: 0 4px 14px rgba(20,60,95,.12);
}
.gc-head { display: flex; gap: 8px; align-items: center; margin-bottom: 5px; }
.gc-emoji { font-size: 21px; }
.gc-titles { min-width: 0; flex: 1; }
.gc-title { font-size: 13px; font-weight: 800; color: #16324A; }
.gc-tagline { font-size: 11px; color: #FF6FA5; font-weight: 600; margin-top: 1px; }
.gc-share {
  flex-shrink: 0; border: none; cursor: pointer; background: transparent;
  color: #FF7BAC; font-size: 14px; padding: 2px 5px; border-radius: 6px;
}
.gc-share:hover { background: #FFF0F5; }

/* TASK-13 分享按钮（消息气泡右上角小图标；放气泡内侧避免被 msg-area 横向裁剪导致点不中） */
.msg.assistant { position: relative; }
.bubble-share {
  position: absolute; right: 6px; top: 4px;
  border: none; cursor: pointer; background: rgba(255,255,255,.85);
  color: #FF7BAC; font-size: 11px; width: 18px; height: 18px; line-height: 18px;
  text-align: center; border-radius: 6px; padding: 0;
  box-shadow: 0 1px 3px rgba(20,60,95,.15);
}
.bubble-share:hover { background: #FFF0F5; }

/* TASK-13 分享 toast */
.share-toast {
  position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%);
  background: rgba(20,60,95,.9); color: #fff; font-size: 12.5px;
  padding: 7px 16px; border-radius: 999px; z-index: 9999;
  box-shadow: 0 4px 12px rgba(20,60,95,.3);
}
.gc-sec { margin-bottom: 5px; }
.gc-k { display: inline-block; font-size: 11px; font-weight: 800; color: #2385BB; margin-bottom: 2px; }
.gc-list { margin: 0; padding-left: 15px; }
.gc-list li { font-size: 11.5px; color: #3A5268; line-height: 1.45; margin-bottom: 1px; }
.gc-line { font-size: 11.5px; color: #3A5268; line-height: 1.4; margin-bottom: 3px; }
.gc-line .gc-k { margin-right: 4px; margin-bottom: 0; }
.gc-verdict {
  margin: 4px 0 0; font-size: 12px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #FFB347, #FF7BAC);
  border-radius: 8px; padding: 4px 8px; text-align: center;
}

.mic-ind {
  display: flex; align-items: center; gap: 8px;
  background: #FFF4F4; color: #E64A4A; font-size: 12px;
  border-radius: 8px; padding: 6px 10px; flex-shrink: 0;
}
.pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #E64A4A; animation: blink 1s infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .2; } }

.input-row { display: flex; gap: 7px; align-items: center; flex-shrink: 0; }
.mic-btn, .img-btn {
  width: 34px; height: 34px; border-radius: 50%; border: 1px solid #CFE4F2;
  background: #fff; cursor: pointer; font-size: 15px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.mic-btn.on { background: #FFE7E7; border-color: #E64A4A; animation: blink 1.2s infinite; }
.mic-btn:disabled { opacity: .4; cursor: not-allowed; }
.img-btn:disabled { opacity: .5; cursor: wait; }
.chat-input {
  flex: 1; border: 1px solid #D8E3EC; border-radius: 20px; padding: 9px 14px;
  font-size: 13px; outline: none; background: #fff; min-width: 0;
}
.chat-input:focus { border-color: var(--theme-blue); }
.send-btn {
  width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
  background: linear-gradient(135deg, #2385BB, #4FB0E6); display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.send-btn:disabled { background: #A9C4D6; cursor: not-allowed; }
.img-note { font-size: 11px; color: var(--text-sub); flex-shrink: 0; }

/* ===== TASK-11 反馈弹层 ===== */
.fb-mask {
  position: absolute; inset: 0; z-index: 50;
  background: rgba(16, 32, 48, .45);
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px;
}
.fb-box {
  width: 86%; background: #fff; border-radius: 14px; padding: 16px 16px 14px;
  box-shadow: 0 12px 32px rgba(16, 32, 48, .3);
}
.fb-title { margin: 0 0 12px; font-size: 14px; font-weight: 800; color: #16324A; text-align: center; }
.fb-scores { display: flex; gap: 10px; justify-content: center; }
.fb-score {
  flex: 1; padding: 10px 0; border-radius: 10px; cursor: pointer;
  border: 1px solid #D8E3EC; background: #F7FAFC; font-size: 13px; font-weight: 700; color: #3A5268;
}
.fb-score.on { border-color: #2385BB; background: #E3F2FD; color: #2385BB; }
.fb-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; justify-content: center; }
.fb-tag {
  border: 1px solid #D8E3EC; background: #fff; color: #4A5F74;
  font-size: 11.5px; border-radius: 999px; padding: 4px 11px; cursor: pointer;
}
.fb-tag.on { border-color: #E0516B; background: #FFE9EE; color: #E0516B; }
.fb-comment {
  width: 100%; margin-top: 12px; box-sizing: border-box;
  border: 1px solid #D8E3EC; border-radius: 8px; padding: 8px 10px;
  font-size: 12px; outline: none; background: #fff;
}
.fb-comment:focus { border-color: var(--theme-blue); }
.fb-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.fb-cancel {
  border: 1px solid #D8E3EC; background: #fff; color: #4A5F74;
  font-size: 12px; border-radius: 8px; padding: 7px 16px; cursor: pointer;
}
.fb-ok {
  border: none; background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff;
  font-size: 12px; font-weight: 700; border-radius: 8px; padding: 7px 18px; cursor: pointer;
}
.fb-ok:disabled { opacity: .5; cursor: not-allowed; }

/* 竖屏/窄屏：隐藏次要按钮，避免头部拥挤 */
@media (max-aspect-ratio: 1/1) {
  .mini-btn { display: none; }
  .title { font-size: 14px; }
}
</style>
