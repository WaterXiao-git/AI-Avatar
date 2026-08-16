<script setup>
import { ref } from 'vue'

// Phase 2 将替换为魔珐星云 3D 数字人；当前为立绘兜底占位
const loaded = ref(false)
</script>

<template>
  <div class="dh-wrap">
    <div id="avatar-container" class="dh-stage"></div>
    <div class="dh-fallback">
      <img src="/model/avatar.svg" alt="小景" @error="loaded = false" />
      <span class="dh-tip">数字人加载中…</span>
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
.dh-stage { width: 100%; height: 100%; position: absolute; inset: 0; }
.dh-fallback {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.dh-fallback img { max-height: 420px; max-width: 100%; object-fit: contain; }
.dh-tip { font-size: 13px; color: var(--text-sub); }
</style>
