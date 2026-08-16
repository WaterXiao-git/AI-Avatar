# 灵山导览 · 魔珐星云数字人导览页 制作计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按参考图 `参考图.jpg` 一比一复刻「灵山导览」数字人导览页面 —— 含顶部信息栏、中部三栏（景点+地图 / AI数字人 / AI 导览聊天面板）、底部游览路线卡片栏；前端 Vue 3，后端 FastAPI，接入 DeepSeek 大模型 + 百度地图 JS API；数字人采用**魔珐星云(Xmov) 3D 实时数字人 SDK**（主力，口型/表情/动作全自动）+ **静态立绘兜底**，实现「用户提问 → 数字人语音回答 → 嘴型随语音同步」。

**Architecture:** 前后端分离。前端 Vue 3 + Vite 负责页面渲染、魔珐星云数字人驱动、百度地图与聊天交互；后端 FastAPI 提供两个核心代理接口：大模型对话（SSE 流式）、Edge-TTS 语音合成（兜底语音，魔珐星云不可用时启用），以及静态数据（景点/路线/天气）。数字人优先用魔珐星云 Lite SDK（`window.XmovAvatar`，云端渲染 3D 形象 + 自动口型/表情/动作）；SDK 加载失败 / 无 appId / 断网时，自动退化为静态立绘 + DeepSeek 文字回答（可选 Edge-TTS 语音）。

**Tech Stack:**
- 前端：Vue 3 + Vite 5 + JavaScript（非 TS，降低门槛）
- 数字人：魔珐星云 Lite SDK（xmovAvatar@latest.js，需 appId/appSecret）+ 静态立绘兜底
- 地图：百度地图 JS API GL（需要 AK，已提供）
- 后端：Python 3.10+ + FastAPI + uvicorn + openai(DeepSeek 兼容) + edge-tts
- 数据：静态 JSON（景点/路线），天气先用 mock

---

## 文件结构（总览）

```
improve2/
├─ 参考图.jpg                    # 设计稿参照
├─ docs/superpowers/plans/       # 本文档所在
├─ backend/
│  ├─ requirements.txt
│  ├─ .env.example               # DEEPSEEK_API_KEY / 百度AK 等
│  ├─ app/
│  │  ├─ main.py                 # FastAPI 入口，挂载路由
│  │  ├─ config.py               # 读取环境变量
│  │  ├─ routers/
│  │  │  ├─ chat.py              # POST /api/chat (SSE)
│  │  │  ├─ tts.py               # GET /api/tts?text=...
│  │  │  └─ data.py              # GET /api/attractions /api/routes /api/weather
│  │  └─ services/
│  │     ├─ llm.py               # DeepSeek 对话封装
│  │     └─ tts_service.py       # edge-tts 合成封装
│  └─ data/
│     ├─ attractions.json        # 5个景点
│     └─ routes.json             # 6条路线
└─ frontend/
   ├─ package.json
   ├─ vite.config.js             # dev 代理 /api → backend:8000
   ├─ index.html
   ├─ public/
   │  ├─ model/                  # 立绘兜底图、图标等静态资源
   │  └─ api/                    # 百度地图 AK 挂载脚本页(jsapi_loader 方式)
   ├─ src/
   │  ├─ main.js
   │  ├─ App.vue                 # 整体布局
   │  ├─ assets/styles/main.css  # 设计令牌(配色/圆角/阴影) + 全局
   │  ├─ api/index.js            # fetch 封装
   │  ├─ xmov/xmov-avatar.js     # 魔珐星云 SDK 封装(加载/init/speak/销毁)
   │  ├─ composables/useChat.js  # 聊天状态机(流式+语音)
   │  └─ components/
   │     ├─ TopBar.vue           # 顶部信息栏
   │     ├─ AttractionList.vue   # 左:景点快捷卡片
   │     ├─ MapPanel.vue         # 左:百度地图
   │     ├─ DigitalHuman.vue     # 中:魔珐星云数字人(立绘兜底)
   │     ├─ ChatPanel.vue        # 右:AI 导览面板
   │     └─ RouteCardRow.vue     # 底:游览路线卡片
```

---

## Phase 0：项目脚手架

### Task 0.1：初始化仓库与目录骨架

**Files:**
- Create: `improve2/.gitignore`
- Create: `improve2/backend/requirements.txt`
- Create: `improve2/backend/.env.example`
- Create: `improve2/backend/.env`（本地开发，gitignore 忽略）
- Create: `improve2/frontend/package.json`

- [ ] **Step 1: 创建 .gitignore**

`.gitignore`:
```gitignore
node_modules/
dist/
__pycache__/
*.pyc
.env
.venv/
.DS_Store
*.log
```

- [ ] **Step 2: 创建 backend/requirements.txt**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
openai==1.59.6
edge-tts==6.1.17
python-dotenv==1.0.1
sse-starlette==2.1.3
```

- [ ] **Step 3: 创建 backend/.env.example**

```
# DeepSeek (OpenAI 兼容)
DEEPSEEK_API_KEY=sk-xxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# 百度地图（可选，开发时可在前端直接写 AK）
BAIDU_MAP_AK=

