# 灵山导览 · Coding Agent 实施手册
## 基于 `WaterXiao-git/AI-Avatar` / `lingshan-guide` 真实代码的逐任务改造方案

> 版本：V1.0  
> 基准分支：`lingshan-guide`  
> 基准提交：`6e3bb3ad27347f0066c2e8a75db5129e927abc3b`  
> 适用对象：Claude Code / Codex / Cursor Agent / Trae / Cline 等可读取完整仓库并执行修改、测试的编程智能体  
> 核心原则：**以当前仓库真实代码为唯一实现基础；总体功能方案只规定“做什么”，本手册规定“在当前代码里怎么做”。**

---

# 0. 给 Coding Agent 的总指令

在开始任何修改前，必须遵守以下规则。

## 0.1 仓库与分支

目标仓库：

```text
WaterXiao-git/AI-Avatar
```

目标分支：

```text
lingshan-guide
```

开始前先确认：

```bash
git branch --show-current
git status
git rev-parse HEAD
```

如果当前不在 `lingshan-guide`，停止并提示用户。

---

## 0.2 当前真实技术栈

必须保留：

```text
Frontend:
Vue 3.5
Vite 5
原生 fetch
Web Speech API
百度地图 JS API GL
魔珐星云 Lite SDK

Backend:
FastAPI
OpenAI-compatible DeepSeek Client
SSE
Edge-TTS
Open-Meteo
火山引擎方舟视觉模型
JSON 数据文件
```

禁止因为新增功能改成：

```text
React
Next.js
Nuxt
微服务
LangGraph 全量重构
LangChain 全量重构
Redis
Celery
Kafka
Elasticsearch
Milvus
```

除非后续用户明确要求。

---

## 0.3 现有核心链路必须保持兼容

当前问答链路：

```text
ChatPanel.vue
  ↓ emit('send')
App.vue / onChatSend()
  ↓
useChat.js / ask()
  ↓
POST /api/chat
  ↓
backend/app/routers/chat.py
  ↓
backend/app/services/llm.py
  ↓
DeepSeek SSE
  ↓
useChat.js 增量渲染
  ↓
App.vue / speakText()
  ↓
DigitalHuman.vue
  ↓
xmov-avatar.js
  ↓
魔珐 avatar.speak()
```

这个链路不能推翻，只能做兼容增强。

---

## 0.4 高风险保护区

以下文件属于高风险文件：

```text
frontend/src/components/DigitalHuman.vue
frontend/src/xmov/xmov-avatar.js
```

除非某个任务明确要求：

```text
读取数字人真实语音状态
读取配置
增加非破坏性监听
```

否则禁止：

```text
重构 SDK 初始化
改 WebGL canvas 修复逻辑
删除 visualReady
删除 isPainted
改 destroy 核心逻辑
替换 avatar.speak
```

---

## 0.5 主页面保护原则

当前页面主体布局保持：

```text
左上：天气
顶部：热门景点
左中：地图
左下：游览路线
中间：3D 数字人
右侧：AI 对话
```

禁止为了新功能重新设计整页。

新增功能只能采用：

```text
现有区域内增加小控件
现有消息区增加行动卡片
独立 /admin 管理页
```

---

## 0.6 API 兼容原则

当前接口：

```text
GET  /api/health
GET  /api/attractions
GET  /api/routes
GET  /api/weather
POST /api/chat
POST /api/route/plan
POST /api/ocr
GET  /api/tts
```

禁止删除。

对已有请求/响应：

```text
允许增加可选字段
禁止直接删除或改名旧字段
```

---

## 0.7 每个 TASK 的执行规则

每个 TASK 必须：

1. 开始前列出准备修改的文件；
2. 只修改该 TASK 范围；
3. 不做顺手重构；
4. 完成后运行最小测试；
5. 输出：
   - 修改文件；
   - 新增文件；
   - 新依赖；
   - API 变化；
   - 测试结果；
   - 已知问题；
6. 完成后停止，等待下一 TASK。

---

# 1. 当前真实代码结构与职责

## 1.1 前端

```text
frontend/src/
├─ App.vue
│  ├─ 组合所有页面模块
│  ├─ 数字人 speak / Edge-TTS fallback
│  ├─ 90s idle disconnect
│  ├─ 问答 / 讲解 / 展览模式
│  ├─ 景点讲解
│  ├─ 路线讲解
│  ├─ 专属路线生成
│  ├─ 语音输入
│  └─ 反馈当前仅 alert
│
├─ api/index.js
│  ├─ attractions
│  ├─ routes
│  ├─ weather
│  ├─ route/plan
│  └─ ocr
│
├─ components/
│  ├─ AttractionList.vue
│  ├─ ChatPanel.vue
│  ├─ DigitalHuman.vue
│  ├─ MapPanel.vue
│  ├─ RouteCardRow.vue
│  ├─ RouteCustomizer.vue
│  ├─ WeatherBar.vue
│  └─ TopBar.vue
│
├─ composables/
│  ├─ useChat.js
│  └─ useSpeech.js
│
├─ data/
│  ├─ fallback.js
│  └─ guides.js
│
└─ xmov/
   └─ xmov-avatar.js
```

---

## 1.2 后端

```text
backend/app/
├─ main.py
├─ config.py
├─ routers/
│  ├─ ai.py
│  ├─ chat.py
│  ├─ data.py
│  └─ tts.py
└─ services/
   ├─ llm.py
   └─ tts_service.py
```

数据：

```text
backend/data/
├─ attractions.json
└─ routes.json
```

---

# 2. 当前代码中必须先解决的架构问题

## 2.1 景区事实存在多份副本

当前事实分散：

```text
backend/data/attractions.json
frontend/src/data/fallback.js
frontend/src/data/guides.js
backend/app/services/llm.py
```

后续必须逐步形成：

```text
结构化事实：backend/data/*
长文本知识：backend/data/knowledge/*
前端：只显示，不再维护实时事实
LLM：通过 context 获取，不继续硬编码事实
```

---

## 2.2 App.vue 职责已经过多

后续禁止继续把：

