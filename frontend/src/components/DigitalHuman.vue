<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { XmovAvatar } from '../xmov/xmov-avatar'

const props = defineProps({
  mode: { type: String, default: 'qa' },          // qa 问答 / tour 讲解
  contextLabel: { type: String, default: '' },    // 讲解模式当前讲解对象
  exhibition: { type: Boolean, default: false },
})
const emit = defineEmits(['mode', 'toggle-exhibition', 'interrupt', 'speaking-change'])

const loaded = ref(false)
// TASK-12：数字人真实说话状态（魔珐 payload start/end 驱动），供 App 做语音防回声
const avatarSpeaking = ref(false)
const actor = new XmovAvatar('#avatar-container', {
  onSpeakingChange: (v) => {
    avatarSpeaking.value = v
    emit('speaking-change', v)
  },
})

onMounted(async () => {
  // ?noavatar=1 调试钩子：跳过数字人连接，便于截图验证布局
  if (new URLSearchParams(location.search).has('noavatar')) return
  let waited = 0
  while (typeof window.XmovAvatar === 'undefined' && waited < 5000) {
    await new Promise(r => setTimeout(r, 100)); waited += 100
  }
  const res = await actor.init()
  loaded.value = res.ok
  if (!res.ok) {
    console.error('[魔珐星云] init 失败：', res)
  }
})

onBeforeUnmount(() => {
  actor.destroy()
})

function speak(text) {
  return actor.speak(text) // 返回是否成功交给父组件
}
function interrupt() { actor.interrupt() }
function destroy() {
  actor.destroy()
  loaded.value = false
}

defineExpose({ speak, interrupt, destroy, isSpeaking: avatarSpeaking })
</script>

<template>
  <div class="dh-wrap">
    <!-- 模式切换栏 -->
    <div class="dh-modebar">
      <div class="dh-tabs">
        <button class="dh-tab" :class="{ on: mode === 'qa' }" @click="emit('mode', 'qa')">💬 问答模式</button>
        <button class="dh-tab" :class="{ on: mode === 'tour' }" @click="emit('mode', 'tour')">🎙️ 讲解模式</button>
      </div>
      <button class="dh-full" :class="{ on: exhibition }" @click="emit('toggle-exhibition')" :title="exhibition ? '退出展览模式' : '进入展览模式'">
        {{ exhibition ? '⏹ 退出展览' : '⛶ 展览模式' }}
      </button>
    </div>

    <div class="dh-stage-wrap">
      <div id="avatar-container" class="dh-stage"></div>
    </div>

    <!-- 讲解模式上下文 -->
    <div v-if="mode === 'tour' && contextLabel" class="dh-ctx">
      <span class="ctx-pulse"></span>
      正在讲解：{{ contextLabel }}
    </div>

    <div class="dh-actions">
      <button class="dh-act" @click="emit('interrupt')">⏹ 打断</button>
    </div>
  </div>
</template>

<style scoped>
.dh-wrap {
  position: relative; width: 100%; height: 100%;
  /* 透明：数字人直接浮在全景背景上，不再有白色玻璃框 */
  background: transparent;
  border: none;
  box-shadow: none;
  overflow: hidden;
}
.dh-modebar {
  /* 必须高于舞台区（absolute inset:0）和 3D 画布(z-index:100)，否则按钮被盖住点不到 */
  position: relative; z-index: 400;
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 8px;
}
.dh-tabs { display: flex; gap: 6px; background: rgba(255,255,255,.6); border-radius: 999px; padding: 3px; }
.dh-tab {
  border: none; cursor: pointer; font-size: 12px; font-weight: 600;
  color: #2A4560; background: transparent;
  padding: 5px 12px; border-radius: 999px;
  transition: all .2s;
}
.dh-tab.on { background: #2385BB; color: #fff; box-shadow: 0 2px 8px rgba(35,133,187,.4); }
.dh-full {
  border: 1px solid rgba(35,133,187,.5); background: rgba(255,255,255,.7);
  color: #2385BB; font-size: 12px; font-weight: 600;
  border-radius: 999px; padding: 5px 12px; cursor: pointer;
}
.dh-full.on { background: #FF7BAC; border-color: #FF7BAC; color: #fff; }

.dh-stage-wrap {
  /* 铺满整个面板并把立绘/3D 真正垂直居中（顶部留出模式栏高度避免遮挡头部） */
  position: absolute; inset: 0;
  padding-top: 42px;
  box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
/* SDK 会往容器上写 inline style（position:relative;overflow:hidden），inline 优先级高于 scoped class，
   若不强制就会被覆盖 → 容器变 relative 且无尺寸（子元素全 absolute 不占位）→ 0×0 → canvas 不可见。
   用 !important 强制铺满父容器，抵消 SDK 的 inline。 */
.dh-stage {
  position: absolute !important;
  top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important;
  width: 100% !important; height: 100% !important;
  overflow: hidden !important;
}
/* 数字人 canvas 由 SDK 动态创建（无 data-v 属性），scoped 选择器必须用 :deep() 才能命中。
   SDK 会给 canvas 设 1080×1920 绝对定位 + margin 位移（针对大画布居中），
   我们把画布强制铺满容器并清零 margin，object-fit:contain 等比居中，确保数字人一定可见。
   （transform 归零会关闭 SDK 每帧的说话横向位移，但保证主体显示，后续可再优化） */
.dh-stage :deep(canvas) {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  object-fit: contain !important;
  transform: none !important;
}
.dh-ctx {
  position: absolute; bottom: 42px; left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(255,255,255,.9); border-radius: 999px;
  padding: 6px 14px; font-size: 13px; font-weight: 700; color: #16324A;
  box-shadow: 0 4px 14px rgba(20,60,95,.2); white-space: nowrap; max-width: 92%;
}
.ctx-pulse {
  width: 9px; height: 9px; border-radius: 50%; background: #2EBD59;
  animation: ctx-blink 1.2s infinite;
}
@keyframes ctx-blink { 0%,100% { opacity: 1; } 50% { opacity: .25; } }

.dh-actions {
  /* 悬浮在立绘脚边，不再钉在面板底部 */
  position: absolute; left: 50%; transform: translateX(-50%);
  bottom: 3%; z-index: 300;
  display: flex; justify-content: center;
}
.dh-act {
  border: none; cursor: pointer;
  background: rgba(255,255,255,.85); color: #D64949;
  border: 1px solid rgba(214,73,73,.45);
  font-size: 12px; font-weight: 700; border-radius: 999px; padding: 5px 14px;
  box-shadow: 0 2px 8px rgba(20,60,95,.15);
}
.dh-act:hover { background: #E64A4A; color: #fff; }

/* 竖屏/窄屏：模式栏紧凑化 */
@media (max-aspect-ratio: 1/1) {
  .dh-modebar { padding: 4px 4px; }
  .dh-tab { font-size: 11px; padding: 4px 8px; }
  .dh-full { font-size: 11px; padding: 4px 8px; }
  .dh-ctx { font-size: 12px; white-space: normal; text-align: center; }
}
</style>
