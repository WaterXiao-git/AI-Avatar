# 灵山导览 · AI 数字人导览系统

按参考图一比一复刻的「灵山导览」数字人导览页面，含 3D 数字人（魔珐星云）、DeepSeek 大模型对话、百度地图、游览路线推荐。

## 技术栈

- 前端：Vue 3 + Vite 5（JavaScript）
- 数字人：魔珐星云 Lite SDK（3D 实时数字人，口型/表情/动作全自动）+ 静态立绘兜底
- AI 对话：DeepSeek（SSE 流式）
- 语音兜底：Edge-TTS（受网络环境影响，见下）
- 地图：百度地图 JS API GL

## 快速启动

### 后端（端口 8000）

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
# 复制 .env.example 为 .env 并填入 DEEPSEEK_API_KEY / BAIDU_MAP_AK
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

### 前端（端口 5173）

```bash
cd frontend
npm install
# .env 已含魔珐星云 appId/appSecret（VITE_XMOV_*）
npm run dev
```

打开 http://localhost:5173

## 凭证配置

| 文件 | 变量 | 说明 |
|---|---|---|
| `backend/.env` | `DEEPSEEK_API_KEY` | DeepSeek 密钥 |
| `backend/.env` | `BAIDU_MAP_AK` | 百度地图 AK |
| `frontend/.env` | `VITE_XMOV_APP_ID` / `VITE_XMOV_APP_SECRET` | 魔珐星云驱动应用凭证 |

`.env` 已被 `.gitignore` 忽略，不会提交。

## 架构说明

```
用户提问 → 前端 ChatPanel → POST /api/chat (SSE 流式)
        → DeepSeek 回答文本
        → 魔珐星云 avatar.speak()：语音+口型+表情+动作全自动
        → 魔珐星云不可用时：立绘兜底 + Edge-TTS 语音
```

## 已知问题

- **Edge-TTS 403**：微软语音服务会对部分出口 IP 风控（`WSServerHandshakeError: 403`）。
  仅在「魔珐星云不可用 + 需要语音」的兜底路径使用，不影响主流程。比赛现场网络通常可用；
  若不可用，可改接火山引擎/讯飞 TTS（改 `backend/app/services/tts_service.py`）。
- **百度地图**：需 AK 有效且该 AK 已开通 WebGL 服务；无 AK 时地图区域显示占位文案。
- **魔珐星云**：免费版实时驱动 3 路并发，空闲 300s 自动断开省积分；商用需向魔珐科技申请书面授权。

## 占位素材

`frontend/public/model/` 下的 `avatar.svg` 和 `route-*.svg` 是占位图（路线配图、立绘兜底），
后续可替换为真实图片（同名 PNG/JPG 改引用即可）。
