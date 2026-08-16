<script setup>
import { ref, onMounted } from 'vue'
import { fetchAttractions } from '../api'

const fallback = [
  { id: 'ling-dashan-fo', name: '灵山大佛', desc: '世界最高露天青铜释迦牟尼立像' },
  { id: 'ling-shan-fan-gong', name: '灵山梵宫', desc: '佛教艺术的中华瑰宝' },
  { id: 'jiu-long-guan-yu', name: '九龙灌浴', desc: '佛陀诞生的神圣再现' },
  { id: 'wu-yin-tan-cheng', name: '五印坛城', desc: '藏传佛教文化的殿堂' },
  { id: 'xiang-fu-chan-si', name: '祥符禅寺', desc: '千年古刹的历史遗存' },
]

const items = ref(fallback)
onMounted(async () => {
  try { items.value = await fetchAttractions() } catch (e) { /* 后端未启动用兜底 */ }
})
</script>

<template>
  <div class="attraction-list">
    <div class="card" v-for="a in items" :key="a.id">
      <div class="card-body">
        <p class="name">{{ a.name }}</p>
        <p class="desc">{{ a.desc }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.attraction-list {
  display: flex; flex-direction: column; gap: 8px;
  flex: 1; overflow-y: auto; padding-right: 2px;
}
.card {
  background: var(--card-bg); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 10px 12px; cursor: pointer;
  transition: box-shadow .2s, transform .2s;
}
.card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); }
.name { font-size: 14px; font-weight: 600; }
.desc { font-size: 12px; color: var(--text-sub); margin-top: 2px; }
</style>