```text
GPS
地理围栏
Session
事件埋点
路线执行
主动服务
```

直接堆入 `App.vue`。

新增 composables 分担：

```text
useScenicData.js
useSession.js
useEventTracker.js
useGeolocation.js
useGeofence.js
useTourSession.js
useProactiveGuide.js
```

---

## 2.3 MapPanel 当前只支持景点 Marker

当前内部状态：

```javascript
let map = null
let markers = []
```

后续应拆为：

```javascript
let attractionMarkers = []
let facilityMarkers = []
let routeMarkers = []
let routePolyline = null
let locationMarker = null
```

但不得重建为另一套地图架构。

---

## 2.4 浏览器 GPS 坐标与百度地图坐标不同

`navigator.geolocation`：

```text
WGS84
```

当前景点坐标：

```text
BD-09
```

因此后续所有 LBS 功能必须：

```text
WGS84
 ↓
GCJ-02
 ↓
BD-09
```

之后才能与 `attractions.json` 计算距离。

---

## 2.5 当前魔珐 speaking 状态不完全可靠

目前：

```javascript
dhRef.value.speak(text)
```

成功后立即返回布尔值。

而：

```javascript
useChat.js
```

会认为 `await onSpeak()` 已结束。

实际魔珐可能仍在播报。

后续必须通过真实：

```javascript
onVoiceStateChange
```

观察 payload 后，再补充：

```text
avatarSpeaking
```

不要猜 SDK 状态枚举。

---

# 3. 总开发顺序

严格按照：

```text
TASK-00  基线审计与回归
TASK-01  统一景区数据状态
TASK-02  SQLite 会话与事件基础
TASK-03  Chat API 会话化 + 埋点
TASK-04  RAG + 结构化事实层
TASK-05  多模态图片识景
TASK-06  Geolocation + 坐标转换
TASK-07  公共设施数据与地图图层
TASK-08  路线数据标准化
TASK-09  路线执行状态
TASK-10  主动提醒
TASK-11  反馈 + Analytics + Admin
TASK-12  数字人状态修复 + 配置
TASK-13  分享 / 足迹 / 多语言（可选）
TASK-14  全量回归与比赛 Demo 模式
```

不要并行一次性实现全部。

---

# TASK-00：基线审计与回归

## 目标

不修改业务代码。

确认当前项目能够稳定运行，并记录现有行为作为后续回归基线。

---

## 检查文件

```text
frontend/src/App.vue
frontend/src/composables/useChat.js
frontend/src/composables/useSpeech.js
frontend/src/components/ChatPanel.vue
frontend/src/components/MapPanel.vue
frontend/src/components/DigitalHuman.vue
frontend/src/xmov/xmov-avatar.js

backend/app/main.py
backend/app/routers/chat.py
backend/app/routers/ai.py
backend/app/routers/data.py
backend/app/services/llm.py
```

---

## 执行

后端：

```bash
cd backend
python -m uvicorn app.main:app --port 8100
```

前端：

```bash
cd frontend
npm install
npm run dev
```

---

## 必测

### T00-01 Health

```text
GET /api/health
```

期望：

```json
{"status":"ok"}
```

### T00-02 attractions

```text
GET /api/attractions
```

至少返回当前 10 个景点。

### T00-03 routes

```text
GET /api/routes
```

返回 6 条路线。

### T00-04 文本 SSE

发送：

```text
灵山大佛有什么值得看的？
```

确认：

```text
右侧逐字输出
流结束
数字人/兜底语音开始播报
```

### T00-05 noavatar

打开：

```text
?noavatar=1
```

确认：

```text
页面不崩
文本问答可用
地图可用
路线可用
```

### T00-06 OCR

上传带文字图片。

确认：

```text
文字进入输入框
```

---

## 完成输出

输出：

```text
当前基线状态
现有失败项
现有控制台错误
现有接口样例
```

然后停止。

---

# TASK-01：统一景区数据状态

## 目标

解决目前：

```text
AttractionList 自己请求
MapPanel 自己请求
RouteCardRow 自己请求
App.vue 使用 FALLBACK 数据
```

导致的数据源不统一问题。

---

## 新增

```text
frontend/src/composables/useScenicData.js
```

---

## 实现要求

使用 module-level singleton：

```javascript
import { ref } from 'vue'
import { fetchAttractions, fetchRoutes } from '../api'
import { FALLBACK_ATTRACTIONS, FALLBACK_ROUTES } from '../data/fallback'

const attractions = ref(FALLBACK_ATTRACTIONS)
const routes = ref(FALLBACK_ROUTES)
const loading = ref(false)
const loaded = ref(false)
const error = ref(null)

export function useScenicData() {
  async function loadScenicData() {
    ...
  }

  return {
    attractions,
    routes,
    loading,
    loaded,
    error,
    loadScenicData,
  }
}
```

---

## 修改

```text
frontend/src/App.vue
frontend/src/components/AttractionList.vue
frontend/src/components/MapPanel.vue
frontend/src/components/RouteCardRow.vue
```

---

## App.vue

在 App 统一加载：

```javascript
const {
  attractions,
  routes,
  loadScenicData
} = useScenicData()

onMounted(() => {
  loadScenicData()
})
```

预设问题查找必须改为：

```javascript
attractions.value.find(...)
routes.value.find(...)
```

不再直接查：

```javascript
FALLBACK_ATTRACTIONS
FALLBACK_ROUTES
```

---

## AttractionList

删除组件内部：

```javascript
fetchAttractions()
```

改成：

```javascript
const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: ...
})
```

---

## MapPanel

删除内部：

```javascript
fetchAttractions()
```

改为 props：

```javascript
attractions
```

---

## RouteCardRow

删除内部：

```javascript
fetchRoutes()
```

改为 props：

```javascript
routes
```

---

## Fallback 原则

Fallback 仍保留。

只将 fallback 的选择权集中到：

```text
useScenicData.js
```

---

## 验收

后端关闭：

```text
页面仍使用 fallback
```

后端开启：

```text
所有景点/路线来自后端同一份响应
```

---

# TASK-02：SQLite 会话与事件基础

