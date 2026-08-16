<script setup>
import { ref, onMounted } from 'vue'
import { fetchRoutes } from '../api'

const fallback = [
  { id: 'qf-cy', name: '祈福禅悟线', spots: 10, km: 3, hours: 3, tag: '官方推荐', desc: '祈福增智 身心灵平和', image: '/model/route-qifu.svg' },
  { id: 'wh-tiyan', name: '文化体验线', spots: 21, km: 5, hours: 5, tag: null, desc: '佛教文化 深度探索 洗涤心灵', image: '/model/route-fangong.svg' },
  { id: 'qinzi', name: '亲子喜乐线', spots: 12, km: 3, hours: 3, tag: null, desc: '亲子同游 寓教于乐 其乐融融', image: '/model/route-qinzi.svg' },
  { id: 'shejian', name: '舌尖上的灵山', spots: 8, km: 4, hours: 4, tag: null, desc: '赏艺术 品文化 看非遗', image: '/model/route-food.svg' },
  { id: 'wenbo', name: '文博探索之旅', spots: 4, km: 3, hours: 3, tag: null, desc: '探古寺 赏文物 寻古迹', image: '/model/route-wenbo.svg' },
  { id: 'qingjing', name: '清净自在线', spots: 16, km: 3, hours: 2, tag: null, desc: '惜缘出游 善会得乐 皆大欢喜', image: '/model/route-ginkgo.svg' },
]

const routes = ref(fallback)
onMounted(async () => {
  try { routes.value = await fetchRoutes() } catch (e) { /* 后端未启动用兜底 */ }
})
</script>

<template>
  <section class="route-row">
    <h2 class="route-title">游览路线</h2>
    <div class="route-cards">
      <div class="route-card" v-for="r in routes" :key="r.id">
        <div class="route-pic" :style="{ backgroundImage: `url(${r.image})` }">
          <span v-if="r.tag" class="route-tag">{{ r.tag }}</span>
        </div>
        <div class="route-meta">
          <p class="route-name">{{ r.name }}</p>
          <p class="route-params">{{ r.spots }}景点 · {{ r.km }}公里 · {{ r.hours }}小时</p>
          <p class="route-desc">{{ r.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.route-row {
  flex-shrink: 0; background: rgba(255,255,255,.75);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 10px 12px;
}
.route-title { font-size: 15px; font-weight: 700; color: var(--pink); margin-bottom: 8px; }
.route-cards {
  display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;
}
.route-card {
  width: 170px; flex-shrink: 0; background: var(--card-bg);
  border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;
  cursor: pointer; transition: box-shadow .2s, transform .2s;
}
.route-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); }
.route-pic { height: 84px; background-size: cover; background-position: center; position: relative; }
.route-tag {
  position: absolute; top: 6px; left: 6px; background: var(--accent-yellow);
  color: #5A4500; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
}
.route-meta { padding: 8px 10px; }
.route-name { font-size: 13px; font-weight: 600; }
.route-params { font-size: 11px; color: var(--theme-blue); margin: 2px 0; }
.route-desc { font-size: 11px; color: var(--text-sub); }
</style>
