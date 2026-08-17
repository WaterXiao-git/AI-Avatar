# 灵山导览 · AI 数字人导览系统
## 功能增强与工程实现方案（面向中国软件杯 A5「景区导览服务 AI 数字人」）

> 版本：V1.0  
> 目标：在**不推翻现有 Vue 3 + Vite + FastAPI + DeepSeek + 魔珐星云 3D 数字人 + 百度地图**架构、不大改当前主页面布局的前提下，补齐竞赛关键能力，并参考主流景区 AI 伴游产品增加真正有用、可演示、可验收的功能。  
> 使用方式：本文件可直接交给编程助手。编程助手应先扫描现有仓库实际目录与 API 实现，再按本文“兼容优先、增量修改”的原则落地；若实际文件名与本文示例不同，以仓库现状为准，不应为了匹配本文而大规模重构。

---

# 1. 当前系统基线

根据现有 README 和当前页面，系统已经具备以下完整主链路：

- 前端：Vue 3 + Vite 5。
- 后端：FastAPI。
- AI 对话：DeepSeek，SSE 流式输出。
- 数字人：魔珐星云 Lite SDK，支持 3D 实时数字人、口型、表情、动作。
- 语音：
  - Web Speech API 负责中文语音识别；
  - 魔珐 `avatar.speak()` 优先负责语音播报与口型；
  - Edge-TTS 作为兜底。
- 三种模式：
  - 问答模式；
  - 讲解模式；
  - 展览模式。
- 地图：百度地图 JS API GL。
- 路线：
  - 6 条预设路线；
  - 大模型生成专属路线。
- 图片：已经有图片上传入口，目前主要做 OCR 后再提问。
- 天气：Open-Meteo。
- 景点/路线：已有结构化 JSON。
- 页面布局已经比较完整：
  - 左上：天气、景点快捷入口；
  - 左侧中部：景区地图；
  - 左下：游览路线；
  - 中间：3D 数字人；
  - 右侧：AI 导游对话区。

**本次增强不改变上述主体结构。**

---

# 2. 本轮改造的核心原则

## 2.1 不重写前端

禁止为了新增功能改成 React / Next.js，也不要重新设计整套页面。

继续使用：

```text
Vue 3 + Vite
```

只在现有页面中增加少量：

- 地图图层按钮；
- 随行讲解开关；
- 路线执行状态；
- 消息反馈按钮；
- 主动提醒卡片。

管理功能放到独立 `/admin` 页面，不挤占游客主页。

---

## 2.2 不拆微服务

继续使用现有 FastAPI 单体后端。

可以新增：

```text
routers/
services/
storage/
```

但只做代码组织，不做注册中心、网关、消息队列等竞赛阶段不必要的基础设施。

---

## 2.3 保持现有 API 兼容

现有接口：

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

原则：

1. 不删除；
2. 不随意改变已有返回字段；
3. 新能力优先增加新接口；
4. `/api/chat` 即使增强 RAG，也尽量保持原 SSE 输出方式。

---

## 2.4 主页面只做“能力增强”，不做“功能堆叠”

参考行业产品后，真正值得在当前项目加入的是：

1. 可维护的景区知识库；
2. 真正的图片识景，而不只是 OCR；
3. LBS 随行伴游；
4. 公共服务设施查询；
5. 主动服务与演出提醒；
6. 路线“生成后真正执行”；
7. 游客反馈、情感与数据大屏；
8. 数字人配置管理；
9. 对话/路线分享；
10. 游后游记或足迹总结。

AR 大场景复原、票务支付、多智能体重构、复杂数字孪生暂时不加入本轮核心开发。

---

# 3. 差距分析与开发优先级

| 能力 | 当前状态 | 本轮建议 | 优先级 |
|---|---|---|---|
| 文字问答 | 已有 | 保留并接入 RAG | P0 |
| 语音问答 | 已有 | 保留，增加延迟埋点 | P0 |
| 数字人口型/动作 | 已有 | 保留 | P0 |
| 多轮上下文 | 已有或部分已有 | 明确 session 管理 | P0 |
| 景点讲解 | 已有 | 保留 | P0 |
| 预设路线 | 已有 | 保留 | P0 |
| 个性化路线 | 已有 | 增加结构化结果和路线执行 | P0/P1 |
| 景区知识库 | 当前主要硬编码在 `llm.py` | 改成可更新 RAG | **P0** |
| 知识库后台 | 缺失 | 增加上传/删除/重建索引 | **P0** |
| 图片多模态 | 目前主要 OCR | 升级为“识景 + OCR + 图片问答” | **P0** |
| 会话日志 | 缺失或不完整 | SQLite 持久化 | **P0** |
| 游客反馈 | 页面已有“反馈”入口感 | 接后端评分/标签 | P1 |
| 游客感受度报告 | 缺失 | 情感 + 明确满意度分开统计 | **P1** |
| 运营数据大屏 | 缺失 | `/admin` 增加 ECharts | **P1** |
| 实时定位 | 缺失 | 浏览器 Geolocation | **P1** |
| 到点自动/半自动讲解 | 缺失 | 地理围栏触发 | **P1** |
| 卫生间/出入口/餐饮等 | 缺失 | 地图设施图层 | **P1** |
| 演出主动提醒 | 缺失 | 利用已有演出时间数据 | **P1** |
| 路线进度 | 缺失 | 下一站、已完成、剩余时间 | P1 |
| 动态改线 | 缺失 | 简化版重规划 | P1 |
| 数字人配置后台 | 缺失 | 角色/音色/语速/欢迎词 | P1 |
| 分享 | 缺失 | 复制路线/对话摘要 | P2 |
| 多语言 | 缺失 | 中英优先 | P2 |
| 游后游记 | 缺失 | 基于真实游览事件生成 | P2 |
| AR 历史复原 | 缺失 | 本轮不建议 | P3 |
| 票务支付 | 缺失 | 本轮不建议 | P3 |
| 真正多智能体编排 | 缺失 | 本轮不建议重构 | P3 |

