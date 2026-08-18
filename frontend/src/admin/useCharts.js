// ECharts 轻量封装：绑定一个元素 ref，自动 init / setOption / resize / dispose。
// 每个图表实例独立，组件卸载时释放，避免内存泄漏与多实例叠加。
import * as echarts from 'echarts'

// 看板统一配色：品牌蓝为主色，金色点缀
export const DASH_PALETTE = [
  '#2385BB', '#D4A24E', '#2FA878', '#7C6BD6',
  '#E0516B', '#2AB3A0', '#F2994A', '#6A8CAF',
]

export const AXIS = {
  line: '#E3EBF2',
  label: '#7A8FA3',
  split: '#EEF2F6',
}

export function useChart(elRef, defaultOption = {}) {
  let chart = null

  function setOption(option, notMerge = true) {
    if (!elRef.value) return
    chart = chart || echarts.init(elRef.value)
    chart.setOption({ ...defaultOption, ...option }, notMerge)
    return chart
  }

  function getInstance() {
    if (!chart && elRef.value) chart = echarts.init(elRef.value)
    return chart
  }

  function resize() {
    chart && chart.resize()
  }

  function dispose() {
    if (chart) { chart.dispose(); chart = null }
  }

  return { setOption, getInstance, resize, dispose }
}

// 常见图表公共配置：去掉默认的轴线噪音，统一留白
export function baseChartOption(tooltipExtra = {}) {
  return {
    color: DASH_PALETTE,
    textStyle: { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif' },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, backgroundColor: '#fff', borderColor: '#E3EBF2', textStyle: { color: '#3A5268' }, ...tooltipExtra },
    grid: { left: 42, right: 20, top: 30, bottom: 30 },
  }
}