## 目标

增加持久化基础。

不做 Analytics UI。

---

## 新增

```text
backend/app/db.py
backend/app/routers/session.py
backend/app/routers/events.py
backend/storage/.gitkeep
```

并确保：

```text
backend/storage/lingshan.db
```

加入 `.gitignore`。

---

## 不引入 SQLAlchemy

使用：

```python
sqlite3
```

---

## db.py

必须：

```text
自动创建 storage 目录
自动初始化表
连接使用 row_factory
短连接
```

推荐 API：

```python
def init_db()
def execute(...)
def query_one(...)
def query_all(...)
```

---

## 表 1：sessions

```sql
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    mode TEXT DEFAULT 'qa',
    language TEXT DEFAULT 'zh-CN',
    profile_json TEXT DEFAULT '{}',
    location_enabled INTEGER DEFAULT 0
);
```

---

## 表 2：interactions

```sql
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    created_at TEXT NOT NULL,
    input_type TEXT DEFAULT 'text',
    question TEXT NOT NULL,
    answer TEXT DEFAULT '',
    intent TEXT,
    attraction_id TEXT,
    route_id TEXT,
    first_token_latency_ms INTEGER,
    total_latency_ms INTEGER,
    rag_hit INTEGER DEFAULT 0,
    rag_sources_json TEXT DEFAULT '[]'
);
```

---

## 表 3：events

```sql
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    created_at TEXT NOT NULL,
    event_type TEXT NOT NULL,
    attraction_id TEXT,
    route_id TEXT,
    payload_json TEXT DEFAULT '{}'
);
```

---

## 表 4：feedback

```sql
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    interaction_id INTEGER,
    created_at TEXT NOT NULL,
    score INTEGER NOT NULL,
    tags_json TEXT DEFAULT '[]',
    comment TEXT DEFAULT ''
);
```

---

## Session API

```text
POST /api/session/start
```

请求：

```json
{
  "mode": "qa",
  "language": "zh-CN"
}
```

返回：

```json
{
  "session_id": "uuid"
}
```

---

## Event API

```text
POST /api/events
```

请求：

```json
{
  "session_id": "...",
  "event_type": "attraction_click",
  "attraction_id": "ling-dashan-fo",
  "route_id": null,
  "payload": {}
}
```

---

## main.py

增加：

```python
from app import db
from app.routers import session, events
```

启动时初始化 DB。

可以：

```python
@app.on_event("startup")
def startup():
    db.init_db()
```

如 FastAPI 版本提示 lifespan，可保留现有简单方式，不在本 TASK 额外重构。

---

## 验收

调用：

```text
/api/session/start
/api/events
```

确认 SQLite 中有记录。

---

# TASK-03：Chat API 会话化 + 埋点

## 目标

在不破坏现有 SSE 的前提下：

```text
增加 session
增加 context
记录 interaction
记录 first token latency
记录 total latency
返回 interaction_id
```

---

## 修改

```text
backend/app/routers/chat.py
frontend/src/composables/useChat.js
frontend/src/App.vue
```

---

## ChatRequest

从：

```python
class ChatRequest(BaseModel):
    messages: list[dict]
```

改为：

```python
class ChatRequest(BaseModel):
    messages: list[dict]
    session_id: str | None = None
    mode: str = "qa"
    context: dict | None = None
    input_type: str = "text"
```

旧前端只传 messages 时仍必须可用。

---

## interaction 创建时机

请求到达：

```text
先写 interaction
answer=""
```

得到：

```text
interaction_id
```

SSE 开始时先发：

```text
data: {"meta":{"interaction_id":123}}
```

然后继续旧协议：

```text
data: {"delta":"灵"}
data: {"delta":"山"}
```

结束：

```text
data: [DONE]
```

---

## 时延

记录：

```text
request_started_at
first_token_at
response_end_at
```

保存：

```text
first_token_latency_ms
total_latency_ms
```

---

## useChat.js

升级：

```javascript
async function ask(text, options = {})
```

options：

```javascript
{
  sessionId,
  mode,
  context,
  inputType
}
```

消息结构升级：

```javascript
{
  role: 'assistant',
  content: '',
  interactionId: null,
  kind: 'chat',
  includeInContext: true,
}
```

---

## history 构造

禁止直接：

```javascript
messages.value.map(...)
```

应只保留：

```javascript
messages.value
  .filter(m => m.includeInContext !== false)
```

再 map 到：

```text
role/content
```

为后续主动提醒做准备。

---

## App.vue

启动时：

```text
POST /api/session/start
```

得到：

```text
sessionId
```

建议新 composable：

```text
frontend/src/composables/useSession.js
```

内部负责：

```text
sessionId
startSession()
```

sessionId 可以保存在：

```text
sessionStorage
```

刷新页面同 tab 继续复用。

---

## onChatSend

调用：

```javascript
ask(text, {
  sessionId: sessionId.value,
  mode: mode.value,
  context: {
    attraction_id: currentAttraction.value?.id || null,
    route_id: currentRouteId.value || null,
  },
  inputType: 'text',
})
```

语音：

```text
inputType = voice
```

图片：

```text
inputType = vision
```

---

# TASK-04：RAG + 结构化事实层

## 目标

逐步把事实从巨大 SYSTEM_PROMPT 中抽出。

不要求第一版就使用向量数据库。

---

## 新增

```text
backend/app/services/fact_service.py
backend/app/services/rag_service.py
backend/app/services/prompt_service.py
backend/data/service_info.json
backend/data/knowledge/faq.json
backend/data/knowledge/docs/.gitkeep
```

---

## requirements 增加

第一版：

```text
python-multipart
jieba
rank-bm25
pypdf
python-docx
```

暂不强制：

```text
sentence-transformers
faiss-cpu
```

---

## fact_service.py

读取：

```text
attractions.json
routes.json
service_info.json
```

建立索引：

```python
attraction_by_id
attraction_by_name
route_by_id
```

提供：

```python
def get_attraction(...)
def get_route(...)
def build_structured_context(question, context)
```

---

## service_info.json

存放：