---

# 4. P0：必须优先补齐的功能

# 4.1 景区 RAG 知识库

## 4.1.1 为什么要改

当前知识内容主要写在：

```text
backend/app/services/llm.py
```

这对于 Demo 可以工作，但有三个问题：

1. 景区资料更新需要改代码；
2. 很难展示“景区知识库可运营”；
3. 无法形成可测试的知识检索链路。

因此将原有硬编码知识保留为“最终兜底”，主问答增加 RAG。

---

## 4.1.2 推荐实现方式

新增：

```text
backend/
  app/
    services/
      rag_service.py
      document_service.py
  data/
    knowledge/
      faq.json
      docs/
  storage/
    rag_index/
```

如项目目前没有 `routers/`，不强制迁移旧接口，只新增：

```text
backend/app/routers/knowledge.py
```

然后在 `main.py`：

```python
app.include_router(knowledge_router, prefix="/api/knowledge")
```

---

## 4.1.3 数据优先级

回答事实时按照：

```text
实时/结构化业务数据
    >
景区 RAG 资料
    >
现有硬编码兜底知识
    >
大模型通用知识
```

其中：

- 门票；
- 演出时间；
- 开放时间；
- 景点坐标；
- 路线；

优先读取结构化 JSON / 后台配置，避免 LLM 自己编。

---

## 4.1.4 检索方案

为了比赛现场稳定，建议做**双模式 HybridRetriever**。

### 模式 A：完整语义检索

如果本机依赖正常：

```text
FAQ exact match
    ↓
BM25
    +
BGE-small-zh / 其他中文 embedding
    ↓
Top-K 合并
    ↓
可选 LLM rerank
```

可选依赖：

```text
rank_bm25
sentence-transformers
faiss-cpu
```

### 模式 B：轻量兜底

如果 embedding / FAISS 启动失败：

```text
FAQ exact match
    +
BM25
    +
关键词匹配
```

保证没有向量模型也能正常演示。

**不要因为向量库初始化失败导致 `/api/chat` 整体不可用。**

---

## 4.1.5 文档支持格式

后台至少支持：

```text
PDF
DOCX
TXT
MD
CSV（FAQ）
```

建议依赖：

```text
pypdf
python-docx
rank-bm25
```

---

## 4.1.6 Chunk 结构

建议内部统一为：

```json
{
  "chunk_id": "lingshan_history_001",
  "document_id": "doc_001",
  "title": "灵山大佛历史",
  "category": "history",
  "attraction_id": "lingshan-buddha",
  "content": "...",
  "source": "示范景区公开资料包",
  "updated_at": "2026-08-17"
}
```

不要只保存裸文本。

---

## 4.1.7 `/api/chat` 修改

现有前端不改调用方式。

请求可以向后兼容地增加可选字段：

```json
{
  "message": "九龙灌浴什么时候看比较合适？",
  "session_id": "uuid",
  "mode": "qa",
  "context": {
    "current_attraction_id": null,
    "route_id": null,
    "language": "zh-CN"
  }
}
```

流程修改为：

```text
用户问题
  ↓
识别问题类型
  ↓
如果属于实时结构化问题：
  查询 attractions/routes/weather
否则：
  RAG 检索
  ↓
构造受约束 Prompt
  ↓
DeepSeek SSE
  ↓
数字人播报
```

---

## 4.1.8 Prompt 约束

核心约束示意：

```text
你是灵山胜境 AI 导游“小灵”。

事实使用优先级：
1. 系统提供的实时/结构化数据；
2. 检索到的景区资料；
3. 明确标记的兜底知识。

涉及门票价格、开放时间、演出时间、交通、天气等可能变化的信息，
如果系统未提供当前有效数据，不得自行猜测。

若知识库没有答案，应明确说明暂未检索到可靠资料，
并建议用户询问游客中心，而不是编造。
```

---

# 4.2 升级“图片提问”为真正多模态识景

## 4.2.1 当前问题

当前链路：

```text
上传图片
  ↓
OCR
  ↓
文字填入输入框
  ↓
再提问
```

这只能很好处理带文字的图片。

应升级为：

```text
上传图片
  ↓
视觉大模型理解图片
  ├─ 景点/建筑识别
  ├─ 佛像/文物/场景解释
  ├─ OCR
  └─ 用户自定义图片问题
  ↓
结合景区知识库二次回答
```

---

## 4.2.2 前端不增加新入口

**直接复用右下角现有“图片”按钮。**

用户上传图片后，不再默认只做 OCR。

默认文案：

```text
正在识别图片中的景点与内容……
```

识别结果：

