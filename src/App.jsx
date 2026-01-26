import React, { useState } from "react";
import AvatarView from "./Screen/AvatarView";
import { Leva } from "leva";
import "./App.css";
import GestureDetector from "./components/GestureDetector";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import RoomDebug from "./components/RoomDebug";

// ✅ 你的 FastAPI 后端现在建议用 8787
const BACKEND_URL = "http://localhost:8787";

const App = () => {
  const [livekitToken, setLivekitToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // 传给数字人的指令（你现有逻辑保留）
  const [avatarProps, setAvatarProps] = useState({
    animation: "Idle",
    text: "",
    trigger: 0,
  });

  const connectToLiveKit = async () => {
    if (isConnecting || livekitToken) return;

    setIsConnecting(true);

    try {
      // ✅ 建议用更稳定的 roomName（避免冲突）
      const roomName = `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.log("请求后端，room:", roomName);

      // 1) 先 dispatch（让云端 Parker-9c5 进房）
      const dispatchResp = await fetch(`${BACKEND_URL}/api/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName }),
      });
      if (!dispatchResp.ok) {
        const txt = await dispatchResp.text();
        throw new Error(`Dispatch failed: ${dispatchResp.status} ${txt}`);
      }

      // 2) 再拿 token（给前端 join room 用）
      const tokenResp = await fetch(
        `${BACKEND_URL}/api/token?room=${encodeURIComponent(roomName)}&identity=${encodeURIComponent(
          "user-frontend"
        )}`
      );
      if (!tokenResp.ok) {
        const txt = await tokenResp.text();
        throw new Error(`Token failed: ${tokenResp.status} ${txt}`);
      }

      const data = await tokenResp.json();
      if (!data?.token || !data?.url) {
        throw new Error("Token response missing token/url");
      }

      // 3) 设置连接信息（LiveKitRoom 会自动 connect）
      setLivekitUrl(data.url);
      setLivekitToken(data.token);

      console.log("✅ Token 获取成功，开始连接 LiveKit:", data.url);
    } catch (err) {
      console.error("❌ 连接/请求后端失败:", err);
      // 失败回滚状态，允许重试
      setIsSessionActive(false);
      setAvatarProps((prev) => ({ ...prev, animation: "Idle" }));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUserGreet = () => {
    // 已经会话中 / 正在连接 / 已有 token：忽略
    if (isSessionActive || isConnecting || livekitToken) return;

    console.log("👋 用户挥手，开始会话！");
    setIsSessionActive(true);

    setAvatarProps((prev) => ({
      ...prev,
      animation: "Wave",
    }));

    connectToLiveKit();

    // 3 秒后回 Idle（不影响会话连接）
    setTimeout(() => {
      setAvatarProps((prev) => ({ ...prev, animation: "Idle" }));
    }, 3000);
  };

  return (
    <div
      className="app-container"
      style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}
    >
      <Leva hidden />

      <LiveKitRoom
        token={livekitToken || undefined}
        serverUrl={livekitUrl || undefined}
        connect={Boolean(livekitToken && livekitUrl)}
        video={false}
        audio={true}
        onDisconnected={() => {
          console.log("🔌 LiveKit 断开连接");
          setLivekitToken("");
          setLivekitUrl("");
          setIsSessionActive(false);
          setAvatarProps((prev) => ({ ...prev, animation: "Idle" }));
        }}
        onConnected={() => {
          console.log("✅ LiveKit 已连接");
        }}
        style={{ height: "100%" }}
      >
        {/* ✅ 必须：播放 Agent 返回的音频 */}
        <RoomAudioRenderer />

        <RoomDebug />

        {/* 你的数字人场景 */}
        <AvatarView {...avatarProps} />

        {/* 摄像头组件：会话开始后暂停识别（你原逻辑保留） */}
        <GestureDetector onGreet={handleUserGreet} isSessionActive={isSessionActive} />

      </LiveKitRoom>
    </div>
  );
};

export default App;