```text
票价
观光车
通用开放政策
联系信息
游客中心等结构化信息
```

必须带：

```text
verified_at
source_note
```

示意：

```json
{
  "ticket": {
    "adult": 210,
    "student": 105,
    "verified_at": "2026-08-17",
    "source_note": "当前示范景区资料"
  }
}
```

实现时不要把示例当成未来永久有效事实。

---

## rag_service.py 第一版

推荐优先级：

```text
FAQ exact / alias
        ↓
BM25
        ↓
关键词匹配兜底
```

接口：

```python
class RagHit:
    chunk_id
    title
    content
    source
    score

def retrieve(query: str, top_k: int = 4) -> list[dict]
```

---

## 文档切分

目标：

```text
400~600 中文字符
80~120 overlap
```

但优先：

```text
标题
段落
```

切分。

---

## prompt_service.py

统一生成 system prompt。

建议：

```text
你是「灵山导览」AI 导游“小灵”。

事实使用优先级：
1. STRUCTURED_CONTEXT
2. RETRIEVED_CONTEXT
3. 通用背景知识

涉及：
门票、演出时间、开放时间、交通、设施位置、天气
等可能变化的信息时，如果 STRUCTURED_CONTEXT 没有可靠数据，
不得自行猜测。

若景区知识未检索到可靠答案，要明确说明暂未检索到可靠资料。
```

---

## llm.py

保留：

```python
client
stream_chat
plan_route
```

但：

```python
SYSTEM_PROMPT
```

逐步缩短。

`stream_chat` 修改为可接：

```python
structured_context
rag_context
```

但不要让 router 知道 OpenAI Client 细节。

---

## Chat 流程

```text
question
 ↓
fact_service
 ↓
rag_service
 ↓
prompt_service
 ↓
llm.stream_chat
```

---

## 记录

`interactions` 保存：

```text
rag_hit
rag_sources_json
```

---

# TASK-05：多模态图片识景

## 目标

复用现有火山视觉 API。

将：

```text
OCR
```

升级为：

```text
景点识别
OCR
普通图片问答
```

---

## 新增

```text
backend/app/services/vision_service.py
```

---

## 修改

```text
backend/app/routers/ai.py
frontend/src/api/index.js
frontend/src/components/ChatPanel.vue
frontend/src/App.vue
```

---

## vision_service.py

统一封装当前：

```text
base64
HTTP 请求
VISION_API_KEY
VISION_BASE_URL
VISION_MODEL
```

避免继续全部写在 router。

---

## 新接口

```text
POST /api/vision
```

multipart：

```text
file
question(optional)
mode=auto|attraction|ocr
```

返回：

```json
{
  "type": "attraction",
  "recognized_name": "灵山大佛",
  "attraction_id": "ling-dashan-fo",
  "confidence": "high",
  "ocr_text": "",
  "description": "...",
  "suggested_question": "请给我介绍灵山大佛，并告诉我最佳游览方式。"
}
```

---

## 识景约束

视觉模型只能从当前真实景点集合中匹配。

在 prompt 中提供：

```text
灵山大佛
灵山梵宫
九龙灌浴
祥符禅寺
五印坛城
曼飞龙塔
佛教文化博览馆
五智门
佛足坛
灵山大照壁
```

如果不是：

```text
返回 unknown
```

不能硬认。

---

## MIME 修复

不要再固定：

```text
data:image/jpeg
```

使用：

```python
mime = file.content_type or "image/jpeg"
```

---

## 文件限制

```text
只允许 image/*
最大 10 MB
```

---

## /api/ocr

保留。

内部改为：

```text
vision_service.analyze(mode="ocr")
```

保持旧返回：

```json
{
  "text": "...",
  "note": ""
}
```

---

## 前端

`api/index.js` 新增：

```javascript
analyzeImage(file, options)
```

---

## ChatPanel

当前图片按钮保留。

文案从：

```text
图片提问（识别图中文字）
```

改为：

```text
图片提问 / 识景
```

上传中：

```text
正在识别图片中的景点与内容…
```

---

## App.vue

新增：

```javascript
function onVisionResult(result) {
  if (result.type === 'attraction' && result.attraction_id) {
     const a = attractions.value.find(...)
     if (a) {
        tourAttraction(a)
        return
     }
  }

  if (result.ocr_text) {
     inputText.value = result.ocr_text
     return
  }

  if (result.suggested_question) {
     onChatSend(result.suggested_question, 'vision')
  }
}
```

---

# TASK-06：Geolocation + 坐标转换

## 目标

为：

```text
随行讲解
附近设施
路线进度
```

提供可靠位置基础。

---

## 新增

```text
frontend/src/composables/useGeolocation.js
frontend/src/utils/geoTransform.js
frontend/src/utils/distance.js
```

---

## geoTransform.js

实现：

```text
WGS84 -> GCJ02
GCJ02 -> BD09
```

函数：

```javascript
wgs84ToGcj02(lng, lat)
gcj02ToBd09(lng, lat)
wgs84ToBd09(lng, lat)
```

---

## distance.js

实现 Haversine：

```javascript
distanceMeters(lat1, lng1, lat2, lng2)
```

输入两边都必须已经是同坐标系。

---

## useGeolocation.js

状态：

```javascript
supported
permission
enabled
position
error
watchId
```

对外：

```javascript
start()
stop()
```

---

## 权限文案

开启前说明：

```text
定位仅用于当前游览中的到点讲解、附近设施和路线提示。
```

---

## 隐私

默认：

```text
不把连续 GPS 轨迹上传后端
```

事件只可记录：

```text
location_enable
attraction_arrival
```

不要记录连续经纬度历史。

---

# TASK-07：公共设施数据与地图图层

## 目标

在当前 MapPanel 上增加：

```text
卫生间
餐饮
出入口
游客服务
急救
母婴
停车
```

---

## 新增

```text
backend/data/facilities.json
```

---

## 数据结构

```json
[
  {
    "id": "toilet-001",
    "name": "XX 公共卫生间",
    "type": "toilet",
    "lng": 120.0,
    "lat": 31.0,
    "description": "",
    "verified_at": "2026-08-17",
    "source_note": "人工校验"
  }
]
```