```text
识别到：灵山大佛
置信提示：较高
```

随后自动向 AI 导游发送：

```text
请结合景区知识库介绍这个景点，并告诉我游览时值得注意什么。
```

如果视觉模型判断图片主要为文字，则自动切换 OCR 逻辑。

---

## 4.2.3 新接口

新增：

```text
POST /api/vision
```

`multipart/form-data`：

```text
file: image
question: 可选
mode: auto | attraction | ocr
```

返回：

```json
{
  "type": "attraction",
  "recognized_name": "灵山大佛",
  "attraction_id": "lingshan-buddha",
  "confidence": 0.92,
  "ocr_text": null,
  "description": "...",
  "suggested_question": "请给我讲讲灵山大佛，并告诉我最佳参观方式。"
}
```

---

## 4.2.4 兼容旧 `/api/ocr`

不删除：

```text
POST /api/ocr
```

内部可以改成调用：

```python
vision_service.analyze(mode="ocr")
```

这样旧前端或旧测试仍然可用。

---

# 4.3 会话日志与性能埋点

这是后续反馈、感受度报告、数据大屏的基础。

## 4.3.1 新增 SQLite

不改变景点、路线 JSON。

SQLite 只负责：

```text
游客 session
对话记录
事件记录
反馈
知识库文档元数据
数字人配置
```

推荐：

```text
backend/storage/lingshan.db
```

---

## 4.3.2 建议表结构

### sessions

```text
session_id TEXT PRIMARY KEY
started_at DATETIME
last_active_at DATETIME
mode TEXT
language TEXT
profile_json TEXT
location_enabled INTEGER
```

### interactions

```text
id INTEGER PRIMARY KEY
session_id TEXT
created_at DATETIME
input_type TEXT
question TEXT
answer TEXT
intent TEXT
attraction_id TEXT
route_id TEXT
latency_ms INTEGER
rag_hit INTEGER
rag_sources_json TEXT
sentiment TEXT
feedback_score INTEGER
```

### events

```text
id INTEGER PRIMARY KEY
session_id TEXT
created_at DATETIME
event_type TEXT
attraction_id TEXT
route_id TEXT
payload_json TEXT
```

事件类型至少：

```text
page_open
mode_change
attraction_click
route_click
route_generate
route_start
route_stop_reached
guide_start
vision_upload
facility_query
location_enable
proactive_notice
feedback
```

---

## 4.3.3 延迟统计

`/api/chat` 后端记录：

```text
request_start
first_llm_token_at
response_end
```

至少得到：

```text
first_token_latency_ms
total_latency_ms
```

如果能在前端记录数字人第一句开始播放时间，再增加：

```text
voice_first_play_latency_ms
```

不要让统计逻辑阻塞主回答。

---

# 5. P1：行业体验增强，但保持原页面

# 5.1 LBS 随行伴游

这是当前系统从“网页导游”升级为“伴游智能体”最值得加入的功能之一。

---

## 5.1.1 入口位置

不要增加顶部新模式。

在现有“景区地图”卡片标题右侧增加：

```text
[📍 随行讲解 OFF]
```

打开后：

```text
[📍 随行讲解 ON]
```

首次开启调用：

```javascript
navigator.geolocation
```

并弹出简短权限说明。

---

## 5.1.2 定位尽量前端本地处理

已有 `attractions.json` 包含坐标，因此：

```text
浏览器位置
   ↓
前端 Haversine 距离计算
   ↓
判断是否进入景点半径
```

默认不需要持续上传位置到服务器。

建议：

```text
触发半径：60m
退出半径：90m
```

加入滞回，避免 GPS 漂移重复触发。

---

## 5.1.3 触发策略

不要默认一靠近就强制播报。

推荐：

```text
检测到到达九龙灌浴
┌────────────────────────────┐
│ 已到达「九龙灌浴」         │
│ 要让小灵为你讲解吗？       │
│ [开始讲解] [稍后]          │
└────────────────────────────┘
```

用户在设置中打开“自动讲解”后，才直接播放。

---

## 5.1.4 防重复

每个 session 保存：

```javascript
visitedAttractionIds
triggeredGuideIds
```

同一景点默认只自动触发一次。

---

# 5.2 公共服务设施图层

主流景区导览非常重要，而当前页面地图只有景点点位。

---

## 5.2.1 地图 UI

在地图卡片内部上方增加轻量筛选：

```text
[景点] [卫生间] [餐饮] [出入口] [服务]
```

宽度不够时用图标：

```text
📍  🚻  🍜  🚪  ⛑
```

---

## 5.2.2 数据类型

新增：

```text
backend/data/facilities.json
```

结构：

```json
[
  {
    "id": "toilet-001",
    "name": "公共卫生间",
    "type": "toilet",
    "lat": 0,
    "lng": 0,
    "description": "",
    "source": "百度地图人工校验",
    "verified_at": "2026-08-17"
  }
]
```

`lat/lng` 示例中的 0 只是 schema 占位，**实现时必须使用实际校验坐标，严禁让 LLM 编造设施位置。**

类型建议：

```text
toilet
restaurant
entrance
service_center
first_aid
mother_baby
shop
parking
```

---

## 5.2.3 API

新增：

```text
GET /api/facilities
```

支持：

```text
?type=toilet
```

前端也可一次加载后本地筛选。

---

