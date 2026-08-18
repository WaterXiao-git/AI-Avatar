<script setup>
// Admin 概览 —— 景区运营数据看板（浅色现代商务风）
// 全部指标来自 /api/analytics/dashboard 真实聚合；默认排除演示数据。
// 可信度原则：每个数字都带来源/样本说明，满意度(👍/👎) 与情感(文本规则判断) 严格分开。
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'
import { getJSON } from '../api/admin'
import { useChart, DASH_PALETTE, AXIS } from './useCharts'

const props = defineProps({ includeDemo: { type: Boolean, default: false } })

const data = ref(null)
const loading = ref(true)
const err = ref('')

// 图表实例注册表（按名字管理，便于统一 dispose）
const charts = {}
function reg(name, elRef) { charts[name] = useChart(elRef); return charts[name] }

const elTrend = ref(null)
const elFunnel = ref(null)
const elHourly = ref(null)
const elAttr = ref(null)
const elFac = ref(null)
const elSent = ref(null)

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

watch(() => props.includeDemo, () => { load() })

function renderAll() {
  // 先释放旧实例（数据切换后 DOM 元素会重建），再重新渲染
  Object.values(charts).forEach(c => c.dispose())
  renderTrend()
  renderFunnel()
  renderHourly()
  renderAttractions()
  renderFacilities()
  renderSentiment()
}

// ---------- 工具 ----------
const grad = (c1, c2) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
  { offset: 0, color: c1 }, { offset: 1, color: c2 }])

function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—' }
function rate(v) { return v == null ? '—' : Math.round(v * 100) + '%' }
function fmt(n) { return n == null ? '—' : Number(n).toLocaleString('zh-CN') }

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai', hour12: false,
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch (e) { return iso }
}

// ---------- 图表渲染 ----------
function renderTrend() {
  const c = reg('trend', elTrend)
  const d = data.value
  if (!d || !d.trend) return
  const labels = (d.trend.days || []).map(x => x.slice(5).replace('-', '/'))
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis' },
    legend: { data: ['会话', '提问', '事件'], top: 0, right: 0, textStyle: { color: '#7A8FA3', fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    grid: { left: 42, right: 16, top: 34, bottom: 26 },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLine: { lineStyle: { color: AXIS.line } }, axisLabel: { color: AXIS.label, fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    series: [
      { name: '会话', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: d.trend.sessions, lineStyle: { width: 2.5 }, itemStyle: { color: '#2385BB' }, areaStyle: { color: grad('rgba(35,133,187,0.16)', 'rgba(35,133,187,0)') } },
      { name: '提问', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: d.trend.questions, lineStyle: { width: 2.5 }, itemStyle: { color: '#D4A24E' } },
      { name: '事件', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: d.trend.events, lineStyle: { width: 2.5 }, itemStyle: { color: '#2FA878' } },
    ],
  })
}

function renderFunnel() {
  const c = reg('funnel', elFunnel)
  const d = data.value
  // 注意：各环节事件为「独立统计」，不是严格转化链路（如 route_start 可能直接触发而未经 page_open），
  // 因此用「旅程顺序的水平条」而非漏斗图展示，避免暗示 >100% 的转化率。
  const f = (d?.funnel || []).filter(x => x.value > 0)
  if (!f.length) { elFunnel.value && (elFunnel.value.innerHTML = ''); return }
  const maxV = Math.max(...f.map(x => x.value))
  const bars = f.slice().reverse() // yAxis category 反转，让「打开页面」显示在最上方
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 42, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    yAxis: { type: 'category', data: bars.map(x => x.name), axisLine: { lineStyle: { color: AXIS.line } }, axisLabel: { color: '#4A5F74', fontSize: 11 }, axisTick: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 14, data: bars.map((x, i) => ({
        value: x.value,
        itemStyle: { color: grad(DASH_PALETTE[(f.length - 1 - i) % DASH_PALETTE.length], '#EAF2F9'), borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', fontSize: 10, color: '#5A7186' },
    }],
  })
}

function renderHourly() {
  const c = reg('hourly', elHourly)
  const d = data.value
  if (!d || !d.hourly) return
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis' },
    legend: { data: ['提问', '事件'], top: 0, right: 0, textStyle: { color: '#7A8FA3', fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    grid: { left: 38, right: 14, top: 32, bottom: 26 },
    xAxis: { type: 'category', data: (d.hourly.hours || []).map(h => String(h).padStart(2, '0') + ':00'), axisLabel: { color: AXIS.label, fontSize: 9, interval: 2 }, axisLine: { lineStyle: { color: AXIS.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    series: [
      { name: '提问', type: 'bar', data: d.hourly.questions, barMaxWidth: 12, itemStyle: { color: grad('#2385BB', '#4AA7D9'), borderRadius: [3, 3, 0, 0] } },
      { name: '事件', type: 'bar', data: d.hourly.events, barMaxWidth: 12, itemStyle: { color: grad('#D4A24E', '#E4BC74'), borderRadius: [3, 3, 0, 0] } },
    ],
  })
}

function renderAttractions() {
  const c = reg('attr', elAttr)
  const a = (data.value?.attractions || []).slice(0, 8).slice().reverse()
  if (!a.length) { elAttr.value && (elAttr.value.innerHTML = ''); return }
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 42, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: AXIS.split } }, axisLabel: { color: AXIS.label, fontSize: 10 } },
    yAxis: { type: 'category', data: a.map(x => (x.name || x.attraction_id).length > 7 ? (x.name || x.attraction_id).slice(0, 7) + '…' : (x.name || x.attraction_id)), axisLine: { lineStyle: { color: AXIS.line } }, axisLabel: { color: '#4A5F74', fontSize: 11 }, axisTick: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 14, data: a.map((x, i) => ({
        value: x.count,
        itemStyle: { color: grad('#2385BB', i % 2 ? '#D4A24E' : '#4AA7D9'), borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', fontSize: 10, color: '#5A7186' },
    }],
  })
}

function renderFacilities() {
  const c = reg('fac', elFac)
  const f = data.value?.facilities || []
  if (!f.length) { elFac.value && (elFac.value.innerHTML = ''); return }
  c.setOption({
    color: DASH_PALETTE,
    tooltip: { trigger: 'item', formatter: '{b}：{c} 次（{d}%）' },
    legend: { bottom: 0, textStyle: { color: '#7A8FA3', fontSize: 10 }, itemWidth: 10, itemHeight: 10, icon: 'circle' },
    series: [{
      type: 'pie', radius: ['46%', '70%'], center: ['50%', '44%'],
      label: { show: false }, labelLine: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 700 } },
      data: f.map(x => ({ name: x.name, value: x.value })),
    }],
  })
}

function renderSentiment() {
  const c = reg('sent', elSent)
  const s = data.value?.sentiment
  const counts = s?.counts || {}
  const vals = [
    { name: '正向', value: counts.positive || 0 },
    { name: '中性', value: counts.neutral || 0 },
    { name: '负向', value: counts.negative || 0 },
  ]
  if (!s || !vals.reduce((m, v) => m + v.value, 0)) { elSent.value && (elSent.value.innerHTML = ''); return }
  c.setOption({
    color: ['#2FA878', '#C3D0DC', '#E0516B'],
    tooltip: { trigger: 'item', formatter: '{b}：{c} 条（{d}%）' },
    legend: { bottom: 0, textStyle: { color: '#7A8FA3', fontSize: 10 }, itemWidth: 10, itemHeight: 10, icon: 'circle' },
    series: [{
      type: 'pie', radius: ['46%', '70%'], center: ['50%', '44%'],
      label: { show: false }, labelLine: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 700 } },
      data: vals.filter(v => v.value > 0),
    }],
  })
}

