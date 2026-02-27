# Interactive Avatar

独立整合项目，不会修改原有 `3d_interaction_pipeline` 与 `avatar1`。

## 结构

- `frontend/`：三页面前端（Create / Assist Rig / Interact）
- `backend/`：Meshy 接口、手动辅助+blender自动绑骨+重定向实现动作交互任务、动画清单、语音 WS 桥接

## 核心流程

1. 第 1 页输入文字或上传图片，调用 Meshy 生成模型并预览
2. 第 2 页进行 Mixamo 风格点位交互（手动辅助+blender自动绑骨+重定向实现动作交互），确认后约 10 秒加载
3. 加载后直接进入 animations(FBX) 预览，确认跳转第 3 页
4. 第 3 页使用与 avatar1 对齐的交互能力（语音 + 动作状态）

## 启动

### 后端

```bash
cd backend
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8788 --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认端口 `5178`，后端默认端口 `8788`。

## 资源复用

- 动作文件来自 `avatar1/public/animations/*.fbx`
- 第 3 页动作与语音状态逻辑对齐 `avatar1`