---

## 重要

禁止 Coding Agent：

```text
根据想象生成真实设施名称和坐标
```

如果暂时没有真实 POI：

```text
可以用明确标记 DEMO 的测试数据
```

但：

```text
页面和数据文件必须标注 DEMO
```

---

## API

直接修改：

```text
backend/app/routers/data.py
```

新增：

```text
GET /api/facilities
GET /api/facilities?type=toilet
```

不需要新 router。

---

## api/index.js

新增：

```javascript
fetchFacilities(type)
```

---

## MapPanel.vue

props：

```javascript
attractions
facilities
facilityType
currentLocation
activeRoute
routeProgress
companionEnabled
```

---

## Overlay 状态拆分

```javascript
let attractionMarkers = []
let facilityMarkers = []
let routeMarkers = []
let routePolyline = null
let locationMarker = null
```

---

## 地图头部

保持原卡片。

增加：

```text
🗺️ 景区地图          [📍随行讲解]

[景点] [🚻] [🍜] [🚪] [服务]
```

---

## AI 问答联动

后续 intent router 或简单规则识别：

```text
卫生间
厕所
餐饮
游客中心
出口
```

回答时：

```text
未定位：
在地图上为你显示相关设施。

已定位：
最近的是 XX，约 180 米。
```

地图 emit：

```javascript
highlight-facility
```

---

# TASK-08：路线数据标准化

## 目标

让路线可以真正执行，而不是依赖 desc 文本。

---

## 修改

```text
backend/data/routes.json
frontend/src/data/fallback.js
backend/app/services/llm.py
```

---

## routes.json

保留旧字段：

```text
spots
km
hours
tags
desc
image
```

新增：

```json
{
  "stops": [
    {
      "attractionId": "fo-zu-tan",
      "stayMinutes": 15
    }
  ]
}
```

---

## 禁止

不要：

```javascript
desc.split('→')
```

作为正式路线执行数据。

---

## 缺失 POI

当前路线中可能有：

```text
天下第一掌
百子戏弥勒
佛手广场
灵山精舍
```

而 attractions 不一定包含。

处理规则：

```text
有真实 attractionId + 坐标：
可进入路线执行

没有：
保留文案，但不能当导航站点
```

UI 应：

```text
核心站点 2/6
```

而不是假装：

```text
2/21
```

---

## AI 路线输出

修改 planner schema：

```json
{
  "stops": [
    {
      "attraction_id": "jiu-long-guan-yu",
      "name": "九龙灌浴",
      "why": "适合观看动态演出"
    }
  ]
}
```

---

## 后端强校验

模型返回后：

```python
VALID_IDS = set(...)
```

所有：

```text
不存在的 attraction_id
```

必须：

```text
drop
或重新 fallback
```

不得直接进入前端。

---

# TASK-09：路线执行状态

## 目标

将：

```text
点击路线 → 讲一遍
```

升级为：

```text
选择路线
→ 开始游览
→ 当前站
→ 下一站
→ 已完成
```

---

## 新增

```text
frontend/src/composables/useTourSession.js
```

---

## 状态

```javascript
{
  routeId: null,
  status: 'idle',
  startedAt: null,
  currentStopIndex: 0,
  completedStopIds: [],
}
```

状态值：

```text
idle
active
completed
```

---

## 持久化

使用：

```text
localStorage
```

key：

```text
lingshan-tour-session
```

---

## API

第一版不要求路线状态必须后端持久化。

但事件上报：

```text
route_start
route_stop_reached
route_complete
```

---

## RouteCardRow.vue

增加 props：

```javascript
tourSession
```

增加 emits：

```javascript
start-route
continue-route
```

---

## 卡片

未开始：

```text
[开始游览]
```

进行中：

```text
进行中 · 核心站点 2/6
[继续游览]
```

完成：

```text
已完成
```

---

## MapPanel

路线 active 时：

```text
站点编号
当前站高亮
顺序示意连线
当前位置
下一站
```

---

## 重要

如果没有百度步行路线 API：

```text
只画“游览顺序示意线”
```

UI 中不要称为：

```text
精确步行导航
```

---

# TASK-10：主动提醒

## 目标

让小灵具备“伴游”感，而不是只能被动回答。

---

## 新增

```text
frontend/src/composables/useProactiveGuide.js
frontend/src/composables/useGeofence.js
```

---

## useGeofence.js

默认：

```text
enterRadius = 60m
exitRadius = 90m
```

使用滞回。

保存：

```text
insideId
triggeredIds
```

---

## 到点提示

默认不是直接强制播报。

插入：

```text
已到达「九龙灌浴」
要让小灵为你讲解吗？
[开始讲解] [稍后]
```

---

## 自动讲解

用户显式开启：

```text
自动讲解
```

后才允许自动调用：

```text
tourAttraction()
```

---

## 主动规则

第一版：

| 规则 | 条件 | 行为 |
|---|---|---|
| 到达景点 | <60m | 到点讲解提示 |
| 接近下一站 | <80m | 下一站提示 |
| 演出临近 | 0~30min | 演出提醒 |
| 路线开始 | 首次 | 路线概览 |
| 路线完成 | 最后一站 | 足迹入口 |
| 高温 | 天气有真实值 | 补水提示 |

---

## 消息结构

插入 Chat：

```javascript
{
  role: 'assistant',
  kind: 'notice',
  content: '...',
  includeInContext: false,
  actions: [...]
}
```

---

## 防刷屏

每个 rule：

```text
cooldown
oncePerSession
priority
```

---

## 与数字人冲突

当：

```text
loading
speaking
avatarSpeaking
```

任一 true：

```text
不强插播语音
```

只显示文字卡片。

---

# TASK-11：反馈 + Analytics + Admin

## 目标

形成景区运营闭环。

---

## 11.1 Feedback

新增：

```text
backend/app/routers/feedback.py
```

API：

```text
POST /api/feedback
```

---

## 请求

```json
{
  "session_id": "...",
  "interaction_id": 123,
  "score": -1,
  "tags": ["信息不准确"],
  "comment": ""
}
```

