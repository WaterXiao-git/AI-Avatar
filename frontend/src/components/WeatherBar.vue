<script setup>
import { ref, onMounted } from 'vue'
import { fetchWeather } from '../api'

const weather = ref({ temp: '36°', desc: '阴', humidity: '53%', wind: '西风', location: '灵山胜境' })
const offline = ref(false)

onMounted(async () => {
  try { weather.value = await fetchWeather() } catch (e) { offline.value = true }
})

// 天气图标按描述取一个 emoji，简单够用
const iconMap = { 晴: '☀️', 多云: '⛅', 阴: '☁️', 小雨: '🌧️', 中雨: '🌧️', 大雨: '🌧️', 雾: '🌫️', 雪: '❄️' }
</script>

<template>
  <header class="weather-bar">
    <span class="logo">灵山导览</span>
    <div class="weather-chip" v-if="!offline">
      <span class="wt-ico">{{ iconMap[weather.desc] || '⛅' }}</span>
      <span class="wt-temp">{{ weather.temp }}</span>
      <span class="wt-sep">·</span>
      <span class="wt-desc">{{ weather.desc }}</span>
      <span class="wt-sep">·</span>
      <span class="wt-hum">{{ weather.humidity }}</span>
      <span class="wt-sep">·</span>
      <span class="wt-wind">{{ weather.wind }}</span>
    </div>
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
</style>
