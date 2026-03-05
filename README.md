# Interactive Avatar

Interactive Avatar 是一个前后端分离的交互式数字人原型系统：
用户可以创建 3D 角色（文本/图片/预设），完成辅助绑骨与场景配置，并在交互页通过语音与手势进行实时会话，最后在 Dashboard 查看模型、会话历史和录屏。

## 项目特性

- 多入口建模：文本生成、图片生成、预设角色
- 辅助绑骨流程：8 点位标注 + 任务轮询 + 动作预览
- 场景系统：图库选择、背景上传、文生图、提示词润色
- 实时交互：挥手触发、语音会话、中断与自动结束
- 数据沉淀：模型记录、会话事件、摘要、录屏上传与回看

## 主流程（4 步）

1. 形象生成（`/create`）
2. 辅助绑定（`/rig-preview`）
3. 场景预览（`/scene-preview`）
4. 交互会话（`/interact`）

会话结果可在 `Dashboard`（`/dashboard`）中检索与回看。

## 技术栈

- Frontend: Vite + React 19 + React Router + Three.js + React Three Fiber + MediaPipe
- Backend: FastAPI + SQLAlchemy 2 + Alembic + SQLite + WebSocket
- External Services:
  - Meshy（文本/图片生成 3D）
  - DashScope / Qwen（实时语音、ASR、提示词润色、文生图）
  - Unsplash（可选图库来源）

## 目录结构

```text
Interactive Avatar/
├─ frontend/                  # React 前端
│  ├─ src/
│  └─ public/
├─ backend/                   # FastAPI 后端
│  ├─ app/
│  ├─ alembic/
│  └─ assets/
├─ README.md
├─ PROJECT_OVERVIEW.md
├─ JUDGE_BRIEF.md
└─ Introduction.md
```

## 快速开始

### 1) 启动后端

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# Windows CMD: .venv\Scripts\activate.bat
pip install -r requirements.txt
copy .env.example .env
python -m alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8788 --reload
```

后端默认地址：`http://localhost:8788`

### 2) 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认地址：`http://localhost:5178`

### 3) 打开应用

- 访问 `http://localhost:5178`
- 注册/登录后进入主流程

## 环境变量

后端从 `backend/.env` 读取配置；可先由 `.env.example` 复制。

### 核心变量

- `DATABASE_URL`：数据库连接（默认 SQLite）
- `JWT_SECRET` / `JWT_ALGORITHM` / `JWT_EXPIRE_HOURS`：鉴权配置
- `MESHY_API_KEY`：Meshy 密钥（文本/图片建模）
- `DASHSCOPE_API_KEY`：DashScope 密钥（语音、润色、文生图）

### Qwen 相关

- `QWEN_RT_URL`：实时语音 WS 地址
- `QWEN_MODEL`：实时语音模型
- `QWEN_VOICE`：语音音色
- `QWEN_TEXT_MODEL`：文本润色模型
- `QWEN_IMAGE_MODEL`：文生图模型
- `QWEN_ASR_MODEL`：语音转文字模型
- `QWEN_DEBUG`：调试开关（`1` 开启）
- `SYSTEM_PROMPT`：会话系统提示词

### 可选能力

- `UNSPLASH_ACCESS_KEY`：配置后 `GET /scenes/library` 优先走 Unsplash 搜图

## 预设资源规范

预设目录：`backend/assets/presets/<name>/`

```text
<name>/
├─ avatar.fbx
├─ background.png
├─ view.png                # 可选
├─ animations/*.fbx
└─ meta.json               # 可选
```

`meta.json` 可选字段：

- `display_name`: 预设展示名
- `description`: 预设描述
- `hidden`: 是否在预设列表中隐藏（`true` 表示隐藏）

## 主要接口概览

- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Presets: `GET /presets`, `GET /presets/{name}`, `GET /presets/{name}/animations`
- Pipeline:
  - `GET/POST /pipeline/text`
  - `POST /pipeline/image`
  - `POST /pipeline/preset`
  - `POST /pipeline/retry`
  - `POST /pipeline/rig`, `GET /pipeline/rig/{task_id}`
  - `POST /pipeline/polish-text`
- Scene:
  - `GET /scenes/library`
  - `POST /scenes/generate`
  - `POST /scenes/polish-text`
  - `GET /scenes/proxy-image`
- Speech: `POST /speech/transcribe`, `WS /ws/audio`
- Records:
  - `GET /models/my`, `POST /models/save`
  - `GET /history/my`, `GET /history/{session_id}`
  - `POST /recordings/upload`, `GET /recordings/my`

## 常见问题

- 语音输入不可用：确认浏览器允许麦克风权限，且页面运行在 `https` 或 `localhost`。
- 语音转写失败：检查 `DASHSCOPE_API_KEY` 和 `QWEN_ASR_MODEL`。
- 图库未返回在线图片：配置 `UNSPLASH_ACCESS_KEY`，否则会回退到本地场景。
- 前后端跨域/地址错误：确认前端 `VITE_API_BASE`（默认 `http://localhost:8788`）。

## 开发说明

- 后端静态资源通过 `/assets` 挂载，模型/背景/录屏 URL 均为相对路径。
- 默认数据库文件：`backend/interactive_avatar.db`。
- 生产前请替换 `JWT_SECRET`，并收紧 CORS 策略。

## Quick Start (English)

1. Start backend on `:8788` (`uvicorn app.main:app --reload`).
2. Start frontend on `:5178` (`npm run dev`).
3. Configure API keys in `backend/.env` for Meshy and DashScope features.
4. Open `http://localhost:5178` and run the 4-step flow.