---

## ChatPanel

保留现有顶部“反馈”。

不增加新入口。

点击：

```text
这次回答对你有帮助吗？

👍 有帮助
👎 没帮助
```

点踩标签：

```text
信息不准确
没解决问题
回答太长
语音体验不好
路线不合理
其他
```

---

## 11.2 Analytics API

新增：

```text
backend/app/routers/analytics.py
backend/app/services/analytics_service.py
```

API：

```text
GET /api/analytics/summary
GET /api/analytics/questions
GET /api/analytics/attractions
GET /api/analytics/routes
GET /api/analytics/feedback
GET /api/analytics/sentiment
```

---

## Summary

至少：

```json
{
  "sessions_today": 0,
  "questions_today": 0,
  "avg_first_token_latency_ms": 0,
  "explicit_satisfaction_rate": null
}
```

---

## 满意度与情感严格分开

```text
满意度：
用户明确 👍/👎

情感：
模型/规则对游客文本的情绪判断
```

禁止将：

```text
positive sentiment
```

直接称为：

```text
satisfaction
```

---

## 11.3 Admin

第一版不引入 Vue Router。

新增：

```text
frontend/src/admin/AdminApp.vue
frontend/src/admin/OverviewPanel.vue
frontend/src/admin/KnowledgePanel.vue
frontend/src/admin/AnalyticsPanel.vue
frontend/src/admin/AvatarConfigPanel.vue
```

---

## main.js

从：

```javascript
createApp(App).mount('#app')
```

改成：

```javascript
import App from './App.vue'
import AdminApp from './admin/AdminApp.vue'

const Root = location.pathname.startsWith('/admin')
  ? AdminApp
  : App

createApp(Root).mount('#app')
```

---

## 前端依赖

只增加：

```text
echarts
```

不要加：

```text
Element Plus
Ant Design Vue
Pinia
Vue Router
Axios
```

---

## Admin Tab

只有：

```text
概览
知识库
游客分析
数字人配置
```

---

# TASK-12：数字人真实状态修复 + 配置

## 目标

修复当前 speaking 结束过早问题，并加入真正可控的配置。

---

## 12.1 先诊断

当前 `xmov-avatar.js` 已存在：

```javascript
onVoiceStateChange: (s) => console.log(...)
```

先使用：

```text
?diag=1
```

记录真实 payload。

至少观察：

```text
播报开始
播报过程
播报结束
打断
```

---

## 禁止

不要猜：

```text
0 = idle
1 = speaking
```

之类的枚举。

---

## 12.2 根据真实 payload 增加 callback

XmovAvatar constructor 增加可选 callback：

```javascript
this.onSpeakingChange = options?.onSpeakingChange
```

或通过：

```javascript
setSpeakingHandler()
```

实现。

---

## DigitalHuman.vue

增加：

```text
avatarSpeaking
```

并 expose：

```text
isSpeaking
```

或 emit：

```text
speaking-change
```

---

## App.vue

语音防回声：

```javascript
if (
  speaking.value ||
  loading.value ||
  avatarSpeaking.value
) return
```

---

## 12.3 useSpeech interim 修复

当前中间结果不要累加：

```javascript
interim.value += ...
```

改为每次 event：

```javascript
let interimText = ''
```

最终：

```javascript
interim.value = interimText
```

---

## 12.4 Avatar Config

新增：

```text
backend/app/routers/config_api.py
backend/data/avatar_config.json
```

可控项：

```json
{
  "welcome_text": "你好呀！我是小灵……",
  "persona": "professional-friendly",
  "reply_length": "short",
  "idle_disconnect_seconds": 90,
  "default_mode": "qa",
  "proactive_enabled": true
}
```

---

## 不做假功能

当前代码没有明确展示：

```text
voiceId
avatarResourceId
speechRate
```

可切换接口。

所以 Admin 第一版不提供假切换。

只有确认魔珐 SDK/账号支持后再加。

---

# TASK-13：分享 / 足迹 / 多语言（可选）

此任务不是核心。

必须等 TASK-00 ~ TASK-12 稳定后再做。

---

## 13.1 分享

优先：

```javascript
navigator.share()
```

不支持：

```javascript
navigator.clipboard.writeText()
```

分享内容来源：

```text
路线
攻略
AI 回答摘要
```

---

## 13.2 我的灵山足迹

依据真实：

```text
events
tourSession
visited attractions
vision uploads
```

生成。

禁止 LLM 增加用户未访问景点。

---

## 13.3 多语言

第一阶段：

```text
zh-CN
en-US
```

影响：

```text
Prompt
预设问题
TTS
欢迎词
```

---

# TASK-14：全量回归与比赛 Demo 模式

## 目标

将系统整理为可稳定展示版本。

---

## 14.1 回归清单

### 问答

```text
文字
语音
SSE
多轮
```

### 数字人

```text
正常连接
立绘 fallback
90s/配置 idle disconnect
打断
```

### 地图

```text
景点
设施
当前位置
路线
```

### 路线

```text
预设路线
AI 路线
开始游览
下一站
完成
```

### Vision

```text
景区照片
文字图片
非灵山照片
模糊图片
```

### LBS

```text
允许权限
拒绝权限
边界抖动
重复到达
```

### 后台

```text
统计
反馈
知识库
配置
```

---

## 14.2 Demo 模式

建议增加：

```text
?demo=1
```

用途：

```text
模拟位置
模拟演出临近
模拟路线进度
```

必须明确：

```text
仅用于比赛演示
```

不能伪装真实 GPS / 客流。

---

## 14.3 noavatar

保持：

```text
?noavatar=1
```

所有非数字人业务应继续可测试。

---

# 4. 知识库后台的具体实现补充

## 4.1 新增 router

```text
backend/app/routers/knowledge.py
```

接口：

```text
GET    /api/knowledge/documents
POST   /api/knowledge/documents
DELETE /api/knowledge/documents/{id}
POST   /api/knowledge/reindex
```

---

## 4.2 文档元数据表

SQLite 增加：

```sql
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    error TEXT DEFAULT ''
);
```

