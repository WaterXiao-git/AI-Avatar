import { ref } from 'vue'

// TASK-13.3 多语言：zh-CN / en-US。模块级单例，全局共享语言状态。
const language = ref('zh-CN')

// 欢迎词（与后端 avatar_config 同步，这里按语言给默认兜底）
const WELCOME = {
  'zh-CN': '你好呀！我是小灵，有什么可以帮助您？',
  'en-US': "Hi! I'm Xiao Ling. How can I help you explore Lingshan today?",
}

// 预设问题（语言切换时 ChatPanel 展示对应文案）
const PRESETS = {
  'zh-CN': [
    { label: '推荐经典路线', tour: { type: 'route', id: 'qifu', label: '推荐经典路线' } },
    { label: '九龙灌浴几点看最合适？', tour: { type: 'attraction', id: 'jiu-long-guan-yu', label: '九龙灌浴几点看最合适？' } },
    { label: '带娃怎么玩最合适？', tour: { type: 'route', id: 'qinzi', label: '带娃怎么玩最合适？' } },
    { label: '想拍美照推荐哪条线？', tour: { type: 'route', id: 'wenhua', label: '想拍美照推荐哪条线？' } },
    { label: '今天门票多少钱？', tour: null },
  ],
  'en-US': [
    { label: 'Recommended classic route', tour: { type: 'route', id: 'qifu', label: 'Recommended classic route' } },
    { label: "Best time to watch Nine Dragon Bath?", tour: { type: 'attraction', id: 'jiu-long-guan-yu', label: 'Best time to watch Nine Dragon Bath?' } },
    { label: 'Best way to visit with kids?', tour: { type: 'route', id: 'qinzi', label: 'Best way to visit with kids?' } },
    { label: 'Which route is best for photos?', tour: { type: 'route', id: 'wenhua', label: 'Which route is best for photos?' } },
    { label: 'How much are tickets today?', tour: null },
  ],
}

function setLanguage(lang) {
  if (lang !== 'zh-CN' && lang !== 'en-US') return
  language.value = lang
  try { localStorage.setItem('lingshan_lang', lang) } catch (e) {}
}

// 从本地存储恢复上次语言
try {
  const saved = localStorage.getItem('lingshan_lang')
  if (saved === 'en-US') language.value = 'en-US'
} catch (e) {}

export function useI18n() {
  return {
    language,
    setLanguage,
    welcome: () => WELCOME[language.value] || WELCOME['zh-CN'],
    presets: () => PRESETS[language.value] || PRESETS['zh-CN'],
    t: (zh, en) => (language.value === 'en-US' ? en : zh),
  }
}
