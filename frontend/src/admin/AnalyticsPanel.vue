<script setup>
// Admin 游客分析：最近提问 / 景点热度 / 路线完成
import { ref, onMounted } from 'vue'
import { getJSON } from '../api/admin'

const questions = ref([])
const attractions = ref([])
const routes = ref([])
const loading = ref(true)
const err = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    const [q, a, r] = await Promise.all([
      getJSON('/analytics/questions?limit=30'),
      getJSON('/analytics/attractions'),
      getJSON('/analytics/routes'),
    ])
    questions.value = q
    attractions.value = a
    routes.value = r
  } catch (e) {
    err.value = '加载失败：' + e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="ap">
    <h3 class="ap-title">🧑‍🤝‍🧑 游客分析</h3>
    <p v-if="loading" class="ap-loading">加载中…</p>
    <p v-else-if="err" class="ap-err">{{ err }}</p>

    <template v-else>
      <div class="ap-sec">
        <h4>最近提问（{{ questions.length }}）</h4>
        <div class="ap-table-wrap">
          <table class="ap-table">
            <thead><tr><th>#</th><th>问题</th><th>意图</th><th>输入</th><th>首字</th></tr></thead>
            <tbody>
              <tr v-for="(q, i) in questions" :key="q.id">
                <td>{{ i + 1 }}</td>
                <td class="ap-q">{{ q.question || '—' }}</td>
                <td>{{ q.intent || '—' }}</td>
                <td>{{ q.input_type || 'text' }}</td>
                <td>{{ q.first_token_latency_ms != null ? q.first_token_latency_ms + 'ms' : '—' }}</td>
              </tr>
              <tr v-if="!questions.length"><td colspan="5" class="ap-empty">暂无提问记录</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ap-grid">
        <div class="ap-sec">
          <h4>景点热度</h4>
          <ul class="ap-list">
            <li v-for="a in attractions" :key="a.attraction_id">
              <span class="ap-bar" :style="{ width: (a.count / Math.max(attractions[0]?.count, 1) * 100) + '%' }"></span>
              <span class="ap-name">{{ a.name }}</span>
              <span class="ap-count">{{ a.count }}</span>
            </li>
            <li v-if="!attractions.length" class="ap-empty">暂无数据</li>
          </ul>
        </div>

        <div class="ap-sec">
          <h4>路线使用</h4>
          <ul class="ap-list">
            <li v-for="r in routes" :key="r.route_id">
              <span class="ap-name">{{ r.route_id }}</span>
              <span class="ap-count">开始{{ r.starts }} · 完成{{ r.completes }}</span>
            </li>
            <li v-if="!routes.length" class="ap-empty">暂无数据</li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ap { padding: 4px 8px 12px; }
.ap-title { margin: 0 0 12px; font-size: 16px; color: #16324A; }
.ap-loading { color: #8aa0b5; padding: 30px 0; text-align: center; font-size: 13px; }
.ap-err { color: #d9534f; font-size: 13px; }
.ap-sec { background: #fff; border-radius: 10px; padding: 10px 12px; box-shadow: 0 2px 8px rgba(20,60,95,.08); margin-bottom: 12px; }
.ap-sec h4 { margin: 0 0 8px; font-size: 13px; color: #16324A; }
.ap-table-wrap { max-height: 260px; overflow-y: auto; }
.ap-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ap-table th { text-align: left; color: #6B7A8D; font-weight: 700; padding: 5px 6px; border-bottom: 1px solid #EEF2F6; }
.ap-table td { padding: 5px 6px; border-bottom: 1px solid #F5F8FB; color: #3A5268; }
.ap-q { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-empty { color: #a0b0c0; text-align: center; padding: 16px 0; }
.ap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ap-list { list-style: none; margin: 0; padding: 0; }
.ap-list li { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; position: relative; }
.ap-bar { position: absolute; left: 0; top: 0; bottom: 0; background: #E3F2FD; border-radius: 4px; z-index: 0; }
.ap-name { position: relative; z-index: 1; color: #3A5268; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-count { position: relative; z-index: 1; color: #2385BB; font-weight: 700; }
</style>