# CORS 允许来源，逗号分隔
ALLOW_ORIGINS=http://localhost:5173
```

- [ ] **Step 4: 复制 .env.example → .env** 并填入真实 KEY

Run: `copy backend\.env.example backend\.env`（或手建），把 `DEEPSEEK_API_KEY` 填为真实值。

- [ ] **Step 5: 创建 frontend/package.json**

```json
{
  "name": "lingshan-guide-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 6: 初始化 git 并提交**

```bash
git init
git add -A
git commit -m "chore: init repo skeleton"
```

---

### Task 0.2：前端 Vite 骨架

**Files:**
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.js`
- Create: `frontend/src/App.vue`（占位）

- [ ] **Step 1: 创建 vite.config.js（含 /api 代理）**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 2: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>灵山导览 · 小景 AI</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 src/main.js**

```js
import { createApp } from 'vue'
import App from './App.vue'
import './assets/styles/main.css'

createApp(App).mount('#app')
```

- [ ] **Step 4: 创建占位 App.vue**

```vue
<template>
  <div class="page">灵山导览</div>
</template>
```

- [ ] **Step 5: 启动验证**

Run: `cd frontend && npm install && npm run dev`
Expected: `http://localhost:5173/` 显示「灵山导览」。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: scaffold vite vue app"
```

---

### Task 0.3：后端 FastAPI 骨架

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: 创建 backend/app/__init__.py**

```python
# 空包标记
```

- [ ] **Step 2: 创建 backend/app/config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
BAIDU_MAP_AK = os.getenv("BAIDU_MAP_AK", "")
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "http://localhost:5173").split(",")
```

- [ ] **Step 3: 创建 backend/app/main.py（含 CORS 与健康检查）**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config

app = FastAPI(title="灵山导览后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: 启动验证**

Run: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000`
Expected: 浏览器打开 `http://localhost:8000/api/health` 返回 `{"status":"ok"}`。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: scaffold fastapi backend"
```

---

## Phase 1：页面一比一复刻（静态 UI + 设计令牌）

> 以 `参考图.jpg` 视觉模型解析结果为唯一依据：
> - 背景：淡蓝渐变 + 半透明山水朦胧
> - 顶部栏：淡蓝 `#E3F2FD`
> - 主题色：天蓝 `#2385BB`；面板 `#F5F7FA`；卡片白 `#FFFFFF`；高亮黄 `#FFC107`；粉色标题
> - 圆角 8px、微弱悬浮阴影、扁平清新风

### Task 1.1：设计令牌与全局样式

**Files:**
- Create: `frontend/src/assets/styles/main.css`

- [ ] **Step 1: 写全局样式与设计令牌**

```css
:root {
  --topbar-bg: #E3F2FD;
  --panel-bg: #F5F7FA;
  --card-bg: #FFFFFF;
  --theme-blue: #2385BB;
  --accent-yellow: #FFC107;
  --pink: #FF7BAC;
  --text-main: #1F2D3D;
  --text-sub: #6B7A8D;
  --text-light: #9AA7B4;
  --success: #2EBD59;
  --danger: #E64A4A;
  --radius: 8px;
  --shadow: 0 2px 8px rgba(31, 45, 61, 0.08);
  --shadow-hover: 0 6px 16px rgba(31, 45, 61, 0.12);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #app { height: 100%; }

body {
  font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  color: var(--text-main);
  /* 淡蓝渐变 + 朦胧山水：用多层 linear-gradient 模拟 */
  background:
    radial-gradient(120% 80% at 20% 10%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%),
    linear-gradient(180deg, #EAF4FB 0%, #DCEBF5 45%, #F3F8FB 100%);
  background-attachment: fixed;
}

.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 10px 14px;
  gap: 10px;
}
```

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat: add design tokens and global styles"
```

---

### Task 1.2：顶部信息栏 TopBar

参考图顶部：左「☰ 灵山导览」+ 导航图标；中「36° 阴 · 53% · 西风」；右「●已连接(绿) 反馈 断开(红) 打断(红)」。

**Files:**
- Create: `frontend/src/components/TopBar.vue`

- [ ] **Step 1: 实现 TopBar.vue**

```vue
<script setup>
const weather = { temp: '36°', desc: '阴', humidity: '53%', wind: '西风' }
</script>

<template>
  <header class="topbar">
    <div class="left">
      <button class="icon-btn hamburger" aria-label="菜单">☰</button>
      <span class="logo">灵山导览</span>
    </div>

    <div class="center">
      <span class="weather">
        {{ weather.temp }} {{ weather.desc }} · {{ weather.humidity }} · {{ weather.wind }}
      </span>
    </div>

    <div class="right">
      <span class="status online"><i class="dot green"></i>已连接</span>
      <button class="text-btn">反馈</button>
      <button class="text-btn danger">断开</button>
      <button class="text-btn danger">打断</button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--topbar-bg);
  border-radius: var(--radius);
  padding: 8px 16px;
  box-shadow: var(--shadow);
  height: 46px;
  flex-shrink: 0;
}
.left { display: flex; align-items: center; gap: 10px; }
.logo { font-size: 18px; font-weight: 700; color: var(--theme-blue); letter-spacing: 2px; }
.hamburger {
  border: none; background: #fff; width: 30px; height: 30px;
  border-radius: 6px; font-size: 16px; cursor: pointer; box-shadow: var(--shadow);
}
.center { color: var(--text-sub); font-size: 14px; }
.right { display: flex; align-items: center; gap: 14px; }
.status { font-size: 13px; display: inline-flex; align-items: center; gap: 5px; }
.status.online { color: var(--success); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.green { background: var(--success); }
.text-btn { border: none; background: none; font-size: 13px; color: var(--text-main); cursor: pointer; }
.text-btn.danger { color: var(--danger); }
</style>
```

- [ ] **Step 2: 在 App.vue 引入 TopBar 并提交**

```vue
<script setup>
import TopBar from './components/TopBar.vue'
</script>

<template>
  <div class="page">
    <TopBar />
  </div>
</template>
```

```bash
git add -A
git commit -m "feat: add topbar"
```

---

### Task 1.3：中部三栏骨架

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: App.vue 实现三栏布局**

```vue
<script setup>
import TopBar from './components/TopBar.vue'
import AttractionList from './components/AttractionList.vue'
import MapPanel from './components/MapPanel.vue'
import DigitalHuman from './components/DigitalHuman.vue'
import ChatPanel from './components/ChatPanel.vue'
import RouteCardRow from './components/RouteCardRow.vue'
</script>

<template>
  <div class="page">
    <TopBar />
    <main class="main">
      <section class="col-left">
        <AttractionList />
        <MapPanel />
      </section>
      <section class="col-center">
        <DigitalHuman />
      </section>
      <section class="col-right">
        <ChatPanel />
      </section>
    </main>
    <RouteCardRow />
  </div>
</template>

<style scoped>
.main {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr 380px;
  gap: 10px;
  min-height: 0;
}
.col-left { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.col-center { display: flex; align-items: stretch; }
.col-right { display: flex; flex-direction: column; min-height: 0; }
</style>
```

> 说明：参考图中部三栏比例为「左景点+地图 / 中数字人 / 右AI面板」。数字人约占中部 1/3 宽，因此网格用 `300px 1fr 380px`，中栏由 DigitalHuman 内部控制立绘尺寸。

- [ ] **Step 2: 为尚未创建的组件建占位空组件**（AttractionList/MapPanel/DigitalHuman/ChatPanel/RouteCardRow 各建一个只含 `<template><div></div></template>` 的占位文件，保证页面可跑）
- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: three-column main layout"
```

---

### Task 1.4：左栏 · 景点快捷卡片 AttractionList

参考图 5 张卡片：灵山大佛/灵山梵宫/九龙灌浴/五印坛城/祥符禅寺，每张含标题+一句话。

**Files:**
- Create: `frontend/src/components/AttractionList.vue`
- Create: `frontend/src/api/index.js`
- Create: `backend/data/attractions.json`

- [ ] **Step 1: 后端数据 attractions.json**

```json
[
  { "id": "ling-dashan-fo", "name": "灵山大佛", "desc": "世界最高露天青铜释迦牟尼立像", "lng": 120.087, "lat": 31.429 },
  { "id": "ling-shan-fan-gong", "name": "灵山梵宫", "desc": "佛教艺术的中华瑰宝", "lng": 120.089, "lat": 31.427 },
  { "id": "jiu-long-guan-yu", "name": "九龙灌浴", "desc": "佛陀诞生的神圣再现", "lng": 120.088, "lat": 31.431 },
  { "id": "wu-yin-tan-cheng", "name": "五印坛城", "desc": "藏传佛教文化的殿堂", "lng": 120.086, "lat": 31.428 },
  { "id": "xiang-fu-chan-si", "name": "祥符禅寺", "desc": "千年古刹的历史遗存", "lng": 120.085, "lat": 31.426 }
]
```

- [ ] **Step 2: 创建 src/api/index.js**

```js
const BASE = '/api'

async function getJSON(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export const fetchAttractions = () => getJSON('/attractions')
```

- [ ] **Step 3: 后端 data.py 路由**

`backend/app/routers/data.py`:
```python
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()
DATA_DIR = Path(__file__).resolve().parents[2] / "data"

def load(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))

@router.get("/api/attractions")
def get_attractions():
    return load("attractions.json")
```

在 `main.py` 注册：`app.include_router(data.router)`，并 `from app.routers import data`。

- [ ] **Step 4: 实现 AttractionList.vue**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { fetchAttractions } from '../api'

const items = ref([])
onMounted(async () => { items.value = await fetchAttractions() })
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
```

> 若后端未启动时前端报错，开发时可在 AttractionList 内先写死同样的 5 条数据作为兜底（`const fallback = [...]`，onMounted catch 后赋值），保证静态复刻阶段可看。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: attraction quick cards"
```

---

### Task 1.5：左栏 · 百度地图 MapPanel

**Files:**
- Create: `frontend/src/components/MapPanel.vue`
- Modify: `frontend/index.html`（挂百度地图 loader）

- [ ] **Step 1: 在 index.html 引入百度地图 GL 脚本**

`frontend/index.html` 的 `<head>` 内：
```html
<script src="https://api.map.baidu.com/api?type=webgl&v=1.0&ak=YOUR_AK"></script>
```
> `YOUR_AK` 需替换为真实百度地图开放平台 AK（未申请前，先留空或使用官方测试 AK 会白屏——此任务步骤 3 提供无 AK 兜底）。

- [ ] **Step 2: 实现 MapPanel.vue**

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { fetchAttractions } from '../api'

const mapEl = ref(null)
const markers = ref([])

onMounted(async () => {
  // 兜底：无 AK 时显示占位文案，不崩溃
  if (typeof BMapGL === 'undefined') {
    mapEl.value.innerHTML = '地图加载中（请配置百度地图 AK）…'
    return
  }
  const map = new BMapGL.Map(mapEl.value)
  map.centerAndZoom(new BMapGL.Point(120.087, 31.428), 13)
  map.enableScrollWheelZoom(true)
  map.setMapStyleV2({ styleId: 'normal' })

  try {
    const list = await fetchAttractions()
    list.forEach(a => {
      const mk = new BMapGL.Marker(new BMapGL.Point(a.lng, a.lat))
      mk.setLabel(new BMapGL.Label(a.name, { offset: new BMapGL.Size(14, -24) }))
      map.addOverlay(mk)
      markers.value.push(mk)
    })
  } catch (e) { /* 后端未启动时忽略 */ }
})

onBeforeUnmount(() => { markers.value.forEach(m => map.removeOverlay(m)) })
</script>

<template>
  <div class="map-panel">
    <div ref="mapEl" class="map-canvas"></div>
    <div class="map-badge">百度地图</div>
  </div>
</template>

<style scoped>
.map-panel {
  position: relative; border-radius: var(--radius); overflow: hidden;
  box-shadow: var(--shadow); flex: 1; min-height: 180px;
  background: #EAF4FB;
}
.map-canvas { width: 100%; height: 100%; min-height: 180px; }
.map-badge {
  position: absolute; left: 8px; bottom: 8px; z-index: 1;
  background: rgba(255,255,255,.9); border-radius: 4px; padding: 2px 8px;
  font-size: 11px; color: var(--text-sub);
}
</style>
```

> **无 AK 兜底说明**：比赛演示若未申请 AK，可在 MapPanel 的兜底分支用一张静态 SVG 地图背景图替代（后续可选做），保证页面不缺块。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: baidu map panel with attraction markers"
```

---

### Task 1.6：右栏 · AI 导览聊天面板 ChatPanel（静态部分）

参考图：标题「小灵·AI导览」+「●在线」；问候「你好呀！我是小景 / 有什么可以帮助您？」；5 个功能入口（带图标）；4 个快捷问题；输入框「输入你的问题...」+ 蓝色圆形发送。

**Files:**
- Create: `frontend/src/components/ChatPanel.vue`

- [ ] **Step 1: 实现 ChatPanel.vue（静态 UI，聊天逻辑 Phase 4 接入）**

```vue
<script setup>
defineProps({ disabled: { type: Boolean, default: false } })
const emit = defineEmits(['send'])

const features = [
  { icon: '🍽️', title: '餐饮指南', desc: '素斋、素面、禅食，价格全知道' },
  { icon: '🪙', title: '票务政策', desc: '学生优惠、老人免票、年卡办理' },
  { icon: '🅿️', title: '配套设施', desc: '停车场、母婴室、无障碍通道' },
  { icon: '📣', title: '演出查询', desc: '九龙灌浴、吉祥颂场次实时查' },
  { icon: '⚠️', title: '避坑提示', desc: '拍照收费、最佳游览时段提醒' },
]

const quick = ['景区有什么好玩的？', '门票多少钱？', '怎么去景区？', '有什么特色美食？', '推荐一条游览路线']

const input = defineModel()

function submit() {
  const v = input.value?.trim()
  if (v) { emit('send', v); input.value = '' }
}
</script>

<template>
  <div class="chat-panel">
    <header class="chat-head">
      <span class="title">小灵·AI导览</span>
      <span class="online"><i class="dot green"></i>在线</span>
    </header>

    <div class="greeting">
      <p class="hello">你好呀！我是小景</p>
      <p class="sub">有什么可以帮助您？</p>
    </div>

    <div class="features">
      <button class="feat" v-for="f in features" :key="f.title" @click="emit('send', f.title)">
        <span class="feat-icon">{{ f.icon }}</span>
        <span class="feat-text">
          <span class="feat-title">{{ f.title }}</span>
          <span class="feat-desc">{{ f.desc }}</span>
        </span>
      </button>
    </div>

    <div class="quicks">
      <button class="quick" v-for="q in quick" :key="q" @click="emit('send', q)">{{ q }}</button>
    </div>

    <div class="input-row">
      <input v-model="input" class="chat-input" placeholder="输入你的问题..."
             :disabled="disabled" @keyup.enter="submit" />
      <button class="send-btn" :disabled="disabled" @click="submit" aria-label="发送">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  background: var(--panel-bg); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 14px; display: flex;
  flex-direction: column; gap: 12px; flex: 1; min-height: 0;
}
.chat-head { display: flex; align-items: center; justify-content: space-between; }
.title { font-size: 16px; font-weight: 700; }
.online { font-size: 12px; color: var(--success); display: inline-flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); display: inline-block; }
.greeting .hello { font-size: 16px; font-weight: 600; }
.greeting .sub { font-size: 13px; color: var(--text-sub); margin-top: 2px; }
.features { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; }
.feat {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: var(--card-bg); border: none; border-radius: var(--radius);
  padding: 8px 10px; text-align: left; cursor: pointer; box-shadow: var(--shadow);
  transition: box-shadow .2s;
}
.feat:hover { box-shadow: var(--shadow-hover); }
.feat-icon { font-size: 18px; }
.feat-text { display: flex; flex-direction: column; }
.feat-title { font-size: 13px; font-weight: 600; }
.feat-desc { font-size: 11px; color: var(--text-sub); }
.quicks { display: flex; flex-wrap: wrap; gap: 6px; }
.quick {
  border: 1px solid #CFE4F2; background: #fff; color: var(--theme-blue);
  font-size: 12px; border-radius: 999px; padding: 4px 10px; cursor: pointer;
}
.quick:hover { background: var(--topbar-bg); }
.input-row { display: flex; gap: 8px; align-items: center; }
.chat-input {
  flex: 1; border: 1px solid #D8E3EC; border-radius: 20px; padding: 9px 14px;
  font-size: 13px; outline: none; background: #fff;
}
.chat-input:focus { border-color: var(--theme-blue); }
.send-btn {
  width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--theme-blue); display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.send-btn:hover { filter: brightness(1.1); }
.send-btn:disabled { background: #A9C4D6; cursor: not-allowed; }
</style>
```

> 图标用 emoji 兜底最稳（无需图标库）。如需更精致，后续可用 @element-plus/icons-vue 或 SVG 替换。

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat: chat panel static ui"
```

---

### Task 1.7：底部 · 游览路线卡片 RouteCardRow

参考图：粉色标题「游览路线」+ 6 张横排卡片（祈福禅悟线/文化体验线/亲子喜乐线/舌尖上的灵山/文博探索之旅/清净自在线），每张含标题 + `N景点·N公里·N小时` + 宣传语 + 配图。

**Files:**
- Create: `frontend/src/components/RouteCardRow.vue`
- Create: `backend/data/routes.json`
- Modify: `backend/app/routers/data.py`（加 /api/routes）

- [ ] **Step 1: routes.json**

```json
[
  { "id": "qf-cy", "name": "祈福禅悟线", "spots": 10, "km": 3, "hours": 3, "tag": "官方推荐", "desc": "祈福增智 身心灵平和", "image": "/model/route-qifu.jpg" },
  { "id": "wh-tiyan", "name": "文化体验线", "spots": 21, "km": 5, "hours": 5, "tag": null, "desc": "佛教文化 深度探索 洗涤心灵", "image": "/model/route-fangong.jpg" },
  { "id": "qinzi", "name": "亲子喜乐线", "spots": 12, "km": 3, "hours": 3, "tag": null, "desc": "亲子同游 寓教于乐 其乐融融", "image": "/model/route-qinzi.jpg" },
  { "id": "shejian", "name": "舌尖上的灵山", "spots": 8, "km": 4, "hours": 4, "tag": null, "desc": "赏艺术 品文化 看非遗", "image": "/model/route-food.jpg" },
  { "id": "wenbo", "name": "文博探索之旅", "spots": 4, "km": 3, "hours": 3, "tag": null, "desc": "探古寺 赏文物 寻古迹", "image": "/model/route-wenbo.jpg" },
  { "id": "qingjing", "name": "清净自在线", "spots": 16, "km": 3, "hours": 2, "tag": null, "desc": "惜缘出游 善会得乐 皆大欢喜", "image": "/model/route-ginkgo.jpg" }
]
```

> 「亲子喜乐线」参数在参考图截断处，视觉模型未完整读出，此处为合理补全（12景点·3公里·3小时），后续按实际需求改。

- [ ] **Step 2: data.py 增加 /api/routes**

在 `backend/app/routers/data.py` 追加：
```python
@router.get("/api/routes")
def get_routes():
    return load("routes.json")
```

- [ ] **Step 3: RouteCardRow.vue**

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { fetchRoutes } from '../api'

const routes = ref([])
onMounted(async () => { routes.value = await fetchRoutes().catch(() => []) })
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
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: route card row"
```

---

### Task 1.8：静态复刻验收

- [ ] **Step 1: 起后端 + 前端，浏览器核对参考图**

Run: `uvicorn app.main:app --reload --port 8000`（backend 目录）
Run: `npm run dev`（frontend 目录）
打开 `http://localhost:5173`，逐项对照 `参考图.jpg`：
- [ ] 顶部：菜单/标题/天气/四按钮位置与颜色
- [ ] 左栏：5 景点卡片 + 地图
- [ ] 中栏：数字人占位（Phase 2 前先显示立绘兜底图）
- [ ] 右栏：聊天面板结构与文案
- [ ] 底部：粉色「游览路线」+ 6 卡片
- [ ] 配色（#E3F2FD 顶栏 / #F5F7FA 面板 / 白卡片 / #2385BB 主题）与圆角阴影观感

- [ ] **Step 2: 若有偏差，微调 CSS 后提交**

```bash
git add -A
git commit -m "chore: static ui per reference image"
```

---

## Phase 2：魔珐星云 3D 数字人接入（主力）+ 立绘兜底

> 核心链路：`<script>` 引入 Lite SDK → `new window.XmovAvatar({containerId, appId, appSecret, gatewayServer})` → `avatar.init()` → `avatar.speak(文本, isStart, isEnd)` 自动完成 **语音 + 口型 + 表情 + 动作**。加载失败 / 无 appId / 断网 → 退化到静态立绘 + DeepSeek 文字回答。

### Task 2.0（前置，需用户本人操作）：注册魔珐星云并获取凭证

- [ ] **Step 1: 注册并创建驱动应用**

在 [魔珐星云官网](https://www.xingyun3d.com/) 手机号注册 → 控制台「应用管理」→「驱动应用」→ 创建应用 → 配置**角色**（选二次元/卡通风格，贴近参考图）、**音色**、**场景** → 点「接入SDK」复制 **App ID 和 App Secret**。

> ⚠️ 此步骤只能用户本人完成（手机号注册）。拿到 `appId`/`appSecret` 后交给实现者填入 `frontend/.env`。

- [ ] **Step 2: 把凭证写入 frontend/.env（gitignore 忽略，勿提交）**

`frontend/.env`:
```ini
VITE_XMOV_APP_ID=你的AppID
VITE_XMOV_APP_SECRET=你的AppSecret
VITE_XMOV_GATEWAY=https://nebula-agent.xingyun3d.com/user/v1/ttsa/session
```

> 若暂时拿不到凭证，Phase 2 其余任务仍可完成，只是运行时会走「立绘兜底」分支（不报错）。

---

### Task 2.1：魔珐星云 SDK 封装 xmov-avatar.js

**Files:**
- Create: `frontend/src/xmov/xmov-avatar.js`
- Modify: `frontend/index.html`（引入 SDK 脚本）

- [ ] **Step 1: 在 index.html 引入 Lite SDK**

`frontend/index.html` 的 `<head>` 内：
```html
<script src="https://media.xingyun3d.com/xingyun3d/general/litesdk/xmovAvatar@latest.js"></script>
```

> 若外网脚本被墙/加载失败，需把该 JS 下载到 `frontend/public/vendor/xmovAvatar.js` 改为本地引入（离线可用的兜底）。

- [ ] **Step 2: 创建 xmov-avatar.js**

```js
// 魔珐星云 Lite SDK 封装。
// 对外暴露：init() / speak(text) / interrupt() / destroy()
const APP_ID = import.meta.env.VITE_XMOV_APP_ID || ''
const APP_SECRET = import.meta.env.VITE_XMOV_APP_SECRET || ''
const GATEWAY = import.meta.env.VITE_XMOV_GATEWAY || 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session'

export class XmovAvatar {
  constructor(containerEl) {
    this.container = containerEl
    this.avatar = null
    this.ready = false
  }

  get enabled() {
    return typeof window.XmovAvatar !== 'undefined' && !!APP_ID && !!APP_SECRET
  }

  async init() {
    if (!this.enabled) return { ok: false, reason: 'sdk-or-creds-missing' }
    if (this.avatar) return { ok: true }
    try {
      this.avatar = new window.XmovAvatar({
        containerId: this.container,
        appId: APP_ID,
        appSecret: APP_SECRET,
        gatewayServer: GATEWAY,
        enableLogger: import.meta.env.DEV,
        onStateChange: (state) => { /* 状态变化，可抛事件 */ },
        onVoiceStateChange: (status) => { /* 语音状态 */ },
      })
      await this.avatar.init({
        onDownloadProgress: (p) => { /* 首连下载角色资源 */ },
        onError: (e) => console.error('魔珐星云 init error', e),
      })
      this.ready = true
      return { ok: true }
    } catch (e) {
      console.error('魔珐星云 init failed', e)
      return { ok: false, reason: String(e) }
    }
  }

  // 整段播报（说话+口型+表情+动作全自动）
  speak(text) {
    if (!this.ready) return false
    try { this.avatar.speak(text, true, true); return true } catch (e) { console.error(e); return false }
  }

  // 打断当前播报（配合顶部「打断」按钮）
  interrupt() {
    if (!this.ready) return
    try { this.avatar.interactiveidle(); } catch (e) { /* 忽略 */ }
  }

  destroy() {
    if (this.avatar && this.avatar.destroy) { try { this.avatar.destroy() } catch (e) {} }
    this.avatar = null
    this.ready = false
  }
}
```

> 说明：`containerId` 传**元素引用**（SDK 文档示例为 `#avatarContainer` 选择器，若传字符串报错则传 `el` 本身，按实际 SDK 类型为准）。`speak` 支持 SSML 与分段流式（`isStart/isEnd`），本阶段先整段播报，够用且稳定。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: xmov avatar sdk wrapper"
```

---

### Task 2.2：DigitalHuman.vue（魔珐星云容器 + 立绘兜底）

**Files:**
- Create: `frontend/src/components/DigitalHuman.vue`

- [ ] **Step 1: 实现 DigitalHuman.vue**

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { XmovAvatar } from '../xmov/xmov-avatar'

const stageEl = ref(null)
const loaded = ref(false)       // 魔珐星云是否就绪
const actor = new XmovAvatar('#avatar-container')

onMounted(async () => {
  const res = await actor.init()
  loaded.value = res.ok
})

onBeforeUnmount(() => actor.destroy())

function speak(text) {
  const ok = actor.speak(text)
  if (!ok) { /* 兜底模式：静默，文字回答已由 ChatPanel 展示 */ }
  return ok
}
function interrupt() { actor.interrupt() }

defineExpose({ speak, interrupt })
</script>

<template>
  <div class="dh-wrap">
    <div id="avatar-container" class="dh-stage"></div>
    <img v-if="!loaded" class="dh-fallback" src="/model/avatar.png" alt="小景" />
  </div>
</template>

<style scoped>
.dh-wrap {
  position: relative; flex: 1; width: 100%;
  display: flex; align-items: center; justify-content: center;
  min-height: 0;
}
.dh-stage { width: 100%; height: 100%; }
.dh-fallback {
  max-height: 100%; max-width: 100%; object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(31,45,61,.15));
  animation: dh-float 4s ease-in-out infinite;
}
@keyframes dh-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
</style>
```

> 立绘兜底逻辑：`loaded=false` 时显示 `public/model/avatar.png`（静态二次元立绘 + 浮动动画），此时聊天仍用 DeepSeek 文字回答，演示不中断。

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat: digital human panel with xmov avatar"
```

---

## Phase 3：后端 AI 能力（LLM + TTS）

### Task 3.1：LLM 服务（DeepSeek SSE 流式）

**Files:**
- Create: `backend/app/services/llm.py`
- Create: `backend/app/routers/chat.py`

- [ ] **Step 1: llm.py**

```python
from openai import OpenAI
from app import config

client = OpenAI(api_key=config.DEEPSEEK_API_KEY, base_url=config.DEEPSEEK_BASE_URL)

SYSTEM_PROMPT = """你是「灵山导览」的 AI 导游小景，负责为无锡灵山胜境景区的游客提供导览服务。
你的特点：亲切、专业、回答简洁（一般不超过120字）。可介绍灵山大佛、灵山梵宫、九龙灌浴、五印坛城、祥符禅寺等景点，
回答门票、交通、餐饮、演出、避坑等游客常见问题。不知道的如实说不知道，不要编造。"""

def stream_chat(messages: list[dict], model: str | None = None):
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + messages[-10:]
    return client.chat.completions.create(
        model=model or config.DEEPSEEK_MODEL,
        messages=msgs,
        stream=True,
    )
```

- [ ] **Step 2: chat.py（SSE 输出）**

```python
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services import llm

router = APIRouter()

class ChatRequest(BaseModel):
    messages: list[dict]  # [{role, content}...]

@router.post("/api/chat")
def chat(req: ChatRequest):
    def gen():
        try:
            stream = llm.stream_chat(req.messages)
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            yield "data: [DONE]\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 3: main.py 注册路由**

```python
from app.routers import chat, data, tts  # tts 在 Task 3.2 建
app.include_router(chat.router)
app.include_router(data.router)
```

- [ ] **Step 4: 接口验证**

Run（后端目录）: `uvicorn app.main:app --reload --port 8000`
Run: `curl -N -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"灵山大佛门票多少钱"}]}'`
Expected: 逐行 `data: {"delta": "..."}` 流式输出，最后 `data: [DONE]`。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: deepseek streaming chat endpoint"
```

---

### Task 3.2：TTS 服务（Edge-TTS）

**Files:**
- Create: `backend/app/services/tts_service.py`
- Create: `backend/app/routers/tts.py`

- [ ] **Step 1: tts_service.py**

```python
import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"  # 女声，亲切

async def synthesize(text: str) -> bytes:
    text = text[:200]  # 限制长度
    communicate = edge_tts.Communicate(text, VOICE)
    chunks = [chunk async for chunk in communicate.stream()]
    return b"".join(ch["data"] for ch in chunks if ch["type"] == "audio")
```

- [ ] **Step 2: tts.py**

```python
from fastapi import APIRouter
from fastapi.responses import Response
from app.services import tts_service

router = APIRouter()

@router.get("/api/tts")
async def tts(text: str):
    audio = await tts_service.synthesize(text)
    return Response(content=audio, media_type="audio/mpeg")
```

- [ ] **Step 3: 验证**

Run: `curl -o out.mp3 "http://localhost:8000/api/tts?text=你好呀，我是小景"`
Expected: 生成 out.mp3 且可播放（若本机无 Edge TTS 网络，会失败——需联网）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: edge-tts audio endpoint"
```

---

## Phase 4：聊天 + 语音 + 口型联动

### Task 4.1：聊天状态机 useChat.js

**Files:**
- Create: `frontend/src/composables/useChat.js`

- [ ] **Step 1: 实现 useChat.js**

```js
import { ref } from 'vue'

// 返回聊天状态与动作。speak 回调由 DigitalHuman 注入（播放音频+驱动口型）
export function useChat() {
  const messages = ref([{ role: 'assistant', content: '你好呀！我是小景，有什么可以帮助您？' }])
  const loading = ref(false)
  const speaking = ref(false)

  let onSpeak = null
  const setSpeakHandler = (fn) => { onSpeak = fn }

  async function ask(text) {
    if (loading.value) return
    messages.value.push({ role: 'user', content: text })
    loading.value = true

    // 组装历史
    const history = messages.value.map(m => ({ role: m.role, content: m.content }))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let answer = ''
      const assistantMsg = { role: 'assistant', content: '' }
      messages.value.push(assistantMsg)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const payload = JSON.parse(line.slice(6))
          if (payload.delta) { answer += payload.delta; assistantMsg.content = answer }
        }
      }
      // 流结束后：语音朗读 + 口型
      if (onSpeak && answer.trim()) { speaking.value = true; await onSpeak(answer.trim()) }
    } catch (e) {
      messages.value.push({ role: 'assistant', content: `出错了：${e.message}` })
    } finally {
      loading.value = false
      speaking.value = false
    }
  }

  return { messages, loading, speaking, ask, setSpeakHandler }
}
```

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat: chat state machine with sse"
```

---

### Task 4.2：App.vue 装配语音 + 口型联动

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/components/ChatPanel.vue`（显示消息列表）

- [ ] **Step 1: 修改 ChatPanel.vue 增加消息气泡**

在 ChatPanel 模板的 `.features` 上方插入消息区（新增 slot 由 App 传入）：
```vue
<div class="msg-area" v-if="showMessages">
  <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]">
    <span class="bubble">{{ m.content }}</span>
  </div>
</div>
```
并在 `<script setup>` 增加 props：`showMessages`、`messages`；调整布局使 `.features` 高度自适应。

- [ ] **Step 2: App.vue 装配**

```vue
<script setup>
import { ref } from 'vue'
import TopBar from './components/TopBar.vue'
import AttractionList from './components/AttractionList.vue'
import MapPanel from './components/MapPanel.vue'
import DigitalHuman from './components/DigitalHuman.vue'
import ChatPanel from './components/ChatPanel.vue'
import RouteCardRow from './components/RouteCardRow.vue'
import { useChat } from './composables/useChat'

const dhRef = ref(null)
const { messages, loading, speaking, ask, setSpeakHandler } = useChat()

// 说话策略：优先魔珐星云（语音+口型+表情全自动），
// 不可用时退化为 Edge-TTS 语音播放（立绘兜底，无口型但有声音）。
setSpeakHandler(async (text) => {
  if (dhRef.value && dhRef.value.speak(text)) {
    // 魔珐星云播报中；等待播完（onStateChange 或超时）
    await new Promise((r) => setTimeout(r, Math.min(30000, text.length * 120)))
    return
  }
  // 兜底：Edge-TTS 播放
  const audio = new Audio('/api/tts?text=' + encodeURIComponent(text))
  await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; audio.play() })
})
</script>
```

> `speak()` 返回 `false` 即表示魔珐星云不可用（走立绘兜底）；播放时长按文本长度粗估（约 120ms/字），供 UI 状态使用。

- [ ] **Step 3: 验证全链路**

Run: 前后端同时启动，浏览器输入「灵山大佛门票多少钱」→ 回车
Expected: ① 右侧出现用户气泡 ② 流式出现助手回答 ③ 回答结束后数字人开口说话，口型/表情/动作同步（或走立绘+语音兜底）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: wire chat->xmov speak + tts fallback"
```

---

## Phase 5：打磨与收尾

### Task 5.1：数字人连接状态管理（空闲/断开/重连）

> 魔珐星云平台自带 idle 表现（微表情/呼吸/轻微动作），无需自己实现。

- [ ] **Step 1: 空闲自动断开 + 重连**

魔珐星云不对话时持续连接会消耗积分。在 `App.vue` 监听 `speaking` 状态：空闲 60s 后调用 `dhRef.destroy()` 并置 `loaded=false`（显示立绘）；下一次 `speak` 前自动重新 `init()`。代码示意：
```js
let idleTimer = null
function resetIdle() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { if (dhRef.value) dhRef.value.destroy() }, 60000)
}
// speak 前调用 resetIdle()；speak 后也调用 resetIdle()
```

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "feat: xmov idle disconnect / reconnect"
```

---

### Task 5.2：顶部按钮行为 + 天气 mock

- [ ] **Step 1: 反馈/断开/打断按钮**

`TopBar.vue`：断开 → `confirm('确定断开连接？')` 后调用 `dhRef.destroy()`（魔珐星云断开，回落立绘）；打断 → 调用 `dhRef.interrupt()`（魔珐星云 `interactiveidle()`，兜底模式停掉当前 Audio）；反馈 → `alert('感谢反馈！')`。

- [ ] **Step 2: 天气接口**

后端 `data.py` 加 `GET /api/weather` 返回 mock：`{"temp":"36°","desc":"阴","humidity":"53%","wind":"西风"}`，TopBar onMounted 拉取；可后续接和风天气/高德天气替换。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: topbar interactions and weather mock"
```

---

### Task 5.3：响应式与低配兜底

- [ ] **Step 1: 窄屏适配**

`@media (max-width: 1200px)`：三栏改两栏（数字人合并到右栏上方）；`@media (max-width: 900px)`：全部单列纵向滚动。底部路线卡片横向滚动条美化（`::-webkit-scrollbar`）。

- [ ] **Step 2: 立绘兜底开关**

无魔珐星云 SDK / 无 appId / 断网 / 积分不足时，DigitalHuman 自动退化为 `avatar.png` 静态立绘 + CSS 浮动动画（`@keyframes float` 上下 6px 循环），保证比赛现场无网络也能演示（DeepSeek 文字回答照常）。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: responsive and fallback modes"
```

---

### Task 5.4：端到端验收清单

- [ ] **Step 1: 全流程手动回归**

- [ ] 页面加载：三栏 + 顶栏 + 底部卡片齐全，配色贴近参考图
- [ ] 百度地图：加载、缩放、5 景点 marker 展示
- [ ] 数字人：魔珐星云 3D 形象 或 立绘兜底显示，无白屏
- [ ] 聊天：输入问题 → 流式回答 → 语音 → 口型联动
- [ ] 打断：播放中点「打断」，语音与口型停止
- [ ] 天气：顶栏显示 mock 天气
- [ ] 窄屏：1200/900px 断点布局正常
- [ ] 断网/后端未启动：页面不崩溃，地图与列表有兜底文案

- [ ] **Step 2: 提交并收尾**

```bash
git add -A
git commit -m "chore: end-to-end verified"
```

---

## 关键风险与对策

| 风险 | 对策 |
|---|---|
| 魔珐星云需注册 appId/appSecret | 用户本人手机号注册；拿不到凭证期间走立绘兜底，不阻塞开发 |
| 魔珐星云断网/积分耗尽 | 自动退化立绘兜底 + DeepSeek 文字回答；演示前预检网络与积分 |
| 魔珐星云免费版并发仅 3 路 | 演示单路即可；空闲 60s 自动断开省积分（Task 5.1） |
| 魔珐星云 SDK CDN 被墙/不可达 | 提前下载 JS 到 `public/vendor/` 本地引入 |
| 授权条款（商用需书面授权） | 竞赛演示属学习/试用用途；若赛后商用需向魔珐申请授权 |
| 百度地图 AK 未生效 | 无 AK 时显示兜底文案；比赛前必须申请免费 AK |
| Edge-TTS 依赖外网 | 兜底语音可本地化缓存；或换火山引擎/讯飞 TTS（配 key） |
| DeepSeek 无 key/欠费 | chat 接口返回友好错误；前端展示错误气泡 |
| 参考图「亲子喜乐线」参数缺失 | 已合理补全，按真实路线数据修正 |
| 流式回答与播报时序 | 策略为「先完整显示文本，再整段 speak」，实现简单且自然 |