## 5.2.4 AI 问答联动

用户问：

```text
附近哪里有卫生间？
```

如果没有开启定位：

```text
可以先在地图上为你显示卫生间。
如果允许定位，我还可以帮你找最近的一处。
```

如果已经定位：

```text
最近的是 XX 卫生间，距离约 180 米。
```

并让地图高亮相应 marker。

---

# 5.3 路线从“推荐卡片”升级为“正在游览”

目前系统已经会推荐路线，但还缺“路线执行态”。

---

## 5.3.1 不改变底部路线卡片结构

点击路线时：

当前：

```text
触发讲解 / 显示攻略
```

增强为：

```text
路线详情
[开始游览]
```

开始后底部当前选中卡片增加小状态：

```text
进行中 · 第 2/5 站
```

---

## 5.3.2 RouteSession

前端维护：

```javascript
{
  routeId,
  startedAt,
  currentStopIndex,
  completedStopIds,
  remainingMinutes,
  status: "idle" | "active" | "completed"
}
```

存入：

```text
localStorage
```

同时事件上报后端。

---

## 5.3.3 地图联动

路线启动后：

1. 高亮路线站点；
2. 按顺序编号 `1 2 3 4...`；
3. 当前站特殊高亮；
4. 下一站显示；
5. 绘制路线连线。

如果没有百度步行路径 API 或景区内部步道数据：

**只画“游览顺序示意线”，不要伪装成精确步行导航。**

---

## 5.3.4 下一站卡片

右侧 AI 对话区域允许插入系统卡片：

```text
下一站 · 灵山梵宫
约 8 分钟 / 520m
[开始讲解] [地图定位]
```

继续使用现有聊天面板，不另开页面。

---

# 5.4 主动服务与演出提醒

这是相对普通问答系统很容易形成产品差异的功能。

---

## 5.4.1 数据来源

优先使用当前已有：

```text
attractions.json
```

内的：

```text
开放时间
演出时间
```

以及：

```text
/api/weather
当前路线状态
用户当前位置（若授权）
```

---

## 5.4.2 第一阶段只做规则引擎

**不要为了“主动智能”额外引入复杂 Agent 框架。**

新增：

```text
backend/app/services/proactive_service.py
```

或纯前端规则亦可。

规则示例：

### 演出提醒

```text
距离九龙灌浴演出 <= 30 分钟
AND 用户尚未收到本场提醒
AND 当前路线包含/接近九龙灌浴
```

推送：

```text
九龙灌浴还有 25 分钟开始。
如果你想观看，建议现在从梵宫方向前往。
[加入路线] [知道了]
```

### 天气提醒

仅使用 API 实际返回的数据。

例如：

```text
温度较高
```

提示：

```text
今天温度较高，游览过程中注意补水。
```

不要输出没有数据支持的“暴雨预警”“客流爆满”。

### 下一站提醒

进入下一站 80m：

```text
你已经接近「祥符禅寺」，需要开始讲解吗？
```

---

## 5.4.3 主动消息展示

不要弹大量系统通知。

统一放进右侧 AI 对话面板：

```text
小灵 · 行程提醒
```

并设置：

```text
每类提醒冷却
同一演出不重复推送
用户可关闭主动提醒
```

---

# 5.5 “单智能体 + 工具路由”，不要重构成真正多智能体

行业里会出现“讲解智能体、路线智能体、服务智能体”等多个角色。

当前项目没必要照搬。

建议内部增加轻量意图路由：

```text
用户输入
  ↓
intent_router
  ├─ scenic_qa
  ├─ attraction_guide
  ├─ route_plan
  ├─ facility_query
  ├─ schedule_query
  ├─ weather_query
  └─ general_chat
```

外部永远仍然只有一个“小灵”。

优点：

- 前端完全不变；
- 数字人不变；
- 仍然有“多能力协同”；
- 减少不同模型 Agent 之间的上下文管理问题。

---

# 6. P1：后台管理与竞赛展示

# 6.1 新增 `/admin`

游客主页不加管理入口。

直接通过：

```text
/admin
```

进入。

竞赛现场可以单独打开第二个浏览器标签页展示。

---

## 6.2 页面结构

建议 4 个 Tab 足够：

```text
概览
知识库
游客分析
数字人配置
```

不要开发庞杂 CMS。

---

# 6.3 概览 Dashboard

建议使用 ECharts。

卡片：

```text
今日服务会话数
今日提问数
平均首字响应时间
显式满意度
```

图表：

```text
热门问题 Top 10
热门景点 Top 10
问题类型分布
满意度趋势
游客情感趋势
路线偏好分布
```

注意：

**“游客情感”与“游客满意度”必须区分。**

- 情感：模型根据问题文本推测；
- 满意度：用户明确点赞/点踩/评分。

不能把“正面情绪”直接当成“满意”。

---

# 6.4 知识库后台

功能：

```text
[上传文档]
```

列表字段：

```text
文件名
类型
上传时间
Chunk 数
索引状态
```

操作：

```text
查看
重新索引
删除
```

状态：

```text
pending
indexing
ready
failed
```

上传完成后应显示：

```text
知识库更新完成，共生成 87 个知识片段。
```

---

# 6.5 游客感受度报告

每次用户消息异步分析：

```text
positive
neutral
negative
```

可以让 DeepSeek 低成本分类，也可使用轻量规则。

