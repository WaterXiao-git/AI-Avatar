# 灵山导览 · AI 数字人导览系统

按参考图一比一复刻的「灵山导览」数字人导览页面：3D 数字人（魔珐星云）+ DeepSeek 大模型对话 + 语音对话 + 百度地图 + 游览路线推荐，支持**问答 / 讲解 / 展览**三种交互模式。

## 功能特性

### 🤖 3D 数字人（魔珐星云 Lite SDK）

- **实时驱动**：口型 / 表情 / 动作随回答自动联动
- **语音播报双链路**：优先魔珐星云 `avatar.speak()`（服务端合成 + 口型）；不可用时 Edge-TTS 兜底发声
- **立绘兜底**：3D 未上屏 / 连接失败 / 空闲断开时自动展示二次元立绘，面板永不空白
- **空闲自动断开**：90s 无操作自动断开连接省积分（魔珐按会话 + 在线时长双计费），断开后立绘兜底恢复
- **失败原因提示**：连接失败时展示红色原因（如积分不足错误码 10003），便于定位

### 💬 三种交互模式

| 模式 | 触发方式 | 行为 |
|---|---|---|
| **问答模式** | 打字 / 语音提问 | DeepSeek 思考 → 小景语音播报，支持多轮上下文 |
| **讲解模式** | 点景点卡片 / 路线卡片 / 预设问题 | 小景按攻略长文播报 + 弹出游玩攻略卡片（必玩 / 贴士 / 拍照位 / 演出 / 提示） |
| **展览模式** | 全屏沉浸展示 | 数字人大幅放大，「开口即问」——识别到语音即自动提问 |

### 🎤 语音对话（Web Speech API）

- 浏览器原生语音识别（中文），**识别到一句话即自动提问**（问答 / 展览模式一致），形成「说话 → 小景思考 → 语音回复」的对话闭环
- **防回声保护**：小景思考 / 播报时忽略新语音，避免音箱回声被麦克风拾取自触发
- 浏览器不支持或未授权麦克风时按钮自动置灰，可回退文字输入

### 🗺️ 地图与路线

- 百度地图 GL 展示灵山胜境位置
- 6 条预设游览路线（祈福 / 文化 / 亲子 / 美食 / 文博 / 清净）
- **专属路线生成**：按时长（半天 / 全天 / 多日）、人群（一家人 / 独自 / 情侣 / 朋友 / 带娃）、强度、兴趣标签，由大模型定制

### 🖼️ 图片提问

上传图片 → 后端 OCR（火山引擎方舟视觉模型）识别图中文字 → 填入输入框 → 再提问。

### ☀️ 天气栏

左上角实时天气（Open-Meteo，免密钥），网络不可用时兜底静态值。

### 🔧 调试钩子

- `?noavatar=1`：跳过魔珐连接与语音，纯布局 / 逻辑验证，不消耗积分
- `?tour=景点id`：进入页面自动讲解指定景点（验证攻略卡片）
- `?demo=1`：**演示模式**（比赛现场演示用）。不读取真实 GPS / 客流，而是：
  - 模拟位置沿当前路线景点坐标循环移动，自动触发到点 / 临近 / 演出提醒
  - 演出判断使用「模拟时钟」（取最近有演出景点、播报其第一场演出前 10 分钟）
  - 界面左上角显示金色「🎬 演示模式」徽标，普通模式不出现

## 交互设计

预设问题按内容分流：

| 预设问题 | 行为 |
|---|---|
| 推荐经典路线 | 讲解「祈福禅悟线」 |
| 九龙灌浴几点看最合适？ | 讲解「九龙灌浴」+ 攻略卡片 |
| 带娃怎么玩最合适？ | 讲解「亲子喜乐线」 |
| 想拍美照推荐哪条线？ | 讲解「文化体验线」 |
| 今天门票多少钱？ | 走 AI 问答 |

## 技术栈

- 前端：Vue 3 + Vite 5（JavaScript）
- 数字人：魔珐星云 Lite SDK 1.1.2（3D 实时数字人）+ 二次元立绘兜底
- AI 对话：DeepSeek（SSE 流式）
- 语音识别：浏览器 Web Speech API（中文）
- 语音合成：魔珐星云 TTS → Edge-TTS 兜底
- 图片识别：火山引擎方舟视觉模型（OCR）
- 天气：Open-Meteo（免密钥）
- 地图：百度地图 JS API GL

## 快速启动