---

## 4.3 上传目录

```text
backend/storage/knowledge_uploads/
```

不要写入源码：

```text
backend/data/knowledge/docs
```

作为运行时上传目录。

`backend/data/knowledge/docs` 仅用于随仓库提交的固定资料。

---

## 4.4 状态

```text
pending
indexing
ready
failed
```

---

# 5. 前端消息模型统一方案

后续所有 Chat 消息统一：

```javascript
{
  id: 'local-or-server-id',
  role: 'user' | 'assistant' | 'system',
  kind: 'chat' | 'notice' | 'action' | 'vision',
  content: '',
  interactionId: null,
  includeInContext: true,
  actions: [],
  meta: {}
}
```

---

## 普通 AI

```javascript
kind: 'chat'
includeInContext: true
```

---

## 主动提醒

```javascript
kind: 'notice'
includeInContext: false
```

---

## 路线行动卡片

```javascript
kind: 'action'
includeInContext: false
actions: [
  {
    type: 'map-focus',
    label: '地图定位',
    payload: {...}
  }
]
```

---

# 6. 建议新增事件类型

统一：

```text
page_open
session_start
mode_change

chat_send
voice_send
vision_upload

attraction_click
guide_start

route_click
route_generate
route_start
route_stop_reached
route_complete

location_enable
location_disable
attraction_enter

facility_filter
facility_query

proactive_notice

feedback
share
trip_summary
```

---

# 7. API 最终增量清单

原有：

```text
GET  /api/health
GET  /api/attractions
GET  /api/routes
GET  /api/weather
POST /api/chat
POST /api/route/plan
POST /api/ocr
GET  /api/tts
```

新增：

```text
POST /api/session/start
POST /api/events
POST /api/feedback

POST /api/vision

GET  /api/facilities

GET    /api/knowledge/documents
POST   /api/knowledge/documents
DELETE /api/knowledge/documents/{id}
POST   /api/knowledge/reindex

GET /api/analytics/summary
GET /api/analytics/questions
GET /api/analytics/attractions
GET /api/analytics/routes
GET /api/analytics/feedback
GET /api/analytics/sentiment

GET /api/config/avatar
PUT /api/config/avatar
```

可选：

```text
POST /api/trip/summary
POST /api/route/replan
```

---

# 8. 最终建议前端结构

```text
frontend/src/
├─ App.vue
├─ main.js
│
├─ api/
│  └─ index.js
│
├─ components/
│  ├─ AttractionList.vue
│  ├─ ChatPanel.vue
│  ├─ DigitalHuman.vue
│  ├─ MapPanel.vue
│  ├─ RouteCardRow.vue
│  ├─ RouteCustomizer.vue
│  ├─ FeedbackPanel.vue
│  ├─ VisionResultCard.vue
│  └─ ProactiveNotice.vue
│
├─ composables/
│  ├─ useChat.js
│  ├─ useSpeech.js
│  ├─ useScenicData.js
│  ├─ useSession.js
│  ├─ useEventTracker.js
│  ├─ useGeolocation.js
│  ├─ useGeofence.js
│  ├─ useTourSession.js
│  └─ useProactiveGuide.js
│
├─ utils/
│  ├─ geoTransform.js
│  └─ distance.js
│
├─ data/
│  ├─ fallback.js
│  └─ guides.js
│
├─ admin/
│  ├─ AdminApp.vue
│  ├─ OverviewPanel.vue
│  ├─ KnowledgePanel.vue
│  ├─ AnalyticsPanel.vue
│  └─ AvatarConfigPanel.vue
│
└─ xmov/
   └─ xmov-avatar.js
```

---

# 9. 最终建议后端结构

```text
backend/
├─ app/
│  ├─ main.py
│  ├─ config.py
│  ├─ db.py
│  │
│  ├─ routers/
│  │  ├─ ai.py
│  │  ├─ chat.py
│  │  ├─ data.py
│  │  ├─ tts.py
│  │  ├─ session.py
│  │  ├─ events.py
│  │  ├─ feedback.py
│  │  ├─ knowledge.py
│  │  ├─ analytics.py
│  │  └─ config_api.py
│  │
│  └─ services/
│     ├─ llm.py
│     ├─ tts_service.py
│     ├─ fact_service.py
│     ├─ rag_service.py
│     ├─ prompt_service.py
│     ├─ vision_service.py
│     └─ analytics_service.py
│
├─ data/
│  ├─ attractions.json
│  ├─ routes.json
│  ├─ facilities.json
│  ├─ service_info.json
│  ├─ avatar_config.json
│  └─ knowledge/
│     ├─ faq.json
│     └─ docs/
│
└─ storage/
   ├─ lingshan.db
   ├─ rag_index/
   └─ knowledge_uploads/
```

---

# 10. 禁止事项

Coding Agent 必须严格避免：

## 10.1 不得伪造实时数据

禁止生成：

```text
当前客流 72%
当前拥堵
当前停车位
```

除非有真实数据源。

---

## 10.2 不得伪造设施坐标

没有数据：

```text
明确 DEMO
```

---

## 10.3 不得大改数字人

不要为了：

```text
后台配置
主动提醒
```

去重写：

```text
xmov-avatar.js
```

---

## 10.4 不得一次性新增大量框架

当前项目是轻量实现。

新增依赖必须有明确价值。

---

## 10.5 不得让 LLM 决定全部路线合法性

模型输出：

```text
必须后端校验 attraction_id
```

---

## 10.6 不得把系统通知加入 LLM 多轮上下文

主动提醒：

```text
includeInContext = false
```

---

# 11. 每阶段验收最低标准

## Phase A

```text
TASK 00~03
```

要求：

```text
旧页面无明显变化
问答不退化
SSE 不退化
日志可落库
```

---

## Phase B

```text
TASK 04~05
```

要求：

```text
RAG 能回答景区资料
知识不足能拒绝
图片可识景
OCR 保留
```

---

## Phase C

```text
TASK 06~10
```

要求：

```text
定位不破坏地图
坐标转换正确
设施可筛选
路线可执行
主动提醒不刷屏
```