**不要让情感分析阻塞回答。**

FastAPI 可以使用：

```python
BackgroundTasks
```

处理。

报告页面显示：

```text
整体情感趋势
负面问题 Top 10
低满意度对话
高频咨询类型
```

支持点开一条会话查看：

```text
用户问题
AI 回答
知识来源
用户反馈
```

---

# 6.6 前台反馈

当前右侧顶部已经有“反馈”位置，直接利用。

点击：

```text
这次回答对你有帮助吗？
👍 有帮助
👎 没帮助
```

点踩后可选：

```text
信息不准确
回答太长
没解决问题
语音体验不好
路线不合理
其他
```

API：

```text
POST /api/feedback
```

请求：

```json
{
  "session_id": "xxx",
  "interaction_id": 123,
  "score": -1,
  "tags": ["信息不准确"]
}
```

---

# 6.7 数字人配置后台

当前数字人来自魔珐星云，所以不要照搬 Live2D 模型上传逻辑。

配置项建议：

```text
当前角色
声音/音色
语速
角色语气
欢迎词
空闲断开时间
默认讲解风格
```

数据：

```json
{
  "avatar_resource_id": "provider-resource-id",
  "voice_id": "voice-id",
  "speech_rate": 1.0,
  "persona": "professional-friendly",
  "welcome_text": "你好呀！我是小灵……",
  "idle_disconnect_seconds": 90
}
```

API：

```text
GET  /api/config/avatar
PUT  /api/config/avatar
```

### 特别注意

如果当前魔珐账号只允许一个固定 3D 形象：

- 不要做一个“假切换形象”的按钮；
- 先支持声音、语速、角色语气、欢迎词；
- 后台保留 `avatar_resource_id` 字段；
- 等账号真正拥有多个可用角色资源 ID 后再开放形象切换。

---

# 7. P2：低成本加分功能

# 7.1 一键分享路线 / 对话攻略

行业产品已经在做“问完直接分享”。

不需要复杂社交系统。

在：

- 路线详情；
- AI 长回答；
- 游览攻略卡片；

右上角增加：

```text
分享
```

桌面 Web 第一阶段只需：

```javascript
navigator.clipboard.writeText()
```

生成：

```text
灵山胜境 · 亲子喜乐线
预计 4 小时
1. ...
2. ...
3. ...
来自「灵山导览 · 小灵」
```

如果支持：

```javascript
navigator.share()
```

则移动端优先使用 Web Share API。

---

# 7.2 游后“我的灵山足迹”

不要新做复杂会员体系。

根据本 session 已记录的：

```text
点击/到达景点
开始讲解
路线
图片识景
```

用户点：

```text
生成我的游记
```

后端只把**真实事件**交给 LLM：

```text
已游览：A、B、C
路线：文化体验线
停留时间：...
用户问过：...
```

生成：

```text
今日足迹
游览摘要
印象最深的景点
适合分享的 100 字游记
```

禁止让模型生成用户没有去过的景点。

---

# 7.3 多语言

第一阶段只建议：

```text
中文
English
```

语言设置放在右侧 AI 导游标题栏的更多菜单中，不占主页面。

处理逻辑：

```text
language=zh-CN / en-US
```

影响：

```text
system prompt
回复文本
TTS voice
预设问题
```

如果魔珐当前声音不支持目标语言：

```text
自动回退 Edge-TTS
```

---

# 8. 当前主页面的具体修改稿

# 8.1 顶部区域

**不改。**

继续：

```text
Logo + 天气
问答 / 讲解
展览模式
```

不再添加一堆顶部入口。

---

# 8.2 左侧景点快捷入口

保留现有 5 个景点圆形入口。

可增加状态小点：

```text
当前路线包含：蓝点
已游览：✓
```

但不是 P0。

---

# 8.3 景区地图

原结构：

```text
景区地图
[百度地图]
```

调整：

```text
景区地图                 [📍随行讲解]
[景点] [🚻] [🍜] [🚪] [服务]

[百度地图]
```

开启路线后在地图中叠加：

```text
路线编号 marker
顺序连线
当前位置
下一站
```

---

# 8.4 游览路线

保留横向卡片。

选中后：

```text
祈福禅悟线
10 景点 · 3 公里 · 3 小时
[开始游览]
```

开始后：

```text
进行中 · 2/10
[继续游览]
```

“生成专属路线”按钮不变。

---

# 8.5 中间数字人

**尽量不改。**

继续作为视觉焦点。

底部现有：

```text
打断
```

保持。

如果已有主动打断能力，不重复开发另一个按钮。

---

# 8.6 右侧 AI 导游

保持总体布局。

顶部推荐问题可调整为：

```text
推荐经典路线
九龙灌浴几点看？
附近卫生间
带娃怎么玩？
下一站去哪？
```

AI 回复支持 3 种消息：

```text
普通文本
攻略卡片
服务/路线行动卡片
```

行动卡片示例：

```text
🚻 最近的卫生间
约 180m
[地图定位]
```

---

# 9. API 增量清单

保留旧 API。

新增建议：

