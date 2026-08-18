<script setup>
// TASK-13.2 我的灵山足迹：只展示真实事件聚合的到访景点（后端 /api/footprint），
// 禁止 LLM 猜测游客去过哪里。
import { ref, watch } from 'vue'
import { fetchFootprint } from '../api'

const props = defineProps({
  open: { type: Boolean, default: false },
  sessionId: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const data = ref(null)
const loading = ref(false)
const err = ref('')

watch(() => props.open, async (v) => {
  if (!v) return
  loading.value = true; err.value = ''
  try {
    data.value = await fetchFootprint(props.sessionId)
  } catch (e) {
    err.value = '足迹加载失败：' + e.message
  } finally {
    loading.value = false
  }
}, { immediate: true })

function fmtTime(t) {
  if (!t) return ''
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
</script>

<template>
  <div v-if="open" class="fp-mask" @click.self="emit('close')">
    <div class="fp-box">
      <div class="fp-head">
        <span class="fp-title">👣 我的灵山足迹</span>
        <button class="fp-close" @click="emit('close')">✕</button>
      </div>

      <div v-if="loading" class="fp-tip">加载中…</div>
      <p v-else-if="err" class="fp-err">{{ err }}</p>

      <template v-else-if="data">
        <!-- R2-08：包含演示到访时，显示 has_demo 提示条（后端 note 原样展示，明确非真实足迹） -->
        <p v-if="data.has_demo" class="fp-demo-banner">🎬 {{ data.note }}</p>

        <div class="fp-stats">
          <span class="fp-stat"><b>{{ data.visited_count }}</b> 到访景点</span>
          <span class="fp-stat"><b>{{ data.routes_completed }}</b> 条路线完成</span>
        </div>

        <p v-if="!data.visited.length" class="fp-empty">
          还没有游览记录。开启「随行讲解」或开始一条路线，足迹会记录你真正到过的景点。
        </p>

        <ul v-else class="fp-list">
          <li v-for="(v, i) in data.visited" :key="v.id" class="fp-item">
            <span class="fp-idx">{{ i + 1 }}</span>
            <div class="fp-info">
              <p class="fp-name">
                {{ v.name }}
                <!-- R2-08：单条演示到访标记「[演示]」 -->
                <span v-if="v.is_demo" class="fp-demo-badge">[演示]</span>
              </p>
              <p v-if="v.intro" class="fp-intro">{{ v.intro }}</p>
            </div>
            <span v-if="v.first_seen_at" class="fp-date">{{ fmtTime(v.first_seen_at) }}</span>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fp-mask {
  position: fixed; inset: 0; z-index: 8000;
  background: rgba(15,35,60,.45); display: flex; align-items: center; justify-content: center;
}
.fp-box {
  width: min(420px, 92vw); max-height: 78vh; display: flex; flex-direction: column;
  background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(15,35,60,.35);
  padding: 14px 16px;
}
.fp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.fp-title { font-size: 15px; font-weight: 800; color: #16324A; }
.fp-close {
  border: none; cursor: pointer; background: #EEF2F6; color: #4A5F74;
  width: 26px; height: 26px; border-radius: 8px; font-size: 13px;
}
.fp-close:hover { background: #E0E8F0; }
.fp-tip, .fp-err { font-size: 13px; color: #8aa0b5; padding: 24px 0; text-align: center; }
.fp-err { color: #d9534f; }
.fp-demo-banner {
  font-size: 12px; color: #9A6B00; background: #FFF7E0; border: 1px solid #F0C96B;
  border-radius: 8px; padding: 7px 10px; margin-bottom: 10px; line-height: 1.5;
}
.fp-demo-badge {
  display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 800; color: #B7791F;
  background: #FFF7E0; border: 1px solid #F0C96B; border-radius: 4px; padding: 0 4px;
  vertical-align: 1px;
}
.fp-stats { display: flex; gap: 12px; margin-bottom: 10px; }
.fp-stat {
  flex: 1; background: #F5F9FC; border-radius: 10px; padding: 8px 10px;
  font-size: 12px; color: #6B7A8D; text-align: center;
}
.fp-stat b { font-size: 18px; color: #2385BB; display: block; }
.fp-empty { font-size: 13px; color: #6B7A8D; background: #FBF7F0; border-radius: 10px; padding: 16px; line-height: 1.6; }
.fp-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.fp-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 8px;
  border-bottom: 1px solid #EFF3F7;
}
.fp-item:last-child { border-bottom: none; }
.fp-idx {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg, #FFB347, #FF7BAC); color: #fff;
  font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center;
}
.fp-info { flex: 1; min-width: 0; }
.fp-name { margin: 0; font-size: 13.5px; font-weight: 700; color: #16324A; }
.fp-intro { margin: 2px 0 0; font-size: 11.5px; color: #6B7A8D; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-date { flex-shrink: 0; font-size: 11px; color: #A0B0C0; }
</style>