onMounted(load)
onBeforeUnmount(() => { Object.values(charts).forEach(c => c.dispose()) })
</script>

<template>
  <div class="dash-bg">
    <!-- 标题 + 可信度条 -->
    <h2 class="dash-title">📊 景区运营数据看板</h2>
    <p class="dash-sub">灵山景区数字化导览 · 全部指标来自真实数据聚合，不做任何虚构</p>

    <div class="dash-meta">
      <span>🕐 数据更新于 <b>{{ data ? fmtTime(data.generated_at) : '—' }}</b></span>
      <span class="dash-badge real">✓ {{ includeDemo ? '已包含演示数据' : '已排除演示数据（is_demo=0）' }}</span>
      <span class="dash-badge info">样本 {{ data ? fmt(data.kpi.sessions_total) : 0 }} 会话 / {{ data ? fmt(data.kpi.questions_total) : 0 }} 提问</span>
      <span>统计口径：Asia/Shanghai 时区，近 {{ data?.days?.length || 7 }} 天</span>
    </div>

    <div v-if="loading" class="dash-empty">数据加载中…</div>
    <p v-else-if="err" class="ov-err">{{ err }}</p>

    <template v-else-if="data">
      <!-- 8 个核心 KPI -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#E8F2FB">🗓️</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ fmt(data.kpi.sessions_today) }}</p>
            <p class="kpi-label">今日会话</p>
            <p class="kpi-foot">累计 {{ fmt(data.kpi.sessions_total) }}</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#E4F6F2">💬</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ fmt(data.kpi.questions_today) }}</p>
            <p class="kpi-label">今日提问</p>
            <p class="kpi-foot">累计 {{ fmt(data.kpi.questions_total) }}</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#FFF4E0">🗺️</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ fmt(data.kpi.guide_starts) }}</p>
            <p class="kpi-label">讲解服务</p>
            <p class="kpi-foot">景点到达 {{ fmt(data.kpi.arrivals) }} 次</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#EFEBFC">🎯</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ rate(data.kpi.rag_hit_rate) }}</p>
            <p class="kpi-label">RAG 命中率</p>
            <p class="kpi-foot">基于全部提问</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#FDF0E6">⚡</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ data.kpi.avg_first_token_latency_ms ?? '—' }}<small>ms</small></p>
            <p class="kpi-label">平均首字时延</p>
            <p class="kpi-foot">P95 {{ data.kpi.p95_first_token_latency_ms ?? '—' }}ms</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#E6F6EE">👍</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ rate(data.kpi.explicit_satisfaction_rate) }}</p>
            <p class="kpi-label">游客满意度</p>
            <p class="kpi-foot">👍/👎 反馈 {{ fmt(data.kpi.feedback_total) }} 条</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#FDEBEE">🏁</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ fmt(data.kpi.route_completes) }}</p>
            <p class="kpi-label">路线完成</p>
            <p class="kpi-foot">累计完成次数</p>
          </div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon" style="background:#E8F2FB">🎤</span>
          <div class="kpi-body">
            <p class="kpi-num">{{ fmt(data.kpi.voice_count) }}</p>
            <p class="kpi-label">语音提问</p>
            <p class="kpi-foot">定位开启率 {{ rate(data.kpi.location_enabled_rate) }}</p>
          </div>
        </div>
      </div>

      <!-- 第 1 行：趋势 + 漏斗 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 8">
          <div class="dash-card-hd">
            <h4>📈 近 7 日运营趋势</h4>
            <span class="sub">会话 · 提问 · 事件（每日）</span>
          </div>
          <div class="dash-chart" ref="elTrend"></div>
        </div>
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd">
            <h4>🔻 游客旅程环节</h4>
            <span class="sub">各环节事件量（独立统计，非转化链路）</span>
          </div>
          <div class="dash-chart" ref="elFunnel"></div>
        </div>
      </div>

      <!-- 第 2 行：时段 + 景点热度 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 7">
          <div class="dash-card-hd">
            <h4>⏰ 今日 24 小时客流时段</h4>
            <span class="sub">今日各整点提问 / 事件量</span>
          </div>
          <div class="dash-chart" ref="elHourly"></div>
        </div>
        <div class="dash-card" style="grid-column: span 5">
          <div class="dash-card-hd">
            <h4>🔥 景点热度 Top 8</h4>
            <span class="sub">提问关联 + 行为事件合并</span>
          </div>
          <div class="dash-chart" ref="elAttr"></div>
        </div>
      </div>

      <!-- 第 3 行：设施 / 情感 / 反馈 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd">
            <h4>🚻 设施查询需求</h4>
            <span class="sub">游客询问卫生间/餐厅/停车等</span>
          </div>
          <div class="dash-chart sm" ref="elFac"></div>
          <p v-if="!(data.facilities || []).length" class="dash-empty">暂无设施查询记录</p>
        </div>
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd">
            <h4>😊 游客提问情感</h4>
            <span class="sub">规则判断文本情绪，非满意度</span>
          </div>
          <div class="dash-chart sm" ref="elSent"></div>
          <p class="sent-note">样本 {{ data.sentiment?.total ?? 0 }} 条 ·
            正向 <b class="c-pos">{{ data.sentiment?.counts?.positive ?? 0 }}</b> ·
            中性 <b class="c-neu">{{ data.sentiment?.counts?.neutral ?? 0 }}</b> ·
            负向 <b class="c-neg">{{ data.sentiment?.counts?.negative ?? 0 }}</b></p>
          <p v-if="data.sentiment && (data.sentiment.counts.positive + data.sentiment.counts.negative) === 0"
             class="sent-hint">💡 本期样本以事实咨询类问题为主，情绪判断偏中性属正常现象</p>
        </div>
        <div class="dash-card" style="grid-column: span 4">
          <div class="dash-card-hd">
            <h4>📢 反馈分布</h4>
            <span class="sub">用户明确 👍 / 👎</span>
          </div>
          <div class="fb-big">
            <span class="fb-num pos">👍 {{ data.feedback?.positive ?? 0 }}</span>
            <span class="fb-num neg">👎 {{ data.feedback?.negative ?? 0 }}</span>
            <span class="fb-total">共 {{ data.feedback?.total ?? 0 }} 条</span>
          </div>
          <div class="prog" style="margin:10px 0 6px">
            <div class="pos" :style="{ width: pct(data.feedback?.positive, data.feedback?.total) }"></div>
            <div class="neg" :style="{ width: pct(data.feedback?.negative, data.feedback?.total) }"></div>
          </div>
          <div class="prog-legend">
            <span><i class="dot pos"></i>满意 👍</span>
            <span><i class="dot neg"></i>不满意 👎</span>
            <span class="fb-pct">{{ pct(data.feedback?.positive, data.feedback?.total) }} 好评</span>
          </div>
          <p class="neg-title" v-if="(data.feedback?.tags || []).length">点踩原因：</p>
          <div class="chip-row">
            <span v-for="t in (data.feedback?.tags || []).slice(0, 4)" :key="t.tag" class="chip red">{{ t.tag }} {{ t.count }}</span>
            <span v-if="!(data.feedback?.tags || []).length" class="chip gray">暂无点踩标签</span>
          </div>
        </div>
      </div>

      <!-- 第 4 行：知识库 + 游客评论 -->
      <div class="dash-grid">
        <div class="dash-card" style="grid-column: span 6">
          <div class="dash-card-hd">
            <h4>📚 知识库规模</h4>
            <span class="sub">RAG 索引真实分块</span>
          </div>
          <div class="kb-row">
            <div class="kb-item"><b>{{ fmt(data.knowledge?.chunks) }}</b><span>知识分块</span></div>
            <div class="kb-item"><b>{{ fmt(data.knowledge?.faqs) }}</b><span>常见问答</span></div>
            <div class="kb-item"><b>{{ fmt(data.knowledge?.docs) }}</b><span>上传文档</span></div>
          </div>
          <div v-if="Object.keys(data.knowledge?.sources || {}).length" class="kb-src">
            <div v-for="(c, s) in data.knowledge.sources" :key="s" class="kb-src-row">
              <span class="kb-src-name" :title="s">{{ s.length > 26 ? s.slice(-26) : s }}</span>
              <span class="prog" style="flex:1"><span class="pos" :style="{ width: pct(c, data.knowledge.chunks) }"></span></span>
              <span class="kb-src-cnt">{{ c }}</span>
            </div>
          </div>
        </div>
        <div class="dash-card" style="grid-column: span 6">
          <div class="dash-card-hd">
            <h4>💬 游客反馈与评论</h4>
            <span class="sub">最近 {{ data.feedback?.comments?.length || 0 }} 条文字反馈</span>
          </div>
          <div v-if="(data.feedback?.comments || []).length" class="comment-list">
            <p v-for="(cm, i) in data.feedback.comments" :key="i" class="comment-item">“{{ cm }}”</p>
          </div>
          <p v-else class="dash-empty">暂无文字评论（点 👍 / 👎 会记录，但游客可补充意见）</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ov-err { color: #d9534f; font-size: 13px; padding: 20px 4px; }
.sent-note { margin: 4px 0 0; font-size: 11.5px; color: #7A8FA3; text-align: center; }
.c-pos { color: #2FA878; } .c-neu { color: #8AA0B5; } .c-neg { color: #E0516B; }
.fb-big { display: flex; align-items: baseline; gap: 14px; }
.fb-num { font-size: 18px; font-weight: 800; }
.fb-num.pos { color: #2FA878; } .fb-num.neg { color: #E0516B; }
.fb-total { margin-left: auto; font-size: 11px; color: #7A8FA3; }
.prog-legend { display: flex; align-items: center; gap: 14px; font-size: 11px; color: #6B7A8D; margin-bottom: 4px; }
.prog-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
.prog-legend .dot.pos { background: #2FA878; }
.prog-legend .dot.neg { background: #E0516B; }
.prog-legend .fb-pct { margin-left: auto; color: #2385BB; font-weight: 700; }
.neg-title { margin: 8px 0 5px; font-size: 11px; color: #6B7A8D; }
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.sent-hint { margin: 8px 0 0; font-size: 11px; color: #B7791F; background: #FFF7E8; border-radius: 6px; padding: 6px 9px; line-height: 1.5; }
.kb-row { display: flex; gap: 18px; margin-bottom: 12px; }
.kb-item { flex: 1; text-align: center; background: #F7FBFE; border: 1px solid #E8F2FB; border-radius: 10px; padding: 10px 4px; }
.kb-item b { display: block; font-size: 20px; color: #2385BB; font-variant-numeric: tabular-nums; }
.kb-item span { font-size: 11px; color: #7A8FA3; }
.kb-src { display: flex; flex-direction: column; gap: 7px; }
.kb-src-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.kb-src-name { color: #5A7186; max-width: 45%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kb-src-cnt { color: #2385BB; font-weight: 700; font-variant-numeric: tabular-nums; }
.comment-list { display: flex; flex-direction: column; gap: 8px; max-height: 170px; overflow-y: auto; }
.comment-item { margin: 0; padding: 7px 10px; background: #F7FBFE; border-left: 3px solid #D4A24E; border-radius: 6px; font-size: 12px; color: #3A5268; line-height: 1.5; }
</style>