### 后端（端口 8101）

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
# 复制 .env.example 为 .env，填入 DEEPSEEK_API_KEY / BAIDU_MAP_AK（可选 VISION_API_KEY 开启图片提问）
# 设置 ADMIN_TOKEN 后，后台知识库接口（上传/删除/重建）必须携带 Authorization: Bearer <ADMIN_TOKEN>
.venv/Scripts/python -m uvicorn app.main:app --port 8101
```

### 前端（端口 5276）

```bash
cd frontend
npm install
# .env 已含魔珐星云 appId/appSecret（VITE_XMOV_*）
npm run dev
```

打开 http://localhost:5276（端口被占用时 Vite 会自动递增）

## 凭证配置

| 文件 | 变量 | 说明 |
|---|---|---|
| `backend/.env` | `DEEPSEEK_API_KEY` | DeepSeek 密钥（必填） |
| `backend/.env` | `BAIDU_MAP_AK` | 百度地图 AK |
| `backend/.env` | `VISION_API_KEY` | 火山视觉模型密钥（图片提问，可选） |
| `backend/.env` | `ADMIN_TOKEN` | 后台管理接口鉴权（知识库上传/删除/重建等；留空 = 不校验） |
| `frontend/.env` | `VITE_XMOV_APP_ID` / `VITE_XMOV_APP_SECRET` | 魔珐星云驱动应用凭证 |

`.env` 已被 `.gitignore` 忽略，不会提交。

## 架构说明

```
用户输入（打字 / 语音识别 / 预设问题 / 图片 OCR）
        ↓
POST /api/chat（SSE 流式）→ DeepSeek 回答文本
        ↓
小景播报：魔珐星云 avatar.speak()（语音 + 口型 + 表情 + 动作）
        ↓
魔珐不可用时：立绘兜底 + Edge-TTS 语音（/api/tts）
```

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/attractions` | 景点列表 |
| GET | `/api/routes` | 游览路线列表 |
| GET | `/api/weather` | 实时天气（Open-Meteo，失败兜底静态值） |
| POST | `/api/chat` | DeepSeek 流式问答（SSE） |
| POST | `/api/route/plan` | 大模型生成专属路线 |
| POST | `/api/ocr` | 图片文字识别（火山视觉模型） |
| GET | `/api/tts` | Edge-TTS 语音合成（兜底语音） |

## 数据来源

景点、路线与 AI 知识库均来自《示范景区公开资料包》（灵山胜境结构化数据集 / 历史·文化·游览指南 / 游客行为分析数据）：

- `backend/data/attractions.json`：10 个真实灵山胜境景点（大照壁→大佛，含开放/演出时间、坐标）
- `backend/data/routes.json`：6 条游览路线（祈福禅悟线、文化体验线、亲子喜乐线、舌尖上的灵山、文博探索之旅、清净自在线，含景点数/公里/小时/标签）
- `backend/app/services/llm.py`：AI 导游知识库（历史渊源、门票 210/105 元、九龙灌浴与吉祥颂演出时间、素斋 50/35 元、游客平均停留 4h / 人均 916 元等）
- `frontend/src/data/fallback.js`：与后端 JSON 一致的兜底数据，后端未启动时演示不中断
- `frontend/src/data/guides.js`：景点 / 路线攻略卡片文案（小红书博主风格）

## 已知问题

- **Edge-TTS 403**：微软语音服务会对部分出口 IP 风控（`WSServerHandshakeError: 403`）。
  仅在「魔珐星云不可用 + 需要语音」的兜底路径使用，不影响主流程。比赛现场网络通常可用；
  若不可用，可改接火山引擎/讯飞 TTS（改 `backend/app/services/tts_service.py`）。
- **百度地图**：需 AK 有效且该 AK 已开通 WebGL 服务；无 AK 时地图区域显示占位文案。
- **魔珐星云**：免费版实时驱动 3 路并发，空闲 90s 自动断开省积分；商用需向魔珐科技申请书面授权。
- **Web Speech API**：依赖浏览器原生语音识别（Chrome / Edge 可用），需联网并授权麦克风；
  Firefox 或不支持的环境下麦克风按钮置灰，可回退文字输入。
- **火山 OCR**：需配置 `VISION_API_KEY`；未配置时图片提问接口优雅降级，提示改用文字提问。

## 素材

- `frontend/public/model/route-1.png ~ route-6.png`：6 张路线实景照片（真实网络图源，与参考图一一对应）
- `frontend/public/model/attraction-*.png`：5 张景点圆形图标（灵山大佛/梵宫/九龙灌浴/五印坛城/祥符禅寺，真实网络图源）
- `frontend/public/model/avatar-transparent.png`：数字人立绘兜底图（3D 不可用时展示）
- `frontend/public/model/bg.jpg`：页面背景图
