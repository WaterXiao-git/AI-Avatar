<script setup>
// Admin 游客分析 —— 多维数据深挖
// 数据来自 /api/analytics/dashboard 一次聚合（含 intent/input/language/mode/route/event/attraction）。
// 默认排除演示数据；跟随全局「包含演示数据」开关。
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'
import { getJSON } from '../api/admin'
import { useChart, DASH_PALETTE, AXIS } from './useCharts'

const props = defineProps({ includeDemo: { type: Boolean, default: false } })

const data = ref(null)
const loading = ref(true)
const err = ref('')

const charts = {}
function reg(name, elRef) { charts[name] = useChart(elRef); return charts[name] }

const elIntent = ref(null)
const elInput = ref(null)
const elRoute = ref(null)
const elEvent = ref(null)
const elAttr = ref(null)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const qs = props.includeDemo ? '?include_demo=true' : ''
    data.value = await getJSON('/analytics/dashboard' + qs)
  } catch (e) {
    err.value = '加载失败：' + e.message + '（请确认后端已启动）'
  } finally {
    loading.value = false
    await nextTick()
    renderAll()
  }
}

watch(() => props.includeDemo, () => load())

function renderAll() {
  Object.values(charts).forEach(c => c.dispose())
  renderDonut(elIntent, data.value?.intents, '提问意图')
  renderDonut(elInput, data.value?.inputs, '输入方式')
  renderRoutes()
  renderEvents()
  renderAttrTop()
}

const grad = (c1, c2) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
  { offset: 0, color: c1 }, { offset: 1, color: c2 }])
const pct = (a, b) => b ? Math.round((a / b) * 100) + '%' : '—'
const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('zh-CN')

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (e) { return iso }
}

function renderDonut(elRef, list, title) {
  const c = reg(title, elRef)
  const rows = (list || []).filter(x => x.value > 0)
  if (!rows.length) { elRef.value && (elRef.value.innerHTML = ''); return }
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'item', formatter: '{b}：{c}（{d}%）' },
    legend: { bottom: 0, type: 'scroll', textStyle: { color: '#7A8FA3', fontSize: 10 }, itemWidth: 10, itemHeight: 10, icon: 'circle' },
    series: [{
      type: 'pie', radius: ['46%', '70%'], center: ['50%', '44%'],
      label: { show: false }, labelLine: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 700 } },
      data: rows,
    }],
  })
}