```text
POST /api/vision

GET  /api/facilities

POST /api/session/start
POST /api/events
POST /api/feedback

GET  /api/knowledge/documents
POST /api/knowledge/documents
DELETE /api/knowledge/documents/{id}
POST /api/knowledge/reindex

GET  /api/analytics/summary
GET  /api/analytics/questions
GET  /api/analytics/sentiment
GET  /api/analytics/attractions
GET  /api/analytics/routes

GET  /api/config/avatar
PUT  /api/config/avatar
```

可选：

```text
POST /api/route/replan
POST /api/trip/summary
```

---

# 10. 推荐的新后端目录

在不破坏旧代码的前提下：

```text
backend/
├─ app/
│  ├─ main.py
│  ├─ routers/
│  │  ├─ knowledge.py
│  │  ├─ analytics.py
│  │  ├─ events.py
│  │  ├─ vision.py
│  │  └─ config.py
│  │
│  ├─ services/
│  │  ├─ llm.py                  # 现有，增强 RAG
│  │  ├─ rag_service.py
│  │  ├─ document_service.py
│  │  ├─ vision_service.py
│  │  ├─ analytics_service.py
│  │  ├─ intent_service.py
│  │  ├─ proactive_service.py
│  │  └─ tts_service.py          # 现有
│  │
│  ├─ db.py
│  └─ schemas.py
│
├─ data/
│  ├─ attractions.json
│  ├─ routes.json
│  ├─ facilities.json
│  └─ knowledge/
│     ├─ faq.json
│     └─ docs/
│
└─ storage/
   ├─ lingshan.db
   └─ rag_index/
```

如果现有项目已有类似目录，直接复用，不要重复建层。

---

# 11. 推荐的新前端结构

同样遵循“只新增、不重构”。

```text
frontend/src/
├─ components/
│  ├─ FacilityLayerControl.vue
│  ├─ CompanionToggle.vue
│  ├─ RouteProgressCard.vue
│  ├─ ProactiveNotice.vue
│  ├─ FeedbackPanel.vue
│  └─ VisionResultCard.vue
│
├─ composables/
│  ├─ useTourSession.js
│  ├─ useGeofence.js
│  └─ useEventTracker.js
│
├─ views/
│  └─ AdminView.vue
│
└─ admin/
   ├─ OverviewPanel.vue
   ├─ KnowledgePanel.vue
   ├─ AnalyticsPanel.vue
   └─ AvatarConfigPanel.vue
```

**不要为了这些状态再强行引入 Pinia。**

当前项目如果没有状态库，使用：

```text
Vue reactive/ref
composable
localStorage
```

已经足够。

---

# 12. RAG 实现细节

# 12.1 FAQ 优先

`faq.json`：

```json
[
  {
    "question": "今天门票多少钱？",
    "answers": ["灵山胜境门票多少钱", "门票价格"],
    "category": "ticket",
    "answer_source": "structured"
  }
]
```

对于：

```text
门票
演出时间
开放时间
交通
```

优先映射到结构化数据，而不是直接保存固定答案。

---

# 12.2 Chunk

推荐：

```text
chunk_size ≈ 400~600 中文字符
overlap ≈ 80~120
```

同时优先按标题、段落切分，不要机械切字符。

---

# 12.3 检索返回

内部格式：

```json
{
  "query": "...",
  "hits": [
    {
      "chunk_id": "...",
      "score": 0.82,
      "title": "...",
      "source": "...",
      "content": "..."
    }
  ]
}
```

聊天界面暂时不用展示复杂 citation。

可以在长回答底部显示轻量信息：

```text
依据：灵山胜境景区资料
```

后台调试模式再显示具体 chunk。

---

# 12.4 防幻觉

如果：

```text
max_score < threshold
```

并且问题明显是景区事实：

回复：

```text
我暂时没有检索到足够可靠的景区资料来确认这个问题，
建议你以景区游客中心或官方最新公告为准。
```

---

# 13. 路线生成结构化改造

当前 `/api/route/plan` 建议从“只返回一段文字”升级为：

```json
{
  "title": "亲子轻松半日线",
  "summary": "...",
  "estimated_minutes": 240,
  "distance_km": 3.1,
  "stops": [
    {
      "attraction_id": "xxx",
      "name": "九龙灌浴",
      "stay_minutes": 35,
      "reason": "适合亲子观看演出"
    }
  ],
  "tips": [
    "..."
  ]
}
```

同时保留旧字段，以免前端现有解析出错。

---

# 14. 主动服务规则表

第一版不要让 LLM 自己决定所有推送。

使用明确规则：

| 事件 | 条件 | 行为 |
|---|---|---|
| 到达景点 | 距离 < 60m | 询问是否讲解 |
| 接近下一站 | 距离 < 80m | 下一站提示 |
| 演出临近 | 0~30min | 演出提醒 |
| 路线启动 | 首次 | 给出路线概览 |
| 路线完成 | 最后一站完成 | 生成总结入口 |
| 高温 | 天气 API 有真实数据 | 补水提示 |
| 用户多次问设施 | 2 次以上 | 建议开启设施图层 |

每个 rule 要有：

```text
cooldown
once_per_session
priority
```

避免刷屏。

---

# 15. 错误与降级策略

现在项目已经有很好的兜底思路，新功能继续遵循。

## 15.1 RAG 失败

```text
RAG 初始化失败
    ↓
现有 llm.py 知识兜底
```

聊天不能崩。

---

## 15.2 视觉模型失败

