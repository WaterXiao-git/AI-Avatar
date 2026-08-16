<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { XmovAvatar } from '../xmov/xmov-avatar'

const loaded = ref(false)       // 魔珐星云是否就绪
const actor = new XmovAvatar('#avatar-container')

onMounted(async () => {
  // 等待 SDK 脚本就绪（本地 vendor 或 CDN 异步加载）
  let waited = 0
  while (typeof window.XmovAvatar === 'undefined' && waited < 5000) {
    await new Promise(r => setTimeout(r, 100)); waited += 100
  }
  const res = await actor.init()
  loaded.value = res.ok
})

onBeforeUnmount(() => actor.destroy())

function speak(text) {
  return actor.speak(text)  // 返回是否成功交给父组件
}
function interrupt() { actor.interrupt() }
function destroy() { actor.destroy(); loaded.value = false }

defineExpose({ speak, interrupt, destroy })
</script>

<template>
  <div class="dh-wrap">
    <div id="avatar-container" class="dh-stage"></div>
    <div v-if="!loaded" class="dh-fallback">
      <img src="/model/avatar.svg" alt="小景" />
      <span class="dh-tip">数字人连接中…</span>
    </div>
  </div>
</template>

<style scoped>
.dh-wrap {
  position: relative; flex: 1; width: 100%;
  display: flex; align-items: center; justify-content: center;
  min-height: 0; background: rgba(255,255,255,.45);
  border-radius: var(--radius); box-shadow: var(--shadow);
}
.dh-stage { width: 100%; height: 100%; }
.dh-fallback {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  animation: dh-float 4s ease-in-out infinite;
}
.dh-fallback img { max-height: 420px; max-width: 100%; object-fit: contain; }
.dh-tip { font-size: 13px; color: var(--text-sub); }
@keyframes dh-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
</style>
