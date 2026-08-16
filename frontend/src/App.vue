<script setup>
import { ref } from 'vue'
import TopBar from './components/TopBar.vue'
import AttractionList from './components/AttractionList.vue'
import MapPanel from './components/MapPanel.vue'
import DigitalHuman from './components/DigitalHuman.vue'
import ChatPanel from './components/ChatPanel.vue'
import RouteCardRow from './components/RouteCardRow.vue'
import { useChat } from './composables/useChat'

const dhRef = ref(null)
const { messages, loading, speaking, ask, setSpeakHandler } = useChat()

// 说话策略：优先魔珐星云（语音+口型+表情全自动），不可用时退化为 Edge-TTS 语音播放（立绘兜底，有声音无口型）
setSpeakHandler(async (text) => {
  if (dhRef.value && dhRef.value.speak(text)) {
    await new Promise((r) => setTimeout(r, Math.min(30000, text.length * 120)))
    return
  }
  // 兜底：Edge-TTS 播放
  const audio = new Audio('/api/tts?text=' + encodeURIComponent(text))
  await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; audio.play() })
})

// 顶部「打断」：停止数字人当前播报 / 兜底音频
function handleInterrupt() {
  if (dhRef.value) dhRef.value.interrupt()
}
// 顶部「断开」：断开魔珐星云连接（回落立绘）
function handleDisconnect() {
  if (confirm('确定断开连接？')) { if (dhRef.value) dhRef.value.destroy() }
}
function handleFeedback() { alert('感谢反馈！') }
</script>

<template>
  <div class="page">
    <TopBar @interrupt="handleInterrupt" @disconnect="handleDisconnect" @feedback="handleFeedback" />
    <main class="main">
      <section class="col-left">
        <AttractionList />
        <MapPanel />
      </section>
      <section class="col-center">
        <DigitalHuman ref="dhRef" />
      </section>
      <section class="col-right">
        <ChatPanel
          :disabled="loading"
          :show-messages="messages.length > 1"
          :messages="messages"
          @send="ask"
        />
      </section>
    </main>
    <RouteCardRow />
  </div>
</template>

<style scoped>
.main {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr 380px;
  gap: 10px;
  min-height: 0;
}
.col-left { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.col-center { display: flex; align-items: stretch; min-height: 0; }
.col-right { display: flex; flex-direction: column; min-height: 0; }

@media (max-width: 1200px) {
  .main { grid-template-columns: 260px 1fr; }
  .col-right { grid-column: 1 / -1; max-height: 320px; }
}
@media (max-width: 900px) {
  .main { grid-template-columns: 1fr; }
  .col-center { min-height: 340px; }
  .col-right { grid-column: auto; max-height: none; }
}
</style>
