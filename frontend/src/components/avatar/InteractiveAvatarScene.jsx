import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AvatarView from "./AvatarView";
import GestureDetector from "./GestureDetector";
import { createVoiceWsClient } from "../../audio/voiceWsClient";
import { API_BASE } from "../../lib/config";
import { getToken } from "../../lib/auth";
import { uploadRecording } from "../../lib/api";

const USER_SPEAK_THRESHOLD = 0.14;
const USER_SPEAK_FRAMES = 10;
const USER_SPEAK_HANGOVER_MS = 350;
const AFTER_ASSISTANT_IDLE_MS = 20000;
const RX_STALE_MS = 200;
const TX_OVER_RX_RATIO = 2.8;
const TX_OVER_RX_DELTA = 0.02;
const PLAYBACK_GUARD_MS = 350;
const INTERRUPT_CONFIRM_MS = 180;
const GOODBYE_RE = /(再见|拜拜|拜了|拜啦|我走了|结束了|不聊了)/;

const WS_BASE = `${API_BASE.replace(/^http/i, "ws")}/ws/audio`;
const DEFAULT_BACKDROP = "/textures/Black.jpg";

export default function InteractiveAvatarScene({
  avatarModelUrl = "/models/avatar.fbx",
  actionBasePath = "/animations",
  modelId = null,
  backdropTexturePath = "",
}) {
  const navigate = useNavigate();
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isWaving, setIsWaving] = useState(false);
  const [assistantTalking, setAssistantTalking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [interruptSeq, setInterruptSeq] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordStatus, setRecordStatus] = useState("可开始录制展示内容（视频+麦克风+助手语音）。");

  const wavedOnceAfterConnectRef = useRef(false);
  const assistantTalkingRef = useRef(false);
  const lastPlaybackStartedAtRef = useRef(0);
  const lastUserVoiceAtRef = useRef(0);
  const assistantDoneRef = useRef(false);
  const interruptSeqRef = useRef(0);
  const txLevelRef = useRef(0);
  const rxLevelRef = useRef(0);
  const rxLevelAtRef = useRef(0);
  const userSpeakFramesRef = useRef(0);
  const userSpeakingRef = useRef(false);
  const pendingInterruptRef = useRef(false);
  const voiceClientRef = useRef(null);
  const interruptGateRef = useRef(true);
  const lastUserSpokenAtRef = useRef(0);
  const pendingGoodbyeRef = useRef(false);
  const sessionLockingRef = useRef(false);
  const waveAfterConnectRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const canvasRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStartAtRef = useRef(0);
  const recordCleanupRef = useRef(() => {});

  const activeBackdropPath = backdropTexturePath || DEFAULT_BACKDROP;

  useEffect(() => {
    sessionActiveRef.current = isSessionActive && isVoiceConnected;
  }, [isSessionActive, isVoiceConnected]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
  }, []);

  useEffect(() => {
    return () => {
      try {
        stopRecording();
      } catch {}
    };
  }, [stopRecording]);

  const endSession = useCallback(async () => {
    setIsConnecting(false);
    setIsVoiceConnected(false);
    setIsSessionActive(false);
    setIsWaving(false);
    wavedOnceAfterConnectRef.current = false;
    assistantTalkingRef.current = false;
    setAssistantTalking(false);
    assistantDoneRef.current = false;
    pendingGoodbyeRef.current = false;
    interruptGateRef.current = true;
    userSpeakFramesRef.current = 0;
    userSpeakingRef.current = false;
    pendingInterruptRef.current = false;
    lastPlaybackStartedAtRef.current = 0;
    rxLevelRef.current = 0;
    rxLevelAtRef.current = 0;
    sessionLockingRef.current = false;
    try {
      await voiceClientRef.current?.stop?.();
    } catch {}
    voiceClientRef.current = null;
    lastUserSpokenAtRef.current = 0;
    txLevelRef.current = 0;
    setUserSpeaking(false);
  }, []);

  const fireInterruptOnce = useCallback(() => {
    if (!assistantTalkingRef.current || !interruptGateRef.current) {
      return;
    }
    interruptGateRef.current = false;
    interruptSeqRef.current += 1;
    setInterruptSeq(interruptSeqRef.current);
    try {
      voiceClientRef.current?.interrupt?.();
      voiceClientRef.current?.interruptPlayback?.();
    } catch {}
  }, []);

  const connectToBackend = useCallback(async () => {
    if (isConnecting || isVoiceConnected || voiceClientRef.current) return;
    setIsConnecting(true);

    try {
      const now = Date.now();
      lastUserSpokenAtRef.current = now;
      assistantTalkingRef.current = false;
      setAssistantTalking(false);
      lastPlaybackStartedAtRef.current = 0;
      assistantDoneRef.current = false;
      pendingGoodbyeRef.current = false;
      interruptGateRef.current = true;
      txLevelRef.current = 0;
      rxLevelRef.current = 0;
      rxLevelAtRef.current = 0;
      userSpeakFramesRef.current = 0;
      userSpeakingRef.current = false;
      pendingInterruptRef.current = false;

      const client = createVoiceWsClient({
        url: `${WS_BASE}?token=${encodeURIComponent(getToken())}${modelId ? `&model_id=${modelId}` : ""}`,
        onWsClose: () => {
          endSession();
        },
        onWsError: () => {},
        onWsOpen: () => {},
        onRxLevel: (lvl) => {
          rxLevelRef.current = lvl;
          rxLevelAtRef.current = Date.now();
        },
        onTxLevel: (lvl) => {
          const nowTs = Date.now();
          txLevelRef.current = lvl;

          if (lvl >= 0.01) lastUserSpokenAtRef.current = nowTs;

          if (assistantTalkingRef.current) {
            const sinceStart = nowTs - lastPlaybackStartedAtRef.current;
            if (sinceStart >= 0 && sinceStart < PLAYBACK_GUARD_MS) return;
          }

          const rx = nowTs - rxLevelAtRef.current <= RX_STALE_MS ? rxLevelRef.current : 0;
          const echoLike = assistantTalkingRef.current && lvl < rx * TX_OVER_RX_RATIO + TX_OVER_RX_DELTA;
          const hit = lvl >= USER_SPEAK_THRESHOLD && !echoLike;

          if (hit) userSpeakFramesRef.current += 1;
          else userSpeakFramesRef.current = Math.max(0, userSpeakFramesRef.current - 1);

          const now2 = Date.now();
          if (hit) lastUserVoiceAtRef.current = now2;

          const speakingByFrames = userSpeakFramesRef.current >= USER_SPEAK_FRAMES;
          const speakingWithHangover = speakingByFrames || now2 - lastUserVoiceAtRef.current <= USER_SPEAK_HANGOVER_MS;

          userSpeakingRef.current = speakingWithHangover;
          setUserSpeaking((prev) => (prev === speakingWithHangover ? prev : speakingWithHangover));

          if (speakingWithHangover && assistantTalkingRef.current && !pendingInterruptRef.current) {
            pendingInterruptRef.current = true;
            setTimeout(() => {
              pendingInterruptRef.current = false;
              if (assistantTalkingRef.current && userSpeakingRef.current) {
                fireInterruptOnce();
              }
            }, INTERRUPT_CONFIRM_MS);
          }
        },

        onAssistantPlaybackStarted: () => {
          lastPlaybackStartedAtRef.current = Date.now();
          if (!assistantTalkingRef.current) {
            assistantTalkingRef.current = true;
            setAssistantTalking(true);
          }
          assistantDoneRef.current = false;
          interruptGateRef.current = true;
          userSpeakFramesRef.current = 0;
          userSpeakingRef.current = false;
          pendingInterruptRef.current = false;
        },

        onAssistantPlaybackEnded: () => {
          if (assistantTalkingRef.current) {
            assistantTalkingRef.current = false;
            setAssistantTalking(false);
          }
          interruptGateRef.current = true;
          userSpeakFramesRef.current = 0;
          userSpeakingRef.current = false;
          pendingInterruptRef.current = false;
        },

        onTextEvent: (msg) => {
          if (msg?.type === "user_final" && typeof msg.text === "string") {
            if (GOODBYE_RE.test(msg.text.trim())) {
              pendingGoodbyeRef.current = true;
            }
            return;
          }

          if (msg?.type === "assistant_done") {
            assistantDoneRef.current = true;
          }
        },
      });

      voiceClientRef.current = client;
      await client.start();

      setIsVoiceConnected(true);
      setIsSessionActive(true);

      requestAnimationFrame(() => {
        if (waveAfterConnectRef.current) {
          waveAfterConnectRef.current = false;
          setIsWaving(true);
        }
      });
    } catch {
      await endSession();
    } finally {
      setIsConnecting(false);
      sessionLockingRef.current = false;
    }
  }, [isConnecting, isVoiceConnected, endSession, fireInterruptOnce, modelId]);

  const handleUserGreet = useCallback(() => {
    if (isSessionActive || isConnecting || isVoiceConnected || sessionLockingRef.current) return;
    sessionLockingRef.current = true;
    waveAfterConnectRef.current = true;
    connectToBackend();
  }, [isSessionActive, isConnecting, isVoiceConnected, connectToBackend]);

  useEffect(() => {
    if (isSessionActive && isVoiceConnected && !wavedOnceAfterConnectRef.current) {
      wavedOnceAfterConnectRef.current = true;
      setIsWaving(true);
    }
  }, [isSessionActive, isVoiceConnected]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!sessionActiveRef.current) return;
      if (!assistantDoneRef.current || assistantTalkingRef.current) return;

      if (pendingGoodbyeRef.current) {
        pendingGoodbyeRef.current = false;
        endSession();
        return;
      }

      const now = Date.now();
      const userSilentMs = now - lastUserSpokenAtRef.current;
      if (userSilentMs >= AFTER_ASSISTANT_IDLE_MS) {
        endSession();
      }
    }, 200);

    return () => clearInterval(timer);
  }, [endSession]);

  async function startRecording() {
    if (recording || recordBusy) return;
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function") {
      setRecordStatus("录制失败：当前浏览器不支持画布录制。");
      return;
    }

    const client = voiceClientRef.current;
    const micStream = client?.getMicStream?.();
    const assistantStream = client?.getAssistantStream?.();
    if (!micStream || !assistantStream) {
      setRecordStatus("请先开始会话后再录制，以确保采集麦克风和助手语音。");
      return;
    }

    setRecordBusy(true);
    try {
      const videoStream = canvas.captureStream(30);
      const mixCtx = new (window.AudioContext || window.webkitAudioContext)();
      const destination = mixCtx.createMediaStreamDestination();
      const micSource = mixCtx.createMediaStreamSource(micStream);
      const assistantSource = mixCtx.createMediaStreamSource(assistantStream);
      micSource.connect(destination);
      assistantSource.connect(destination);

      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const preferType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(combined, { mimeType: preferType });
      recordChunksRef.current = [];
      recorderRef.current = recorder;
      recordStartAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecordStatus("录制发生异常，请重试。");
      };

      recorder.onstop = async () => {
        const durationMs = Date.now() - recordStartAtRef.current;
        const blob = new Blob(recordChunksRef.current, { type: preferType });
        recordChunksRef.current = [];
        setRecording(false);
        setRecordBusy(true);
        setRecordStatus("录制已结束，正在上传...");
        try {
          const file = new File([blob], `recording_${Date.now()}.webm`, { type: preferType });
          await uploadRecording({ file, modelId, durationMs });
          setRecordStatus("录制视频已保存到看板，可预览和下载。");
        } catch (error) {
          setRecordStatus(`上传失败：${error.message}`);
        } finally {
          setRecordBusy(false);
          try {
            recordCleanupRef.current();
          } catch {}
          recordCleanupRef.current = () => {};
          recorderRef.current = null;
        }
      };

      recordCleanupRef.current = () => {
        try {
          micSource.disconnect();
          assistantSource.disconnect();
        } catch {}
        try {
          combined.getTracks().forEach((track) => track.stop());
        } catch {}
        try {
          mixCtx.close();
        } catch {}
      };

      recorder.start(1000);
      setRecording(true);
      setRecordStatus("录制进行中：已采集场景视频、麦克风和助手语音。");
    } catch (error) {
      setRecordStatus(`开始录制失败：${error.message}`);
    } finally {
      setRecordBusy(false);
    }
  }

  return (
    <div className="interactive-stage">
      <div className="manual-controls">
        <button
          type="button"
          className="primary-btn"
          onClick={isSessionActive ? endSession : handleUserGreet}
          disabled={isConnecting}
        >
          {isConnecting ? "连接中..." : isSessionActive ? "结束对话" : "手动开始会话"}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={recording ? stopRecording : startRecording}
          disabled={recordBusy || (isConnecting && !recording)}
        >
          {recording ? "结束录制" : "开始录制"}
        </button>
        <button type="button" className="secondary-btn control-nav-btn" onClick={() => navigate("/scene-preview")}>
          返回场景预设
        </button>
        <button type="button" className="secondary-btn control-nav-btn" onClick={() => navigate("/create")}>
          返回形象生成
        </button>
      </div>

      <AvatarView
        isWaving={isWaving}
        setIsWaving={setIsWaving}
        isTalking={assistantTalking}
        interruptSeq={interruptSeq}
        isSessionActive={isSessionActive}
        userSpeaking={userSpeaking}
        avatarModelUrl={avatarModelUrl}
        actionBasePath={actionBasePath}
        backdropTexturePath={activeBackdropPath}
        onCanvasReady={(canvas) => {
          canvasRef.current = canvas;
        }}
      />

      <GestureDetector onGreet={handleUserGreet} onLeave={endSession} isSessionActive={isSessionActive} />
    </div>
  );
}