```text
/api/vision 失败
    ↓
尝试旧 /api/ocr
    ↓
提示用户可改用文字
```

---

## 15.3 定位失败

```text
拒绝权限 / 浏览器不支持
```

不要报错弹窗。

显示：

```text
未开启定位，仍可手动查看景区地图与路线。
```

---

## 15.4 百度地图失败

保持现有占位和 fallback。

设施列表仍可通过文字查询，但不能假装能够精确导航。

---

## 15.5 魔珐不可用

继续：

```text
立绘 + Edge-TTS
```

新增功能不应依赖魔珐成功连接。

---

# 16. 隐私与数据原则

LBS 与交互日志一旦加入，需要做最小合规处理。

## 16.1 定位

首次开启提示：

```text
定位仅用于当前游览中的到点讲解、附近设施和路线提示。
```

优先前端计算距离。

没有必要时不要持久化精确轨迹。

---

## 16.2 日志

后台默认存：

```text
session_id
问题
回答
交互事件
```

不要主动收集：

```text
姓名
手机号
身份证
人脸
```

---

# 17. 不建议本轮做的内容

以下功能在竞赛展示中看起来高级，但会显著增加开发量或风险。

## 17.1 不做大规模 AR 历史复原

原因：

```text
需要素材
需要 3D 对齐
需要相机姿态
需要大量调试
```

本项目已有 3D 数字人，没必要再扩张战线。

---

## 17.2 不接真实支付/票务

可以让 AI 回答：

```text
怎么买票
```

但不要为了比赛去接完整交易。

---

## 17.3 不重构多智能体

保留一个“小灵”。

内部：

```text
intent_router + tools
```

足够。

---

## 17.4 不改成小程序

当前 Web 页面已经完整。

先把能力做深。

如果后续需要移动端，再考虑响应式/H5/小程序壳。

---

## 17.5 不做“假的实时客流”

如果没有真实数据源：

不要显示：

```text
当前景区拥挤度 72%
```

可用：

```text
演示客流数据
```

但必须明确标注“模拟”。

最好竞赛阶段直接不做实时客流。

---

# 18. 推荐开发顺序

# Phase 1：竞赛硬能力

先完成：

```text
1. SQLite session / interaction / event
2. RAG knowledge service
3. 知识库后台
4. /api/chat 接 RAG
5. /api/vision 真正图片识景
6. QA 测试集与延迟统计
```

完成标准：

```text
不改主页面也能明显提升后端能力
```

---

# Phase 2：游客体验

完成：

```text
7. Geolocation
8. 地理围栏
9. 设施图层
10. 路线执行态
11. 演出提醒
12. 下一站卡片
```

---

# Phase 3：运营闭环

完成：

```text
13. 反馈
14. 情感异步分析
15. /admin 数据大屏
16. 数字人配置
```

---

# Phase 4：低风险加分

完成：

```text
17. 分享
18. 游后足迹
19. 中英切换
```

---

# 19. 验收标准

# 19.1 核心链路

必须跑通：

```text
语音提问
→ LLM/RAG
→ SSE
→ 数字人语音
→ 口型/表情
```

---

# 19.2 RAG

准备独立测试集：

```text
至少 60 个问题
```

分类建议：

```text
历史文化 15
景点特色 10
门票/时间 10
路线 10
交通/设施 10
其他 5
```

记录：

```text
正确
部分正确
错误
拒答合理
```

对于可能变化的数据，测试目标是：

```text
使用结构化当前数据或明确拒绝猜测
```

而不是死记历史值。

---

# 19.3 多模态

至少测试：

```text
灵山大佛照片
梵宫照片
九龙灌浴照片
带景区文字的图片
非灵山图片
模糊图片
```

非灵山图片不能硬认成灵山景点。

---

# 19.4 LBS

测试：

```text
开启定位
关闭定位
拒绝权限
进入景点范围
反复边界抖动
同景点二次进入
```

确保不会连续播报。

---

# 19.5 主动提醒

测试：

```text
同一提醒不重复
数字人正在说话时不强插语音
用户关闭主动服务后不再推送
```

---

# 19.6 数据大屏

所有图表必须来自数据库真实交互记录。

不能写死：

```text
服务 12345 人
满意度 98%
```

演示前可以使用脚本生成明确标记为：

```text
Demo Seed Data
```

的数据。

---

# 20. 演示建议：7 分钟主线

如果用于比赛演示，建议按“游客闭环 + 管理闭环”展示，而不是挨个点按钮。

## 0:00 - 0:40

展示页面：

```text
3D 数字人
天气
景区地图
路线
三种模式
```

---

## 0:40 - 1:40

语音问：

```text
第一次来灵山，3 小时怎么逛？
```

展示：

```text
语音 → AI → 数字人
个性化路线
地图路线
```

---

## 1:40 - 2:30

上传一张灵山景点照片。

展示：

```text
视觉识别
景点匹配
知识库讲解
```

强调：

```text
不是简单 OCR
```

---

## 2:30 - 3:20

打开：

```text
随行讲解
```

演示模拟位置/真实 GPS 进入景点范围。

触发：

```text
到点讲解
下一站
```

---

## 3:20 - 4:00

问：

```text
附近哪里有卫生间？
```

展示：

```text
设施图层
地图 marker
```

---

## 4:00 - 4:40

展示演出提醒：

```text
九龙灌浴即将开始
```

