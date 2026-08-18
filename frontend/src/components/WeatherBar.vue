<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchWeather } from '../api'

const emit = defineEmits(['footprint'])

// R2-09：不再用兜底静态值当实时天气展示。weather=null（请求失败）或 live=false（后端兜底）时，
// 一律显示「天气数据暂不可用 [非实时]」，绝不把 36°/阴/53%/西风 这种兜底值伪装成实时天气。
const weather = ref(null)
const offline = ref(false)

onMounted(async () => {
  try { weather.value = await fetchWeather() } catch (e) { offline.value = true }
})

const live = computed(() => !!(weather.value && weather.value.live))

// 天气图标按描述取一个 emoji，简单够用
const iconMap = { 晴: '☀️', 多云: '⛅', 阴: '☁️', 小雨: '🌧️', 中雨: '🌧️', 大雨: '🌧️', 雾: '🌫️', 雪: '❄️' }
</script>

<template>
  <header class="weather-bar">
    <span class="logo">灵山导览</span>
    <div v-if="live" class="weather-chip">
      <span class="wt-ico">{{ iconMap[weather.desc] || '⛅' }}</span>
      <span class="wt-temp">{{ weather.temp }}</span>
      <span class="wt-sep">·</span>
      <span class="wt-desc">{{ weather.desc }}</span>
      <span class="wt-sep">·</span>
      <span class="wt-hum">{{ weather.humidity }}</span>
      <span class="wt-sep">·</span>
      <span class="wt-wind">{{ weather.wind }}</span>
    </div>
    <div v-else class="weather-chip offline">
      <span class="wt-ico">🌥️</span>
      <span class="wt-msg">天气数据暂不可用 [非实时]</span>
    </div>
    <!-- TASK-13.2 我的灵山足迹入口：紧跟天气 chip 右侧 -->
    <button class="footprint-btn" title="我的灵山足迹" @click="emit('footprint')">👣</button>
  </header>
</template>

<style scoped>
.weather-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px;
}
.logo {
  font-size: 20px; font-weight: 800; letter-spacing: 2px;
  color: #16324A; text-shadow: 0 1px 2px rgba(255,255,255,.6);
}
.weather-chip {
  display: flex; align-items: center; gap: 6px;
  background: rgba(226, 243, 253, .88);
  border: 1px solid rgba(140, 190, 225, .7);
  border-radius: 999px; padding: 5px 14px;
  box-shadow: 0 2px 8px rgba(30,80,120,.12);
}
.wt-ico { font-size: 15px; }
.wt-temp { font-size: 16px; font-weight: 800; color: #16324A; }
.wt-desc, .wt-hum, .wt-wind { font-size: 12px; font-weight: 600; color: #2A4560; }
.wt-sep { color: #6E8BA3; font-size: 11px; }
.weather-chip.offline { background: #F2F2F0; border-color: #D8D8D0; }
.wt-msg { font-size: 12px; font-weight: 600; color: #8a8a80; }
.footprint-btn {
  width: 32px; height: 32px; border-radius: 10px; font-size: 16px;
  border: none; cursor: pointer; flex-shrink: 0;
  background: rgba(255,255,255,.92); box-shadow: 0 3px 10px rgba(20,60,95,.18);
  transition: transform .15s;
}
.footprint-btn:hover { transform: translateY(-2px); }
</style>
