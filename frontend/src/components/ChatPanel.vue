<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  showMessages: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
})
const emit = defineEmits(['send'])

const features = [
  { icon: '🍽️', title: '餐饮指南', desc: '素斋、素面、禅食，价格全知道' },
  { icon: '🪙', title: '票务政策', desc: '学生优惠、老人免票、年卡办理' },
  { icon: '🅿️', title: '配套设施', desc: '停车场、母婴室、无障碍通道' },
  { icon: '📣', title: '演出查询', desc: '九龙灌浴、吉祥颂场次实时查' },
  { icon: '⚠️', title: '避坑提示', desc: '拍照收费、最佳游览时段提醒' },
]

const quick = ['景区有什么好玩的？', '门票多少钱？', '怎么去景区？', '有什么特色美食？', '推荐一条游览路线']

const input = defineModel()

function submit() {
  const v = input.value?.trim()
  if (v) { emit('send', v); input.value = '' }
}
</script>

<template>
  <div class="chat-panel">
    <header class="chat-head">
      <span class="title">小灵·AI导览</span>
      <span class="online"><i class="dot green"></i>在线</span>
    </header>

    <div class="msg-area" v-if="showMessages">
      <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]">
        <span class="bubble">{{ m.content }}</span>
      </div>
    </div>

    <div class="greeting" v-else>
      <p class="hello">你好呀！我是小景</p>
      <p class="sub">有什么可以帮助您？</p>
    </div>

    <div class="features">
      <button class="feat" v-for="f in features" :key="f.title" @click="emit('send', f.title)">
        <span class="feat-icon">{{ f.icon }}</span>
        <span class="feat-text">
          <span class="feat-title">{{ f.title }}</span>
          <span class="feat-desc">{{ f.desc }}</span>
        </span>
      </button>
    </div>

    <div class="quicks">
      <button class="quick" v-for="q in quick" :key="q" @click="emit('send', q)">{{ q }}</button>
    </div>

    <div class="input-row">
      <input v-model="input" class="chat-input" placeholder="输入你的问题..."
             :disabled="disabled" @keyup.enter="submit" />
      <button class="send-btn" :disabled="disabled" @click="submit" aria-label="发送">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  background: var(--panel-bg); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 14px; display: flex;
  flex-direction: column; gap: 12px; flex: 1; min-height: 0;
}
.chat-head { display: flex; align-items: center; justify-content: space-between; }
.title { font-size: 16px; font-weight: 700; }
.online { font-size: 12px; color: var(--success); display: inline-flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); display: inline-block; }
.greeting .hello { font-size: 16px; font-weight: 600; }
.greeting .sub { font-size: 13px; color: var(--text-sub); margin-top: 2px; }
.msg-area { display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto; }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.msg.assistant { justify-content: flex-start; }
.bubble {
  max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px;
  line-height: 1.5; word-break: break-word;
}
.msg.user .bubble { background: var(--theme-blue); color: #fff; border-bottom-right-radius: 4px; }
.msg.assistant .bubble { background: #fff; color: var(--text-main); box-shadow: var(--shadow); border-bottom-left-radius: 4px; }
.features { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; }
.feat {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: var(--card-bg); border: none; border-radius: var(--radius);
  padding: 8px 10px; text-align: left; cursor: pointer; box-shadow: var(--shadow);
  transition: box-shadow .2s;
}
.feat:hover { box-shadow: var(--shadow-hover); }
.feat-icon { font-size: 18px; }
.feat-text { display: flex; flex-direction: column; }
.feat-title { font-size: 13px; font-weight: 600; }
.feat-desc { font-size: 11px; color: var(--text-sub); }
.quicks { display: flex; flex-wrap: wrap; gap: 6px; }
.quick {
  border: 1px solid #CFE4F2; background: #fff; color: var(--theme-blue);
  font-size: 12px; border-radius: 999px; padding: 4px 10px; cursor: pointer;
}
.quick:hover { background: var(--topbar-bg); }
.input-row { display: flex; gap: 8px; align-items: center; }
.chat-input {
  flex: 1; border: 1px solid #D8E3EC; border-radius: 20px; padding: 9px 14px;
  font-size: 13px; outline: none; background: #fff;
}
.chat-input:focus { border-color: var(--theme-blue); }
.send-btn {
  width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--theme-blue); display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.send-btn:hover { filter: brightness(1.1); }
.send-btn:disabled { background: #A9C4D6; cursor: not-allowed; }
</style>
