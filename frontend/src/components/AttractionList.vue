<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchAttractions } from '../api'
import { FALLBACK_ATTRACTIONS } from '../data/fallback'

const emit = defineEmits(['tour'])
defineProps({
  activeId: { type: String, default: null },
})

const items = ref(FALLBACK_ATTRACTIONS)
onMounted(async () => {
  try { items.value = await fetchAttractions() } catch (e) { /* 后端未启动用兜底 */ }
})

// 参考图顶部 5 张带圆形实景图的精选景点卡片
const featured = computed(() => items.value.filter(a => a.image))

function onClick(a) {
  emit('tour', a) // 点击 → 数字人讲解该景点
}
</script>

<template>
  <section class="attraction-row">
    <div
      v-for="a in featured"
      :key="a.id"
      class="attraction-card"
      :class="{ active: a.id === activeId }"
      @click="onClick(a)"
    >
      <div class="a-icon" :style="{ backgroundImage: `url(${a.image})` }"></div>
      <p class="a-name">{{ a.name }}</p>
      <p class="a-desc">{{ a.desc }}</p>
    </div>
  </section>
</template>

<style scoped>
.attraction-row {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 14px;
}
.attraction-card {
  width: 114px; flex-shrink: 0; text-align: center;
  cursor: pointer; user-select: none;
  transition: transform .2s;
}
.attraction-card:hover .a-icon { transform: translateY(-3px) scale(1.04); }
.attraction-card.active .a-icon {
  box-shadow: 0 0 0 4px #FFC107, 0 4px 12px rgba(40,90,160,.3);
}
.a-icon {
  width: 76px; height: 76px; margin: 0 auto 8px;
  border-radius: 50%;
  background-size: cover; background-position: center;
  border: 3px solid #fff;
  box-shadow: 0 4px 12px rgba(40,90,160,.28);
  transition: transform .2s, box-shadow .2s;
}
.a-name {
  font-size: 14px; font-weight: 700; color: #16324A;
  text-shadow: 0 1px 2px rgba(255,255,255,.7);
}
.a-desc {
  font-size: 11px; color: #43596E; margin-top: 3px;
  text-shadow: 0 1px 2px rgba(255,255,255,.7);
  line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 中等屏（769-1200px）：卡片微缩，避免横向滚动 */
@media (max-width: 1200px) and (min-width: 769px) {
  .attraction-card { width: 92px; }
  .a-icon { width: 62px; height: 62px; }
  .a-name { font-size: 13px; }
}

/* 竖屏：卡片更紧凑，5 张全部放进一屏，无需横向滚动 */
@media (max-aspect-ratio: 1/1) {
  .attraction-row { gap: 6px; padding: 8px 12px; }
  .attraction-card { width: 62px; }
  .a-icon { width: 50px; height: 50px; margin-bottom: 5px; border-width: 2px; }
  .a-name { font-size: 11px; }
  .a-desc { display: none; }
}
</style>
