<script setup>
import { ref, watch, nextTick } from 'vue'
import { ocrImage } from '../api'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  mode: { type: String, default: 'qa' },
  listening: { type: Boolean, default: false },  // 语音聆听中（由 App 统一管理）
  interim: { type: String, default: '' },
  micSupported: { type: Boolean, default: true },
  autoAsk: { type: Boolean, default: false },    // 展览模式：语音识别到即自动提问
  guide: { type: Object, default: null },        // 当前讲解景点的攻略卡片
})
const emit = defineEmits(['send', 'mic-toggle', 'feedback', 'disconnect', 'tour'])

const input = defineModel()

// 消息滚动到底：新消息入列 & 流式内容增长时都自动滚到最新
const msgArea = ref(null)
watch(
  () => {
    const arr = props.messages
    const last = arr[arr.length - 1]
    return [arr.length, last ? last.content.length : 0]
  },
  async () => {
    await nextTick()
    if (msgArea.value) msgArea.value.scrollTop = msgArea.value.scrollHeight
  },
)

// 预设问题：和路线/景点相关的直接进讲解模式按攻略播报，无关的走 AI 问答
const quick = [
  { label: '推荐经典路线', tour: { type: 'route', id: 'qifu', label: '推荐经典路线' } },
  { label: '九龙灌浴几点看最合适？', tour: { type: 'attraction', id: 'jiu-long-guan-yu', label: '九龙灌浴几点看最合适？' } },
  { label: '带娃怎么玩最合适？', tour: { type: 'route', id: 'qinzi', label: '带娃怎么玩最合适？' } },
  { label: '想拍美照推荐哪条线？', tour: { type: 'route', id: 'wenhua', label: '想拍美照推荐哪条线？' } },
  { label: '今天门票多少钱？', tour: null },
]

function onPreset(q) {
  if (q.tour) emit('tour', q.tour)
  else emit('send', q.label)
}

function submit(text) {
  const v = (text ?? input.value)?.trim()
  if (v) { emit('send', v); input.value = '' }
}

// 图片提问：上传 → OCR 转文字 → 填入输入框
const imgInput = ref(null)
const imgNote = ref('')
const imgBusy = ref(false)
async function onImage(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  imgBusy.value = true; imgNote.value = '识别图片文字中…'
  try {
    const r = await ocrImage(file)
    if (r.text) {
      input.value = r.text
      imgNote.value = '已识别图片文字，可编辑后发送'
    } else {
      imgNote.value = r.note || '未能识别出文字，请直接输入问题。'
    }
  } catch (err) {
    imgNote.value = '图片识别失败，请直接输入问题。'
  } finally { imgBusy.value = false }
}
</script>

<template>
  <div class="chat-panel glass-deep">
    <header class="chat-head">
      <span class="title">小灵 · AI 导览</span>
      <div class="head-right">
        <span class="mode-chip" :class="mode">{{ mode === 'tour' ? '讲解中' : '问答模式' }}</span>
        <button class="mini-btn" @click="emit('feedback')">反馈</button>
        <button class="mini-btn danger" @click="emit('disconnect')">断开</button>
      </div>
    </header>

    <div class="presets">
      <button class="quick" v-for="q in quick" :key="q.label" @click="onPreset(q)">{{ q.label }}</button>
    </div>

    <div class="msg-area" ref="msgArea">
      <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]">
        <span class="bubble">{{ m.content }}</span>
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
      <button class="img-btn" :disabled="imgBusy" title="图片提问（识别图中文字）" @click="imgInput.click()">🖼️</button>
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
.bubble {
  max-width: 88%; padding: 8px 12px; border-radius: 12px; font-size: 13px;
  line-height: 1.55; word-break: break-word; white-space: pre-wrap;
}
.msg.user .bubble { background: linear-gradient(135deg, #2385BB, #4FB0E6); color: #fff; border-bottom-right-radius: 4px; }
.msg.assistant .bubble { background: #fff; color: var(--text-main); box-shadow: var(--shadow); border-bottom-left-radius: 4px; }

/* ===== 景点攻略卡片 ===== */
.guide-card {
  flex-shrink: 0; max-height: 46%; overflow-y: auto;
  background: #fff; border-radius: 12px; padding: 9px 11px;
  border-left: 4px solid #FF7BAC;
  box-shadow: 0 4px 14px rgba(20,60,95,.12);
}
.gc-head { display: flex; gap: 8px; align-items: center; margin-bottom: 5px; }
.gc-emoji { font-size: 21px; }
.gc-titles { min-width: 0; }
.gc-title { font-size: 13px; font-weight: 800; color: #16324A; }
.gc-tagline { font-size: 11px; color: #FF6FA5; font-weight: 600; margin-top: 1px; }
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

/* 竖屏/窄屏：隐藏次要按钮，避免头部拥挤 */
@media (max-aspect-ratio: 1/1) {
  .mini-btn { display: none; }
  .title { font-size: 14px; }
}
</style>
