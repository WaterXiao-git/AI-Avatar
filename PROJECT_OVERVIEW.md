# Interactive Avatar 项目整理

## 1. 项目概述

`Interactive Avatar` 是一个前后端分离的交互式数字人项目，核心目标是让用户通过文本、图片或预设角色快速生成一个 3D 虚拟形象，并完成后续的动作预览、场景配置和实时语音交互。

整个产品流程大致分为以下几个阶段：

1. 用户注册 / 登录。
2. 通过文本、图片或预设创建数字人形象。
3. 进入辅助打点页面，标注关键骨骼参考点。
4. 进入动作预览页面，检查角色动作表现。
5. 选择或生成展示背景场景。
6. 进入实时交互页面，通过挥手或按钮启动语音会话。
7. 查看历史模型、会话记录和录屏资源。

从代码实现看，这是一个“功能较为齐全的的产品原型”。它包含了：

- 用户系统
- 模型生成流程
- 资源预设系统
- 3D 预览和动作播放
- 手势识别
- 实时语音 WebSocket
- 会话落库与摘要
- 录屏上传与管理


## 2. 技术栈

### 2.1 前端

前端位于 `frontend/`，技术栈如下：

- `Vite`
- `React 19`
- `react-router-dom`
- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@mediapipe/tasks-vision`
- `react-webcam`
- `react-icons`

用途划分：

- React 负责页面、状态和路由。
- React Router 负责多页面流程控制。
- Three.js + React Three Fiber 负责 3D 模型渲染和动作预览。
- MediaPipe 负责手势识别和人脸存在检测。
- Web Audio / MediaRecorder 负责语音与录制。

默认前端开发端口是 `5178`。

### 2.2 后端

后端位于 `backend/`，技术栈如下：

- `FastAPI`
- `Uvicorn`
- `SQLAlchemy 2`
- `Alembic`
- `SQLite`
- `bcrypt`
- `PyJWT`
- `requests`
- `websockets`

用途划分：

- FastAPI 提供 HTTP 接口和 WebSocket 接口。
- SQLAlchemy 管理数据库模型。
- Alembic 管理数据库迁移。
- SQLite 作为默认数据库。
- bcrypt 处理密码哈希。
- PyJWT 处理登录态令牌。
- requests 用于调用 Meshy、DashScope、Unsplash。
- websockets 用于桥接 DashScope 实时语音服务。

默认后端端口是 `8788`。


## 3. 目录结构

项目根目录下主要包含：

- `frontend/`：前端代码。
- `backend/`：后端代码。
- `README.md`：项目说明。
- 其他介绍性文档：`Introduction.md`、`Introduction1.md`、`1.md`、`2.md`。

### 3.1 前端目录

`frontend/` 下的核心目录：

- `src/`
- `public/`

`src/` 进一步拆分为：

- `pages/`：页面级组件。
- `components/`：通用组件和 3D 组件。
- `components/avatar/`：数字人交互相关核心组件。
- `context/`：全局状态。
- `lib/`：API、鉴权、配置、动作映射等工具。
- `audio/`：语音 WebSocket 客户端。

`public/` 内主要是静态资源：

- `animations/*.fbx`
- `models/*.task`
- `models/avatar.fbx`
- `textures/*.jpg`
- `audios/mic-worklet.js`

### 3.2 后端目录

`backend/` 下的核心目录：

- `app/`：FastAPI 应用代码。
- `alembic/`：数据库迁移。
- `assets/`：静态资源和运行期产物。
- `requirements.txt`
- `interactive_avatar.db`

`backend/assets/` 里包含：

- `models/`：生成的 GLB 模型及占位图。
- `animations/`：默认动作文件。
- `presets/`：预设角色资源包。
- `recordings/`：用户录屏。

每个预设角色目录通常包含：

- `avatar.fbx`
- `background.png`
- 可选的 `view.png`
- `animations/*.fbx`
- 可选的 `meta.json`


## 4. 前端整体架构

### 4.1 前端入口

前端入口文件是 `frontend/src/main.jsx`。

它做了几件事：

1. 挂载 `BrowserRouter`。
2. 挂载 `AuthProvider`。
3. 挂载 `FlowProvider`。
4. 渲染根组件 `App`。

这意味着整个应用的路由状态、登录状态和流程状态都在最顶层统一管理。

### 4.2 路由结构

`frontend/src/App.jsx` 定义了所有页面路由：

- `/`：重定向到 `/intro`
- `/intro`：项目介绍页
- `/login`：登录页
- `/register`：注册页
- `/create`：形象生成页
- `/rig-preview`：辅助打点页
- `/scene-preview`：场景预览页
- `/interact`：实时交互页
- `/dashboard`：数据看板页

其中以下路由都被 `ProtectedRoute` 包裹，必须登录后才能访问：

- `/create`
- `/rig-preview`
- `/scene-preview`
- `/interact`
- `/dashboard`

### 4.3 登录态管理

`AuthContext` 负责登录状态：

- `user`
- `loading`
- `isAuthed`
- `login()`
- `register()`
- `logout()`

流程如下：

1. 应用启动时，先从 `localStorage` 读取 token。
2. 如果 token 存在，调用 `/auth/me` 校验。
3. 成功则恢复用户信息。
4. 失败则清理 token。

token 的存储方式比较简单，放在浏览器 `localStorage`，键名是 `ia_token`。

### 4.4 流程态管理

`FlowContext` 负责跨页面共享主流程中的中间数据，包括：

- `modelResult`：当前生成出的模型结果。
- `markers`：8 个打点坐标。
- `selectedAnimation`：当前选中的预览动作。
- `sourceImageUrl`：源图片或预设背景图。
- `presetName`：当前使用的预设名。
- `modelId`：数据库中的模型 ID。
- `actionMap`：动作映射。
- `sceneBackgroundUrl`：交互页背景图。

这是把“创建到交互”的多步流程串起来的关键状态层。


## 5. 前端页面流程详解

### 5.1 IntroPage

`/intro` 是落地页和流程入口页。

主要功能：

- 展示产品价值和功能说明。
- 根据登录状态显示不同 CTA：
  - 未登录：引导到注册。
  - 已登录：引导到创建页。
- 提供进入仪表盘或创建流程的快捷入口。

这个页面视觉样式比较重，包含：

- Hero 区
- 功能卡片
- 流程说明
- 底部 CTA

### 5.2 LoginPage / RegisterPage

这两个页面比较直接：

- 表单输入用户名、密码。
- 分别调用 `login()` 和 `register()`。
- 成功后跳转到 `/create`。

注册限制由后端校验：

- 用户名只允许 `4-32` 位字母、数字、下划线。
- 密码最少 6 位。

### 5.3 CreatePage

这是第一步核心页面，也是模型创建入口。

支持三种建模方式：

1. 文本生成
2. 图片生成
3. 预设角色

#### 文本生成

- 用户输入描述文本。
- 可调用“润色描述”按钮。
- 可通过浏览器 `SpeechRecognition` 使用语音输入。
- 点击后调用 `/pipeline/text`。

如果成功：

- 写入 `modelResult`
- 写入 `modelId`
- 记录 `presetName` 或清空
- 设置 `sourceImageUrl`
- 重置 markers

#### 图片生成

- 用户上传图片。
- 调用 `/pipeline/image`。
- 前端会把图片转成 Data URL 用于回显和重试。

#### 预设角色

- 页面加载时调用 `/presets` 获取预设列表。
- 用户点击某个预设时调用 `/pipeline/preset`。
- 直接返回预设的 FBX 和背景图，不经过 Meshy。

#### 重试逻辑

`lastRetry` 会保存最近一次文本或图片生成信息。

- 文本：保存 prompt。
- 图片：保存 Data URL。

之后可调用 `/pipeline/retry` 再次发起请求。

#### 预览逻辑

右侧通过 `ModelPreview` 渲染 3D 模型，默认播放 `Standing Idle.fbx`。

确认后跳转到 `/rig-preview`。

### 5.4 RigAssistPage

这是第二步，主要做“辅助打点”。

页面目标是让用户在图上标记 8 个关键点：

- chin
- groin
- wrist_left
- wrist_right
- elbow_left
- elbow_right
- knee_left
- knee_right

#### 关键能力

- `MarkerBoard` 提供点击打点。
- 支持镜像模式。
- 支持撤销当前点、重置全部点。
- 自动跳转到下一个待标记点。
- 会给出简单的点位质量提示。

#### Rig 流程

当 8 个点全部完成后：

1. 调用 `/pipeline/rig`
2. 前端轮询 `/pipeline/rig/{task_id}`
3. 等待进度完成
4. 加载动作列表 `/animations`
5. 进入动作预览阶段

#### 动作预览

完成打点后页面切换到动作预览模式：

- 左侧动作列表
- 右侧 3D 角色预览
- 点击动作可切换预览

确认后跳转到 `/scene-preview`。

### 5.5 ScenePreviewPage

这是第三步，负责背景场景选择。

#### 场景来源

支持四类来源：

1. 场景图库（本地或 Unsplash）
2. 上传背景图
3. 文本生成背景图
4. 已生成的自定义背景列表

#### 页面行为

- 初始化时调用 `/scenes/library`
- 如果配置了 `UNSPLASH_ACCESS_KEY`，优先使用 Unsplash 搜图
- 否则回退到本地背景图

#### 文本生成背景

- 支持输入背景 prompt
- 支持 prompt 润色
- 支持浏览器语音输入
- 调用 `/scenes/generate`

#### 预览

右侧用 `Canvas + Experience` 展示角色叠加背景后的效果，默认播放 `Standing Idle.fbx`。

确认后将背景 URL 写入 `FlowContext`，跳转到 `/interact`。

### 5.6 InteractPage

这是最终交互页。

主要渲染组件是 `InteractiveAvatarScene`，传入：

- 当前角色模型 URL
- 当前动作目录
- 当前模型 ID
- 当前背景图

页面支持：

- 手动按钮开始 / 结束会话
- 手动按钮开始 / 结束录制
- 挥手启动会话
- 自动在无人时结束会话

### 5.7 DashboardPage

这是数据看板页面。

主要分三块：

1. 我的模型
2. 交互历史
3. 我的录制

#### 我的模型

- 调用 `/models/my`
- 显示模型封面、来源、预设名、创建时间
- 提供下载链接

#### 交互历史

- 调用 `/history/my`
- 支持关键词、开始时间、结束时间筛选
- 支持分页
- 展示摘要、轮次、输入输出次数
- 展开后调用 `/history/{id}` 查看关键事件

#### 我的录制

- 调用 `/recordings/my`
- 展示录屏视频
- 支持下载


## 6. 前端核心组件

### 6.1 ShellLayout

统一页面框架组件，负责：

- 页面标题、副标题
- 顶部步骤导航
- 用户名展示
- 退出登录按钮

它把主流程 4 个步骤固定展示在导航中：

1. 形象生成
2. 辅助绑定
3. 场景预览
4. 交互会话

### 6.2 ProtectedRoute

负责拦截未登录访问：

- `loading` 时显示加载状态
- 未登录时跳转到 `/login`

### 6.3 ModelPreview

用于创建页的模型预览：

- 使用 `Canvas`
- 使用 `Experience`
- 默认播放 `Standing Idle.fbx`
- 支持鼠标旋转和缩放

### 6.4 MarkerBoard

这是辅助打点最关键的交互组件。

功能包括：

- 背景图显示
- 自适应图像可视区域计算
- 点击位置转换成百分比坐标
- 镜像模式支持
- 默认点位占位
- 放大镜预览
- 右键取消当前点位

它是一个典型的“图像标注 UI”实现。

### 6.5 AnimationStage

用于动作列表 + 动作预览。

行为包括：

- 预加载模型和动作文件
- 左侧展示动作按钮
- 右侧通过 `Experience` 播放当前动作

### 6.6 AvatarView

交互页主舞台组件：

- 承载 `Canvas`
- 渲染 `Experience`
- 支持全屏切换
- 将内部 canvas DOM 暴露给上层，用于录屏

### 6.7 Experience

这是 3D 场景层的中枢组件。

职责：

- 加载 / 切换背景纹理
- 把背景挂到 Three.js `scene.background`
- 渲染 `Avatar`
- 可选启用 `Environment`

它本身不做动作逻辑，动作逻辑在 `Avatar`。

### 6.8 Avatar

这是整个前端最核心的 3D 角色控制组件。

主要职责：

1. 加载角色 FBX 模型。
2. 加载 Idle / Wave / Listening / Talking 等动作 FBX。
3. 清洗动作轨道。
4. 将动作绑定到当前骨骼。
5. 在“预览模式”和“交互模式”之间切换。
6. 使用 `avatarFbxController` 控制动作状态流转。

它做了不少兼容性处理：

- 自动识别根骨骼名称。
- 移除根位移轨道，避免模型乱飘。
- 移除下半身轨道，使上半身动作可叠加。
- 在预览动画质量不够时回退到全局 idle。

### 6.9 avatarFbxController

这是动作状态机控制器。

它管理以下状态：

- `idle`
- `wave`
- `listening`
- `talking`

主要行为：

- 挥手时播放一次 Wave，再平滑回 Idle。
- 用户说话时切到 Listening。
- 助手说话时切到 Talking1/2/3，并做随机加权切换。
- 中断时切到 Listening 一次后再回 Idle。
- 会话结束后强制回 Idle。

这个控制器是角色“看起来像在互动”的关键。

### 6.10 GestureDetector

这个组件基于 MediaPipe 负责“挥手启动”。

实现逻辑：

1. 打开摄像头。
2. 加载 `gesture_recognizer.task` 和 `face_landmarker.task`。
3. 在循环中识别手势和人脸。
4. 如果检测到合规挥手动作，触发 `onGreet`。
5. 在会话中如果长时间看不到人脸或手，触发 `onLeave`。

挥手判断不是单帧，而是通过：

- 手腕横向运动方向变化次数
- Open Palm 的时间窗口
- 冷却时间

来判断是否构成“挥手”。

### 6.11 voiceWsClient

这是浏览器到后端语音流的客户端封装。

职责包括：

- 建立浏览器到后端的 WebSocket
- 获取麦克风流
- 加载 AudioWorklet
- 把麦克风浮点音频重采样到 `16k`
- 转成 `pcm16`
- 按块发送给后端
- 接收助手返回的 `pcm24` 音频
- 排队播放助手音频
- 支持中断播放和发送 interrupt 消息

这是整个实时语音链路的前端基础设施。

### 6.12 InteractiveAvatarScene

这是交互页的总控组件。

它把：

- `AvatarView`
- `GestureDetector`
- `voiceWsClient`
- 录屏逻辑

整合在一起。

核心逻辑包括：

- 建立与后端 `/ws/audio` 的连接
- 监听发送和接收音量
- 区分用户说话和助手播放，避免回声误判
- 用户插话时触发 interrupt
- 识别结束语后自动结束会话
- 助手结束且用户长时间静默后自动结束会话

此外它还支持录制：

- 画布视频
- 用户麦克风
- 助手音频

录制结束后调用 `/recordings/upload` 保存到后端。


## 7. 后端整体架构

### 7.1 后端入口

后端主入口是 `backend/app/main.py`。

它集中了：

- FastAPI 应用初始化
- 静态资源挂载
- 所有 HTTP 路由
- WebSocket 路由
- 若干内部工具函数

这是一个单文件集中式实现，优点是直观，缺点是后期扩展会变得臃肿。

### 7.2 配置管理

`backend/app/config.py` 负责读取 `.env` 并暴露配置。

主要配置项：

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `JWT_EXPIRE_HOURS`
- `MESHY_API_KEY`
- `MESHY_API_BASE_V1`
- `MESHY_API_BASE_V2`
- `DASHSCOPE_API_KEY`
- `QWEN_RT_URL`
- `QWEN_MODEL`
- `QWEN_VOICE`
- `QWEN_TEXT_MODEL`
- `QWEN_IMAGE_MODEL`
- `SYSTEM_PROMPT`
- `QWEN_DEBUG`
- `UNSPLASH_ACCESS_KEY`

同时它会确保以下目录存在：

- `assets/`
- `assets/models/`
- `assets/animations/`
- `assets/presets/`
- `assets/recordings/`

### 7.3 数据库层

`backend/app/db.py` 提供：

- `Base`
- `engine`
- `SessionLocal`
- `get_db()`

默认数据库是：

- `sqlite:///backend/interactive_avatar.db`

如果切换到其他数据库，只需要改 `DATABASE_URL`。

### 7.4 鉴权

鉴权逻辑在 `backend/app/security.py` 和 `main.py` 中共同完成。

能力包括：

- `hash_password()`
- `verify_password()`
- `create_access_token()`
- `decode_access_token()`

登录成功后会生成 JWT，payload 包含：

- `sub`：用户 ID
- `username`
- `exp`

接口鉴权依赖 `HTTPBearer`。


## 8. 后端数据库模型

数据库模型位于 `backend/app/models_db.py`。

共有 5 张核心表。

### 8.1 users

字段：

- `id`
- `username`
- `password_hash`
- `created_at`
- `last_login_at`

关系：

- 一个用户可拥有多个模型
- 多个交互会话
- 多个录屏

### 8.2 user_models

表示用户保存过的模型。

字段：

- `id`
- `user_id`
- `source_type`
- `preset_name`
- `model_url`
- `cover_url`
- `created_at`

其中 `source_type` 表示来源，例如：

- `text`
- `image`
- `preset`

### 8.3 interaction_sessions

表示一次完整交互会话。

字段：

- `id`
- `user_id`
- `model_id`
- `started_at`
- `ended_at`
- `summary_text`
- `turns`
- `input_count`
- `output_count`

### 8.4 interaction_events

表示会话中的单条交互事件。

字段：

- `id`
- `session_id`
- `role`
- `text`
- `created_at`

`role` 通常是：

- `user`
- `assistant`

### 8.5 user_recordings

表示保存下来的交互录屏。

字段：

- `id`
- `user_id`
- `model_id`
- `session_id`
- `file_url`
- `mime_type`
- `size_bytes`
- `duration_ms`
- `created_at`


## 9. Alembic 迁移

当前看到两个迁移文件：

### 9.1 初始迁移

`62da9e0b15c3_init_schema.py`

创建了：

- `users`
- `user_models`
- `interaction_sessions`
- `interaction_events`

### 9.2 录屏迁移

`8f3f4d75e5f1_add_user_recordings.py`

新增：

- `user_recordings`


## 10. 后端核心 HTTP 接口

### 10.1 鉴权接口

#### `POST /auth/register`

功能：

- 注册用户
- 校验用户名格式
- 校验密码长度
- 创建用户
- 返回 token 和 user

#### `POST /auth/login`

功能：

- 校验用户名和密码
- 更新 `last_login_at`
- 返回 token 和 user

#### `GET /auth/me`

功能：

- 返回当前登录用户信息

### 10.2 预设接口

#### `GET /presets`

功能：

- 扫描 `assets/presets/`
- 返回所有未隐藏预设

#### `GET /presets/{name}`

功能：

- 返回单个预设详情

#### `GET /presets/{name}/animations`

功能：

- 返回该预设下的动作列表

### 10.3 模型接口

#### `POST /models/save`

功能：

- 手动保存一条用户模型记录

#### `GET /models/my`

功能：

- 分页返回当前用户模型列表

### 10.4 Pipeline 接口

#### `POST /pipeline/text`

功能：

- 接收文本 prompt
- 优先尝试根据关键词映射到预设
- 否则调用 Meshy 文生 3D
- 成功后保存用户模型记录

#### `POST /pipeline/polish-text`

功能：

- 用 DashScope 文本模型润色角色描述
- 如果没配置 key，则使用本地 fallback 拼接模板

#### `POST /pipeline/image`

功能：

- 接收上传图片
- 调用 Meshy 图生 3D
- 成功后保存模型记录

#### `POST /pipeline/retry`

功能：

- 重试文本或图片生成

#### `POST /pipeline/preset`

功能：

- 直接返回预设模型
- 保存一条用户模型记录

#### `POST /pipeline/rig`

功能：

- 接收模型 URL 和 markers
- 创建一个内存中的“任务”
- 返回 task_id

#### `GET /pipeline/rig/{task_id}`

功能：

- 查询 rig 模拟任务进度
- 到时后返回完成状态

### 10.5 动作接口

#### `GET /animations`

功能：

- 返回默认动作目录下的 FBX 列表
- 如果传 `preset_name`，则返回该预设的动作列表

### 10.6 场景接口

#### `GET /scenes/library`

功能：

- 如果配置了 `UNSPLASH_ACCESS_KEY`，调用 Unsplash 搜索图片
- 否则回退到本地背景图库

#### `POST /scenes/generate`

功能：

- 调用 DashScope 文生图接口
- 返回背景图 URL

#### `GET /scenes/proxy-image`

功能：

- 服务端代理远程图片
- 避免前端跨域直接加载外站图

#### `POST /scenes/polish-text`

功能：

- 润色背景图 prompt

### 10.7 历史接口

#### `GET /history/my`

功能：

- 分页查询当前用户历史会话
- 支持：
  - `q`
  - `start`
  - `end`

搜索会匹配：

- `summary_text`
- 会话中的 `InteractionEvent.text`

#### `GET /history/{session_id}`

功能：

- 返回某次会话详情和事件列表

### 10.8 录屏接口

#### `POST /recordings/upload`

功能：

- 接收视频文件
- 保存到 `assets/recordings/`
- 写入 `user_recordings`

#### `GET /recordings/my`

功能：

- 分页返回当前用户录屏

### 10.9 健康检查

#### `GET /health`

返回：

- `{ "status": "ok" }`


## 11. Meshy 集成

`backend/app/meshy.py` 封装了对 Meshy 的调用。

支持两种生成方式：

- `text_to_model(prompt)`
- `image_to_model(image_path)`

内部逻辑：

1. 调用 Meshy 创建任务。
2. 轮询任务状态。
3. 成功后拿到 `glb` 下载地址。
4. 下载 GLB 到 `backend/assets/models/`。
5. 返回本地文件路径。

实现细节：

- 内置 requests 重试机制。
- 对 SSL、网络异常做了归一化错误处理。
- 文生使用 `v2/text-to-3d`。
- 图生使用 `v1/image-to-3d`。


## 12. DashScope / Qwen 集成

这个项目中 DashScope 被用在三个地方。

### 12.1 实时语音交互

后端 `/ws/audio` 会：

1. 接收前端 WebSocket 连接。
2. 校验 query 中的 token。
3. 新建一条 `InteractionSession`。
4. 再连接 DashScope 实时语音 WebSocket。
5. 将浏览器传来的 PCM 音频转成 DashScope 所需事件。
6. 将 DashScope 返回的音频增量、转写结果转发给浏览器。
7. 将用户转写和助手文本写入数据库。
8. 结束时生成摘要并补全 session 数据。

这相当于做了一个“浏览器 <-> 本项目后端 <-> DashScope Realtime”的桥接层。

### 12.2 文本润色

用于：

- 角色 prompt 润色
- 场景 prompt 润色

如果没有配置 `DASHSCOPE_API_KEY`，会使用本地 fallback 模板。

### 12.3 文生图

`/scenes/generate` 会调用 DashScope 的文生图模型生成背景图。

实现里也考虑了：

- 同步返回
- 异步任务轮询


## 13. 实时语音交互链路

这是项目最复杂的一条链路。

### 13.1 前端采集

前端 `voiceWsClient`：

1. 打开浏览器麦克风。
2. 用 AudioWorklet 获取音频块。
3. 重采样到 `16kHz`。
4. 转成 `Int16 PCM`。
5. 分块发送给后端。

### 13.2 后端桥接

后端 `/ws/audio`：

1. 接收 PCM 二进制。
2. Base64 编码。
3. 组装为 DashScope 事件 `input_audio_buffer.append`。
4. 发给 DashScope。

### 13.3 后端回传

当 DashScope 返回：

- `response.audio.delta`：后端解码为 PCM 并转发给前端。
- 用户转写完成事件：保存为 `InteractionEvent(role="user")`。
- 助手转写完成事件：保存为 `InteractionEvent(role="assistant")`。
- `response.done`：通知前端助手本轮完成。

### 13.4 前端播放与动画

前端收到助手音频后：

- 放入播放队列
- 播放期间标记 `assistantTalking = true`
- 角色切换为 Talking 动作

前端会根据音量和时序判断：

- 用户是否在说话
- 当前声音是否可能是回声
- 是否应触发打断

这部分实现相对细致，不是简单的“按按钮播放音频”。


## 14. 手势检测链路

手势检测是交互体验的重要入口。

### 14.1 启动条件

在未进入会话时，摄像头会持续打开，MediaPipe 持续检测：

- 手势
- 手部关键点

### 14.2 挥手识别逻辑

系统并不是只看 “Open Palm”。

它还会结合：

- 手腕 X 坐标变化速度
- 左右方向反转次数
- Open Palm 时间窗口
- 手位置是否在画面中央
- 手是否举得足够高

当方向反转累计到一定次数，并满足条件时，才认为是“挥手”。

### 14.3 会话中离场检测

进入会话后，会转而重点判断“人是否还在”。

使用：

- 人脸检测
- 手部检测

如果长时间都没检测到，会触发离场逻辑，结束会话。


## 15. 录屏链路

交互页支持录制完整展示过程。

录制内容包含：

- Canvas 视频流
- 用户麦克风音频
- 助手播放音频

实现方式：

1. 对 Three.js canvas 调用 `captureStream(30)` 取视频流。
2. 建立新的 `AudioContext`。
3. 将麦克风流和助手音频流都接入 `MediaStreamDestination`。
4. 合并视频轨道和音频轨道。
5. 用 `MediaRecorder` 录制 WebM。
6. 停止后构造 `File` 上传到 `/recordings/upload`。

这不是简单录屏，而是做了音视频混流。


## 16. 资源系统

### 16.1 默认动作资源

默认动作位于：

- `backend/assets/animations/`
- `frontend/public/animations/`

常见动作包括：

- `Standing Idle.fbx`
- `Waving.fbx`
- `Listening.fbx`
- `Talking1.fbx`
- `Talking2.fbx`
- `Talking3.fbx`
- 其他动作如 `Salute`、`Opening` 等

### 16.2 预设资源

预设位于 `backend/assets/presets/`。

当前可见目录包括：

- `female`
- `male`
- `man`
- `women`
- `worker`
- `doctor`
- `mummy`
- `sammy`

每个预设有自己的：

- 模型
- 背景
- 预览图
- 动作集

### 16.3 运行期生成资源

运行时产生的资源主要包括：

- `assets/models/*.glb`
- `assets/models/upload_cover_*`
- `assets/recordings/*.webm`


## 17. 已实现的产品能力总结

从当前代码看，这个项目已经完整覆盖了以下功能：

- 用户注册 / 登录
- JWT 鉴权
- 预设角色选择
- 文本生成角色（依赖 Meshy）
- 图片生成角色（依赖 Meshy）
- prompt 润色（依赖 DashScope，可 fallback）
- 3D 模型预览
- 辅助打点
- 自动绑骨
- 动作预览
- 场景库选择（Unsplash / 本地）
- 背景图上传
- 文生背景图（DashScope）
- 挥手启动
- 实时语音会话
- 会话中断
- 会话自动结束
- 会话历史记录
- 会话摘要
- 录屏保存与回看

对一个原型项目来说，功能闭环已经比较完整。


## 18. 总结

`Interactive Avatar` 当前已经是一个功能闭环比较完整的交互式数字人原型：

- 前端流程完整
- 后端接口齐全
- 状态管理清晰
- 资源体系成型
- 语音、手势、录屏这些高交互能力都已接入

从工程形态看，它的特点是：

- 业务逻辑集中，便于快速开发
- 以真实 API 联调为主，而非纯静态演示
- 重点在“用户体验链路打通”
