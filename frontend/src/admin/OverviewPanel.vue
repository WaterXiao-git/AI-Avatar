<script setup>
// Admin 概览：核心运营指标 + 反馈分布 + 情感分布（全部来自真实数据接口）
import { ref, nextTick, onMounted } from 'vue'
import * as echarts from 'echarts'
import { getJSON } from '../api/admin'

const summary = ref(null)
const feedback = ref(null)
const sentiment = ref(null)
const loading = ref(true)
const err = ref('')

const chartEl = ref(null)
let chart = null

async function load() {
  loading.value = true
  err.value = ''
  try {
    const [s, f, se] = await Promise.all([
      getJSON('/analytics/summary'),
      getJSON('/analytics/feedback'),
      getJSON('/analytics/sentiment'),
    ])
    summary.value = s
    feedback.value = f
    sentiment.value = se
  } catch (e) {
    err.value = '加载失败：' + e.message + '（请确认后端已启动）'
  } finally {
    loading.value = false
    // 等待 v-else 分支（含 chartEl）渲染完成后，再初始化 echarts
    await nextTick()
    renderFeedbackChart(feedback.value)
  }
}

function renderFeedbackChart(f) {
  if (!f || !chartEl.value) return
  chart = chart || echarts.init(chartEl.value)
  const negTags = (f.tags || []).slice(0, 6)
  chart.setOption({
    title: { text: '点踩原因分布', textStyle: { fontSize: 12, color: '#16324A' } },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['42%', '68%'],
      data: negTags.map(t => ({ name: t.tag, value: t.count })),
      label: { fontSize: 11 },
    }],
  })
}

function pct(a, b) {
  if (!b) return '—'
  return Math.round((a / b) * 100) + '%'
}

onMounted(load)
</script>

<template>
  <div class="ov">
    <h3 class="ov-title">📊 运营概览</h3>

    <div v-if="loading" class="ov-loading">加载中…</div>
    <p v-else-if="err" class="ov-err">{{ err }}</p>

    <template v-else>
      <!-- 核心指标 -->
      <div class="ov-cards">
        <div class="ov-card">
          <p class="ov-num">{{ summary?.sessions_today ?? 0 }}</p>
          <p class="ov-label">今日会话</p>
        </div>
        <div class="ov-card">
          <p class="ov-num">{{ summary?.questions_today ?? 0 }}</p>
          <p class="ov-label">今日提问</p>
        </div>
        <div class="ov-card">
          <p class="ov-num">{{ summary?.avg_first_token_latency_ms ?? 0 }}ms</p>
          <p class="ov-label">平均首字时延</p>
        </div>
        <div class="ov-card">
          <p class="ov-num">
            {{ summary?.explicit_satisfaction_rate == null ? '—' : pct(summary.explicit_satisfaction_rate, 1) }}
          </p>
          <p class="ov-label">满意度(👍/👎)</p>
        </div>
      </div>

      <!-- 反馈分布 -->
      <div class="ov-row">
        <div class="ov-panel">
          <h4>反馈分布</h4>
          <div class="fb-bar">
            <div class="fb-seg pos" :style="{ width: feedback?.total ? (feedback.positive / feedback.total) * 100 + '%' : '0%' }"></div>
            <div class="fb-seg neg" :style="{ width: feedback?.total ? (feedback.negative / feedback.total) * 100 + '%' : '0%' }"></div>
          </div>
          <p class="fb-note">
            👍 {{ feedback?.positive ?? 0 }} · 👎 {{ feedback?.negative ?? 0 }} · 共 {{ feedback?.total ?? 0 }}
          </p>
        </div>

        <div class="ov-panel chart" ref="chartEl"></div>
      </div>

      <!-- 情感（与满意度严格区分） -->
      <div class="ov-panel">
        <h4>游客提问情感 <span class="ov-hint">（规则判断文本情绪，非满意度）</span></h4>
        <div class="sent-row">
          <span class="sent-item pos">😊 {{ sentiment?.counts?.positive ?? 0 }}</span>
          <span class="sent-item neg">😞 {{ sentiment?.counts?.negative ?? 0 }}</span>
          <span class="sent-item neu">😐 {{ sentiment?.counts?.neutral ?? 0 }}</span>
          <span class="sent-total">样本 {{ sentiment?.total ?? 0 }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ov { padding: 4px 8px 12px; }
.ov-title { margin: 0 0 12px; font-size: 16px; color: #16324A; }
.ov-loading { color: #8aa0b5; font-size: 13px; padding: 30px 0; text-align: center; }
.ov-err { color: #d9534f; font-size: 13px; }
.ov-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.ov-card {
  background: #fff; border-radius: 10px; padding: 12px 8px; text-align: center;
  box-shadow: 0 2px 8px rgba(20,60,95,.08);
}
.ov-num { margin: 0; font-size: 22px; font-weight: 800; color: #2385BB; }
.ov-label { margin: 4px 0 0; font-size: 11px; color: #6B7A8D; }
.ov-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.ov-panel { background: #fff; border-radius: 10px; padding: 10px 12px; box-shadow: 0 2px 8px rgba(20,60,95,.08); }
.ov-panel h4 { margin: 0 0 8px; font-size: 13px; color: #16324A; }
.ov-panel.chart { min-height: 180px; }
.ov-hint { font-size: 11px; color: #a0b0c0; font-weight: 400; }
.fb-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: #EEF2F6; }
.fb-seg.pos { background: #2FA878; }
.fb-seg.neg { background: #E0516B; }
.fb-note { margin: 6px 0 0; font-size: 11.5px; color: #4A5F74; }
.sent-row { display: flex; align-items: center; gap: 16px; }
.sent-item { font-size: 13px; font-weight: 700; }
.sent-item.pos { color: #2FA878; }
.sent-item.neg { color: #E0516B; }
.sent-item.neu { color: #8aa0b5; }
.sent-total { margin-left: auto; font-size: 11px; color: #6B7A8D; }
</style>
