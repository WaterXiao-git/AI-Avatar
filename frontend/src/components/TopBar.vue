<script setup>
import { ref, onMounted } from 'vue'
import { fetchWeather } from '../api'

const emit = defineEmits(['interrupt', 'disconnect', 'feedback'])

const weather = ref({ temp: '36°', desc: '阴', humidity: '53%', wind: '西风' })

onMounted(async () => {
  try { weather.value = await fetchWeather() } catch (e) { /* 后端未启动用默认值 */ }
})
</script>

<template>
  <header class="topbar">
    <div class="left">
      <button class="icon-btn hamburger" aria-label="菜单">☰</button>
      <span class="logo">灵山导览</span>
    </div>

    <div class="center">
      <span class="weather">
        {{ weather.temp }} {{ weather.desc }} · {{ weather.humidity }} · {{ weather.wind }}
      </span>
    </div>

    <div class="right">
      <span class="status online"><i class="dot green"></i>已连接</span>
      <button class="text-btn" @click="emit('feedback')">反馈</button>
      <button class="text-btn danger" @click="emit('disconnect')">断开</button>
      <button class="text-btn danger" @click="emit('interrupt')">打断</button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--topbar-bg);
  border-radius: var(--radius);
  padding: 8px 16px;
  box-shadow: var(--shadow);
  height: 46px;
  flex-shrink: 0;
}
.left { display: flex; align-items: center; gap: 10px; }
.logo { font-size: 18px; font-weight: 700; color: var(--theme-blue); letter-spacing: 2px; }
.hamburger {
  border: none; background: #fff; width: 30px; height: 30px;
  border-radius: 6px; font-size: 16px; cursor: pointer; box-shadow: var(--shadow);
}
.center { color: var(--text-sub); font-size: 14px; }
.right { display: flex; align-items: center; gap: 14px; }
.status { font-size: 13px; display: inline-flex; align-items: center; gap: 5px; }
.status.online { color: var(--success); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.green { background: var(--success); }
.text-btn { border: none; background: none; font-size: 13px; color: var(--text-main); cursor: pointer; }
.text-btn.danger { color: var(--danger); }
</style>