function renderRoutes() {
  const c = reg('route', elRoute)
  const r = data.value?.routes || []
  if (!r.length) { elRoute.value && (elRoute.value.innerHTML = ''); return }
  const names = r.map(x => String(x.route_id).length > 10 ? String(x.route_id).slice(0, 10) + '…' : String(x.route_id))
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis' },
    legend: { data: ['点击', '开始', '完成'], top: 0, right: 0, textStyle: { color: '#7A8FA3', fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    grid: { left: 42, right: 16, top: 32, bottom: 30 },
    xAxis: { type: 'category', data: names, axisLabel: { color: AXIS.label, fontSize: 10, rotate: 28 }, axisLine: { lineStyle: { color: AXIS.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    series: [
      { name: '点击', type: 'bar', barMaxWidth: 14, data: r.map(x => x.clicks), itemStyle: { color: '#8AA0B5', borderRadius: [3, 3, 0, 0] } },
      { name: '开始', type: 'bar', barMaxWidth: 14, data: r.map(x => x.starts), itemStyle: { color: grad('#2385BB', '#4AA7D9'), borderRadius: [3, 3, 0, 0] } },
      { name: '完成', type: 'bar', barMaxWidth: 14, data: r.map(x => x.completes), itemStyle: { color: grad('#D4A24E', '#E4BC74'), borderRadius: [3, 3, 0, 0] } },
    ],
  })
}

function renderEvents() {
  const c = reg('event', elEvent)
  const e = (data.value?.event_types || []).filter(x => x.value > 0).slice(0, 8).slice().reverse()
  if (!e.length) { elEvent.value && (elEvent.value.innerHTML = ''); return }
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    yAxis: { type: 'category', data: e.map(x => x.name), axisLine: { lineStyle: { color: AXIS.line } }, axisLabel: { color: '#4A5F74', fontSize: 11 }, axisTick: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 13, data: e.map((x, i) => ({
        value: x.value, itemStyle: { color: grad(DASH_PALETTE[i % DASH_PALETTE.length], '#EAF2F9'), borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', fontSize: 10, color: '#5A7186' },
    }],
  })
}

function renderAttrTop() {
  const c = reg('attr', elAttr)
  const a = (data.value?.attractions || []).slice(0, 20).slice().reverse()
  if (!a.length) { elAttr.value && (elAttr.value.innerHTML = ''); return }
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 44, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    yAxis: { type: 'category', data: a.map(x => (x.name || x.attraction_id).length > 9 ? (x.name || x.attraction_id).slice(0, 9) + '…' : (x.name || x.attraction_id)), axisLine: { lineStyle: { color: AXIS.line } }, axisLabel: { color: '#4A5F74', fontSize: 11 }, axisTick: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 13, data: a.map((x, i) => ({
        value: x.count, itemStyle: { color: grad(i % 2 ? '#D4A24E' : '#2385BB', '#EAF2F9'), borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', fontSize: 10, color: '#5A7186' },
    }],
  })
}

// 语言 / 模式：小列表 + 进度条（文本维度，图表更适合数字维度）
function statRows(list) {
  if (!(list || []).length) return []
  const max = Math.max(...list.map(x => x.value))
  return (list || []).map(x => ({ ...x, p: max ? Math.round((x.value / max) * 100) : 0 }))
}

onMounted(load)
onBeforeUnmount(() => { Object.values(charts).forEach(c => c.dispose()) })
</script>

<template>
  <div class="dash-bg">
    <h2 class="dash-title">🧑‍🤝‍🧑 游客分析</h2>
    <p class="dash-sub">多维数据深挖 · 意图 / 输入 / 语言 / 模式 / 路线 / 事件 / 景点热度</p>

    <div class="dash-meta">
      <span>🕐 数据更新于 <b>{{ data ? fmtTime(data.generated_at) : '—' }}</b></span>
      <span class="dash-badge real">✓ {{ includeDemo ? '已包含演示数据' : '已排除演示数据' }}</span>
      <span class="dash-badge info">样本 {{ data ? fmt(data.kpi.sessions_total) : 0 }} 会话 / {{ data ? fmt(data.kpi.questions_total) : 0 }} 提问</span>
    </div>

    <div v-if="loading" class="dash-empty">数据加载中…</div>
    <p v-else-if="err" class="ov-err">{{ err }}</p>

    <template v-else-if="data">
      <!-- 第 1 行：意图 / 输入 / 语言与模式 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd"><h4>🎯 提问意图分布</h4><span class="sub">游客最常咨询什么</span></div>
          <div class="dash-chart sm" ref="elIntent"></div>
          <p v-if="!(data.intents || []).filter(x=>x.value).length" class="dash-empty">暂无意图记录</p>
        </div>
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd"><h4>🎤 输入方式</h4><span class="sub">文字 / 语音</span></div>
          <div class="dash-chart sm" ref="elInput"></div>
          <p v-if="!(data.inputs || []).filter(x=>x.value).length" class="dash-empty">暂无输入记录</p>
          <p v-else class="input-note">
            <span v-for="x in data.inputs" :key="x.name">
              {{ x.name === 'text' ? '⌨️ 文字' : x.name === 'voice' ? '🎤 语音' : x.name }} {{ fmt(x.value) }}
            </span>
          </p>
        </div>
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd"><h4>🌐 语言 / 版本模式</h4><span class="sub">会话维度</span></div>
          <div class="lang-mode">
            <div class="lm-sec">
              <p class="lm-title">语言</p>
              <div v-for="r in statRows(data.languages)" :key="r.name" class="lm-row">
                <span class="lm-name">{{ r.name === 'zh' ? '中文' : r.name === 'en' ? 'English' : r.name }}</span>
                <span class="prog" style="flex:1"><span class="pos" :style="{ width: r.p + '%' }"></span></span>
                <span class="lm-cnt">{{ r.value }}</span>
              </div>
              <p v-if="!statRows(data.languages).length" class="dash-empty" style="padding:14px 0">暂无</p>
            </div>
            <div class="lm-sec">
              <p class="lm-title">模式</p>
              <div v-for="r in statRows(data.modes)" :key="r.name" class="lm-row">
                <span class="lm-name">{{ r.name }}</span>
                <span class="prog" style="flex:1"><span class="pos" :style="{ width: r.p + '%' }"></span></span>
                <span class="lm-cnt">{{ r.value }}</span>
              </div>
              <p v-if="!statRows(data.modes).length" class="dash-empty" style="padding:14px 0">暂无</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 第 2 行：路线使用 + 事件类型 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 7">
          <div class="dash-card-hd"><h4>🗺️ 路线使用情况</h4><span class="sub">点击 / 开始 / 完成 三次点击对比</span></div>
          <div class="dash-chart" ref="elRoute"></div>
          <p v-if="!(data.routes || []).length" class="dash-empty">暂无路线使用记录</p>
        </div>
        <div class="dash-card" style="grid-column: span 5">
          <div class="dash-card-hd"><h4>⚙️ 事件类型分布</h4><span class="sub">埋点行为 Top 8</span></div>
          <div class="dash-chart" ref="elEvent"></div>
          <p v-if="!(data.event_types || []).filter(x=>x.value).length" class="dash-empty">暂无事件记录</p>
        </div>
      </div>

      <!-- 第 3 行：景点热度 + 最近提问 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 6">
          <div class="dash-card-hd"><h4>🔥 景点热度全榜</h4><span class="sub">提问关联 + 行为事件合并，Top 20</span></div>
          <div class="dash-chart" ref="elAttr"></div>
          <p v-if="!(data.attractions || []).length" class="dash-empty">暂无景点热度数据</p>
        </div>
        <div class="dash-card" style="grid-column: span 6">
          <div class="dash-card-hd"><h4>🕒 最近提问</h4><span class="sub">最新 {{ (data.questions || []).length }} 条（含意图与首字时延）</span></div>
          <div class="dash-tbl-wrap">
            <table class="dash-tbl">
              <thead><tr><th>时间</th><th>问题</th><th>意图</th><th>输入</th><th>首字</th></tr></thead>
              <tbody>
                <tr v-for="q in data.questions" :key="q.id">
                  <td style="white-space:nowrap">{{ fmtTime(q.created_at) }}</td>
                  <td class="q-cell" :title="q.question">{{ q.question || '—' }}</td>
                  <td><span class="chip" :class="q.intent ? (q.intent === '其他' ? 'gray' : '') : 'gray'">{{ q.intent || '未识别' }}</span></td>
                  <td>{{ q.input_type === 'voice' ? '🎤' : '⌨️' }} {{ q.input_type || 'text' }}</td>
                  <td style="font-variant-numeric:tabular-nums">{{ q.first_token_latency_ms != null ? q.first_token_latency_ms + 'ms' : '—' }}</td>
                </tr>
                <tr v-if="!(data.questions || []).length"><td colspan="5" class="dash-empty">暂无提问记录</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ov-err { color: #d9534f; font-size: 13px; padding: 20px 4px; }
.q-cell { max-width: 260px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.lang-mode { display: flex; gap: 18px; }
.lm-sec { flex: 1; }
.lm-title { margin: 2px 0 8px; font-size: 11.5px; font-weight: 700; color: #5A7186; }
.lm-row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; font-size: 11px; }
.lm-name { width: 52px; color: #4A5F74; white-space: nowrap; }
.lm-cnt { color: #2385BB; font-weight: 700; width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
.input-note { margin: 6px 0 0; display: flex; justify-content: center; gap: 18px; font-size: 12px; color: #5A7186; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