---

## Phase D

```text
TASK 11~12
```

要求：

```text
反馈入库
后台统计是真实数据
数字人 speaking 状态可验证
配置只做真实可控项
```

---

# 12. 第一轮可以直接粘贴给 Coding Agent 的指令

下面内容可以直接复制给编程智能体。

---

## 第一轮执行 Prompt

你现在处理的仓库是：

```text
WaterXiao-git/AI-Avatar
```

只处理：

```text
lingshan-guide
```

分支。

请先完整阅读：

```text
灵山导览_AI数字人功能增强与工程实现方案.md
灵山导览_Coding_Agent_实施手册.md
```

同时以当前仓库真实代码为唯一实现基础。

### 本轮只执行 TASK-00 + TASK-01。

禁止执行后续 TASK。

### 第一步：基线审计

不要修改代码。

确认：

```text
1. 当前 branch / commit
2. 前端启动
3. 后端启动
4. /api/health
5. /api/attractions
6. /api/routes
7. /api/chat SSE
8. ?noavatar=1
9. OCR
10. 当前 console/backend 错误
```

先输出审计结果。

如果存在阻塞性错误，停止，不进入 TASK-01。

### 第二步：TASK-01

新增：

```text
frontend/src/composables/useScenicData.js
```

并修改：

```text
frontend/src/App.vue
frontend/src/components/AttractionList.vue
frontend/src/components/MapPanel.vue
frontend/src/components/RouteCardRow.vue
```

目标：

```text
全页面 attractions/routes 统一使用 useScenicData
后端不可用时统一 fallback
```

不得修改：

```text
frontend/src/components/DigitalHuman.vue
frontend/src/xmov/xmov-avatar.js
backend/app/services/llm.py
backend/app/routers/chat.py
```

除非为了修复 TASK-00 发现的阻塞性已有 bug，且必须先说明。

完成后：

```text
npm run build
```

并重新验证：

```text
景点卡片
地图
路线卡片
预设景点讲解
预设路线讲解
后端关闭 fallback
```

最后输出：

```text
修改文件
新增文件
测试结果
未解决问题
```

然后停止。

---

# 13. 第二轮执行 Prompt

仅执行：

```text
TASK-02 + TASK-03
```

目标：

```text
SQLite
Session
Events
Interactions
Chat metadata
Latency
```

禁止：

```text
RAG
Vision 重构
LBS
Facilities
Admin
DigitalHuman 重构
```

必须保持：

```text
POST /api/chat
messages 旧参数可用
SSE delta 旧协议不变
```

完成后测试：

```text
文字问答
语音问答
数字人播报
旧 OCR
路线
```

全部回归。

---

# 14. 第三轮执行 Prompt

仅执行：

```text
TASK-04
```

即：

```text
fact_service
rag_service
prompt_service
knowledge 基础
Chat 接入 RAG
```

第一版不要使用大型向量基础设施。

优先：

```text
FAQ + BM25 + fallback
```

完成后准备至少：

```text
20 个景区 QA 测试
```

验证：

```text
有资料回答
没资料拒绝
门票/时间不乱猜
```

---

# 15. 第四轮执行 Prompt

仅执行：

```text
TASK-05
```

目标：

```text
/api/vision
图片识景
OCR 兼容
```

不得：

```text
更换视觉供应商
增加新图片入口
重写 ChatPanel
```

复用：

```text
现有图片按钮
现有火山 Vision
现有 tourAttraction
现有数字人讲解
```

---

# 16. 第五轮执行 Prompt

仅执行：

```text
TASK-06 + TASK-07
```

目标：

```text
Geolocation
坐标转换
Facilities
Map 图层
```

必须：

```text
WGS84 -> GCJ02 -> BD09
```

禁止直接用 WGS84 和当前 attractions BD09 坐标计算距离。

设施没有真实数据时：

```text
明确 DEMO
```

---

# 17. 第六轮执行 Prompt

仅执行：

```text
TASK-08 + TASK-09
```

目标：

```text
routes stops 标准化
AI route attraction_id 校验
route session
```

禁止：

```text
用 desc.split('→') 作为导航逻辑
```

---

# 18. 第七轮执行 Prompt

仅执行：

```text
TASK-10 + TASK-11
```

目标：

```text
主动提醒
反馈
Analytics
Admin
```

管理端：

```text
不引入 Vue Router
```

第一版只允许新增：

```text
echarts
```

作为主要前端依赖。

---

# 19. 第八轮执行 Prompt

仅执行：

```text
TASK-12
```

先使用：

```text
?diag=1
```

记录魔珐：

```text
onVoiceStateChange
```

真实数据。

不得猜枚举。

确认后才修改：

```text
avatarSpeaking
```

同时修：

```text
useSpeech interim
```

---

# 20. 最终完成定义

只有以下条件全部满足，才称为“增强版完成”。

## 游客端

```text
问答
语音
3D 数字人
景点讲解
图片识景
路线推荐
路线执行
地图
附近设施
随行讲解
主动提醒
反馈
```

---

## AI 能力

```text
结构化事实
RAG
多轮会话
防幻觉
多模态
```

---

## 景区运营

```text
知识库管理
会话日志
热门问题
路线偏好
显式满意度
游客情感
配置管理
```

---

## 工程

```text
noavatar 可测试
故障降级
API 兼容
不伪造实时数据
不破坏现有数字人
```

---

# 21. 最终比赛展示主线

推荐：

```text
1. 语音问：3 小时怎么玩？
2. AI 生成路线
3. 开始游览
4. 地图显示路线
5. 上传灵山照片识景
6. 开启随行讲解
7. 到点触发讲解
8. 问附近卫生间
9. 演出临近主动提醒
10. 用户反馈
11. 打开 /admin
12. 展示知识库和真实交互统计
```

最终讲述重点不是：

```text
“我们接了很多 API”
```

而是：

```text
游客：
从“问”到“走”形成伴游闭环。

AI：
从“固定 Prompt”升级成可维护景区知识系统。

景区：
从“数字人展示页”升级成可运营、可反馈、可分析的服务平台。
```