说明这是根据：

```text
路线 + 位置 + 演出时间
```

主动服务。

---

## 4:40 - 5:20

点一下：

```text
反馈
```

---

## 5:20 - 6:20

切 `/admin`：

```text
知识库上传
问答日志
热门问题
满意度
情感趋势
```

---

## 6:20 - 7:00

总结：

```text
游客端：
问、看、听、走、导航、提醒

景区端：
资料可更新、服务可分析、体验可优化
```

---

# 21. 给编程助手的明确执行指令

请严格按照以下方式修改现有仓库：

1. **先完整扫描现有前后端代码，不要根据本文猜文件名。**
2. 保留当前：
   - Vue 3；
   - Vite；
   - FastAPI；
   - DeepSeek；
   - 魔珐星云；
   - Web Speech API；
   - 百度地图；
   - Open-Meteo。
3. 不重写主页面，不更换框架。
4. 不删除现有 API。
5. 第一批优先实现：
   - SQLite 会话/事件日志；
   - RAG；
   - 知识库管理；
   - 图片识景；
   - 数据统计基础。
6. 第二批实现：
   - LBS 随行讲解；
   - 公共设施图层；
   - 路线执行；
   - 演出提醒。
7. 第三批实现：
   - `/admin`；
   - 反馈；
   - 游客感受度；
   - 数据大屏；
   - 数字人配置。
8. 每完成一个功能都必须：
   - 保持旧功能可用；
   - 增加异常降级；
   - 增加最小测试；
   - 检查 `?noavatar=1` 模式仍可完成主要业务测试。
9. 所有实时性或事实性数据不得由 LLM 编造。
10. 如果需要新增依赖，优先选：
    - CPU 可运行；
    - Windows 可安装；
    - 无 GPU 依赖；
    - 竞赛现场可离线/降级。
11. 对涉及魔珐星云资源切换的代码，先读取现有 SDK 接入方式：
    - 若 SDK/账号支持多个角色资源 ID，则实现后台切换；
    - 若不支持，只做音色/语速/persona/欢迎词配置，不做假功能。
12. 最终提交前输出一份：
    - 修改文件列表；
    - 新增 API 列表；
    - 新增依赖；
    - `.env.example` 新变量；
    - 数据库初始化方法；
    - RAG 初始化方法；
    - 本地运行步骤；
    - Demo 测试步骤。

---

# 22. 最终目标形态

本轮完成后，项目不应该变成另一个复杂系统，而是在当前界面基础上形成三个闭环。

## 游客服务闭环

```text
看地图
→ 问数字人
→ 生成路线
→ 开始游览
→ 到点讲解
→ 找设施
→ 接收演出/行程提醒
→ 反馈/分享
```

## AI 知识闭环

```text
景区资料
→ 后台上传
→ 自动索引
→ RAG 检索
→ 数字人回答
→ 低分回答被反馈
→ 后台定位问题
→ 更新知识
```

## 景区运营闭环

```text
游客交互
→ 行为事件
→ 热门问题/景点/路线
→ 满意度与情感
→ 管理后台
→ 优化讲解与服务
```

这三个闭环比单纯继续增加更多视觉按钮，更适合当前项目，也更容易在比赛评审中说明：

```text
我们做的不是一个会说话的 3D 页面，
而是一套“游客伴游 + 景区知识运营 + 服务数据分析”的 AI 数字人导览系统。
```

---

# 23. 资料调研对本方案的启发

本方案在不照搬其他产品架构的前提下，吸收了以下行业方向：

- A5「景区导览服务 AI 数字人」公开资料中强调的：
  - 多模态交互；
  - 景区知识问答；
  - 可更新知识库；
  - 个性化推荐；
  - 数字人配置；
  - 游客感受度；
  - 数据大屏。
- 花瓣地图 AI 伴游：
  - 路线切换；
  - 边走边听；
  - 餐厅/出入口/卫生间等设施图层。
- 虎丘 AI 导览：
  - 实时定位；
  - 路线规划；
  - 卫生间、母婴室、文创商店等服务导航。
- AI 西湖：
  - 根据游玩时长、偏好、体能节奏进行路线规划；
  - 便民服务与“边聊边办”的思路。
- 黄小西景区智能体：
  - AI 伴游地图；
  - 主动提醒；
  - 对话分享；
  - 多能力协同。
- 雷峰塔文旅智能体：
  - 随位置主动推送文化内容；
  - 深度知识库；
  - 游览内容分享和数字化游后传播。

本项目不建议直接复制其“多智能体”“AR 大场景”“交易闭环”等高成本能力，而应优先用现有单数字人页面把上述能力以工具化方式接入。

---

# 24. 实施后的 README 应补充内容

功能完成后同步更新 README：

```text
新增：
- RAG 景区知识库
- 知识库后台
- AI 图片识景
- LBS 随行讲解
- 公共服务设施地图
- 路线执行与下一站提示
- 演出主动提醒
- 游客反馈与感受度分析
- 运营数据大屏
- 数字人配置
```

API 一览同步补齐。

`.env.example` 如需新增：

```text
ADMIN_PASSWORD=
EMBEDDING_MODEL=
RAG_ENABLED=true
GEO_FEATURE_ENABLED=true
```

如果没有新增第三方 Key，不要为了形式再引入新的云服务。
