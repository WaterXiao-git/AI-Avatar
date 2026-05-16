/* eslint-disable no-empty */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useNavigate } from "react-router-dom";
import AvatarView from "./AvatarView";
import GestureDetector from "./GestureDetector";
import VoiceSilenceWatcher from "./VoiceSilenceWatcher";
import { createVoiceWsClient } from "../../audio/voiceWsClient";
import { createTextVoiceWsClient } from "../../audio/textVoiceWsClient";
import { API_BASE } from "../../lib/config";
import { getToken } from "../../lib/auth";
import { sendMultimodalChat, streamDocumentRead, uploadRecording } from "../../lib/api";
import { useAssistantSpeechPlayer } from "../../hooks/useAssistantSpeechPlayer";
import { useSessionMachine } from "../../hooks/useSessionMachine";

const USER_SPEAK_THRESHOLD = 0.14;
const USER_SPEAK_FRAMES = 10;
const USER_SPEAK_HANGOVER_MS = 350;
const AFTER_ASSISTANT_IDLE_MS = 20000;
const RX_STALE_MS = 200;
const TX_OVER_RX_RATIO = 2.8;
const TX_OVER_RX_DELTA = 0.02;
const PLAYBACK_GUARD_MS = 350;
const INTERRUPT_CONFIRM_MS = 180;
const GOODBYE_RE = /(?:bye|goodbye|exit|end session|结束会话|结束对话|退出会话|退出对话|再见|拜拜|结束吧|关闭会话)/i;
const DOCUMENT_READ_RE =
  /(?:阅读|朗读|帮我读|读一下|念一下|读这份文件|阅读这份文件|read aloud|read this file|read the file)/i;
const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHAT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const CHAT_DOC_ACCEPT = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const WS_BASE = `${API_BASE.replace(/^http/i, "ws")}/ws/audio`;
const WS_TEXT_BASE = `${API_BASE.replace(/^http/i, "ws")}/ws/text-audio`;
const DEFAULT_BACKDROP = "/textures/Black.jpg";

export default function InteractiveAvatarScene({
  avatarModelUrl = "/models/avatar.fbx",
  actionBasePath = "/animations",
  modelId = null,
  backdropTexturePath = "",
  avatarPosition = [0, -1.6, 0],
  avatarRotationY = 0,
  cameraPosition = [0, 0, 10],
  cameraFov = 20,
  ambientIntensity = 1.25,
  directionalIntensity = 1.35,
  directionalPosition = [5, 15, 5],
  presetName = "",
}) {
  const navigate = useNavigate();
  const {
    isConnecting,
    isSessionActive,
    isVoiceConnected,
    setIsVoiceConnected,
    markConnecting,
    markActive,
    markEnding,
    markIdle,
  } = useSessionMachine();
  const [isWaving, setIsWaving] = useState(false);
  const [assistantTalking, setAssistantTalking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [interruptSeq, setInterruptSeq] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatFiles, setChatFiles] = useState([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatReading, setChatReading] = useState(false);
  const [chatMode, setChatMode] = useState("chat");
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatStatus, setChatStatus] = useState(
    "支持文本与附件交互，可上传 jpg/png/webp/pdf/txt/docx；切换到“实时文字”后，会复用实时数字人会话，只是把说话改成打字输入。",
  );
  const [chatSessionId, setChatSessionId] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [attachmentAudioTalking, setAttachmentAudioTalking] = useState(false);

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
  const sessionEndingRef = useRef(false);
  const waveAfterConnectRef = useRef(false);
  const introWavePendingRef = useRef(false);
  const introWaveStartedRef = useRef(false);
  const introWaveFallbackTimerRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const canvasRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStartAtRef = useRef(0);
  const recordCleanupRef = useRef(() => {});
  const chatAudioQueueRef = useRef([]);
  const chatAudioQueueRunningRef = useRef(false);
  const chatPlaybackTokenRef = useRef(0);
  const chatReadAbortRef = useRef(null);
  const realtimeTextDraftRef = useRef("");
  const textConnectPromiseRef = useRef(null);
  const realtimeTextTalkingReleaseRef = useRef(null);
  const stopAssistantSpeechRef = useRef(null);

  const activeBackdropPath = backdropTexturePath || DEFAULT_BACKDROP;

  function inferVoiceHint() {
    const name = String(presetName || "").toLowerCase();
    if (!name) return "";
    if (/(^|_|\b)(male|man|boy|men)(_|\b)/i.test(name)) return "male";
    if (/(^|_|\b)(female|woman|women|girl)(_|\b)/i.test(name)) return "female";
    return "";
  }

  const voiceHint = inferVoiceHint();
  const {
    play: playAssistantSpeech,
    playAudioUrl: playAssistantSpeechAudioUrl,
    stop: stopAssistantSpeech,
  } = useAssistantSpeechPlayer({
    onStart: () => {
      setAttachmentAudioTalking(true);
      setChatStatus("数字人回复已生成，正在播放服务端语音。");
    },
    onEnd: () => {
      setAttachmentAudioTalking(false);
    },
    onError: (error) => {
      setAttachmentAudioTalking(false);
      setChatStatus(`数字人播报失败：${error.message}`);
    },
  });

  useEffect(() => {
    stopAssistantSpeechRef.current = stopAssistantSpeech;
  }, [stopAssistantSpeech]);

  function replaceLastPendingAssistant(nextItem) {
    setChatHistory((prev) => {
      const index = [...prev].reverse().findIndex((item) => item.role === "assistant" && item.pending);
      if (index === -1) return [...prev, nextItem];
      const actualIndex = prev.length - 1 - index;
      return prev.map((item, idx) => (idx === actualIndex ? nextItem : item));
    });
  }

  function resolveDocumentReadMode(text, files) {
    const trimmed = String(text || "").trim();
    const docFiles = files.filter((file) => CHAT_DOC_ACCEPT.has(file.type));
    const requested = DOCUMENT_READ_RE.test(trimmed);

    if (!requested) {
      return { enabled: false, requested: false, reason: "" };
    }
    if (docFiles.length !== 1 || files.length !== 1) {
      return {
        enabled: false,
        requested: true,
        reason: "文档朗读第一版仅支持一次上传一个 txt/pdf/docx 文件。",
      };
    }
    return { enabled: true, requested: true, file: docFiles[0], reason: "" };
  }

  function resetAttachmentPlaybackQueue() {
    chatPlaybackTokenRef.current += 1;
    chatAudioQueueRef.current = [];
    chatAudioQueueRunningRef.current = false;
    stopAssistantSpeech();
  }

  async function processAttachmentPlaybackQueue(token) {
    if (chatAudioQueueRunningRef.current) return;
    chatAudioQueueRunningRef.current = true;

    try {
      while (token === chatPlaybackTokenRef.current && chatAudioQueueRef.current.length) {
        const item = chatAudioQueueRef.current.shift();
        if (!item) continue;

        if (!item.audioUrl) {
          setChatStatus(item.errorMessage || "当前段落的服务端音频不可用，已跳过播放。");
          continue;
        }

        try {
          await playAssistantSpeechAudioUrl({
            audioUrl: item.audioUrl,
            spokenText: item.text || "",
            errorMessage: item.errorMessage || "当前段落服务端音频播放失败",
          });
        } catch {}
      }
    } finally {
      if (token === chatPlaybackTokenRef.current) {
        chatAudioQueueRunningRef.current = false;
      }
    }
  }

  function enqueueAttachmentPlayback(item) {
    if (!item?.audioUrl) return;
    const token = chatPlaybackTokenRef.current;
    chatAudioQueueRef.current.push(item);
    void processAttachmentPlaybackQueue(token);
  }

  const clearRealtimeTextTalkingRelease = useCallback(() => {
    if (realtimeTextTalkingReleaseRef.current) {
      window.clearTimeout(realtimeTextTalkingReleaseRef.current);
      realtimeTextTalkingReleaseRef.current = null;
    }
  }, []);

  const clearIntroWaveFallbackTimer = useCallback(() => {
    if (introWaveFallbackTimerRef.current) {
      window.clearTimeout(introWaveFallbackTimerRef.current);
      introWaveFallbackTimerRef.current = null;
    }
  }, []);

  const releaseIntroWaveGate = useCallback(() => {
    if (!introWavePendingRef.current) return;
    introWavePendingRef.current = false;
    introWaveStartedRef.current = false;
    clearIntroWaveFallbackTimer();
    voiceClientRef.current?.setTxEnabled?.(true);
    setChatStatus("招手问候已完成，现在可以开始说话，数字人将进入倾听状态。");
  }, [clearIntroWaveFallbackTimer]);

  const endSession = useCallback(async () => {
    if (sessionEndingRef.current) return;
    sessionEndingRef.current = true;
    markEnding();
    setIsVoiceConnected(false);
    setIsWaving(false);
    wavedOnceAfterConnectRef.current = false;
    introWavePendingRef.current = false;
    introWaveStartedRef.current = false;
    clearIntroWaveFallbackTimer();
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
    clearRealtimeTextTalkingRelease();
    stopAssistantSpeech();
    setChatSending(false);
    markIdle();
    sessionEndingRef.current = false;
  }, [clearIntroWaveFallbackTimer, clearRealtimeTextTalkingRelease, markEnding, markIdle, setIsVoiceConnected, stopAssistantSpeech]);

  const markRealtimeTextTalking = useCallback(() => {
    clearRealtimeTextTalkingRelease();
    lastPlaybackStartedAtRef.current = Date.now();
    if (!assistantTalkingRef.current) {
      assistantTalkingRef.current = true;
      setAssistantTalking(true);
    }
    assistantDoneRef.current = false;
  }, [clearRealtimeTextTalkingRelease]);

  const releaseRealtimeTextTalking = useCallback(
    (delayMs = 720) => {
      clearRealtimeTextTalkingRelease();
      realtimeTextTalkingReleaseRef.current = window.setTimeout(() => {
        realtimeTextTalkingReleaseRef.current = null;
        if (assistantTalkingRef.current) {
          assistantTalkingRef.current = false;
          setAssistantTalking(false);
        }
        if (assistantDoneRef.current && pendingGoodbyeRef.current) {
          pendingGoodbyeRef.current = false;
          endSession();
        }
      }, delayMs);
    },
    [clearRealtimeTextTalkingRelease, endSession],
  );

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
      clearIntroWaveFallbackTimer();
      clearRealtimeTextTalkingRelease();
      try {
        stopRecording();
      } catch {}
      try {
        chatReadAbortRef.current?.abort?.();
      } catch {}
      try {
        resetAttachmentPlaybackQueue();
      } catch {}
      try {
        stopAssistantSpeechRef.current?.();
      } catch {}
    };
  }, [clearIntroWaveFallbackTimer, clearRealtimeTextTalkingRelease, stopRecording]);

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

  const triggerQueuedIntroWave = useCallback(() => {
    if (!waveAfterConnectRef.current) return;
    waveAfterConnectRef.current = false;
    introWaveStartedRef.current = true;
    wavedOnceAfterConnectRef.current = true;
    setIsWaving(true);
    clearIntroWaveFallbackTimer();
    introWaveFallbackTimerRef.current = window.setTimeout(() => {
      releaseIntroWaveGate();
    }, 3200);
  }, [clearIntroWaveFallbackTimer, releaseIntroWaveGate]);

  const handleRealtimeTextEvent = useCallback(
    (msg, { textMode = false } = {}) => {
      if (msg?.type === "debug" && textMode) {
        return;
      }

      if (msg?.type === "error" && textMode) {
        const message = String(msg.message || "").trim() || "实时文字链路失败";
        realtimeTextDraftRef.current = "";
        setChatSending(false);
        replaceLastPendingAssistant({
          role: "assistant",
          text: `当前实时文字回复失败：${message}`,
          files: [],
        });
        setChatStatus(message);
        return;
      }

      if (msg?.type === "user_final" && typeof msg.text === "string") {
        if (GOODBYE_RE.test(msg.text.trim())) {
          pendingGoodbyeRef.current = true;
        }
        setChatHistory((prev) => [...prev, { role: "user", text: msg.text, files: [] }].slice(-12));
        return;
      }

      if (msg?.type === "assistant_text_delta" && typeof msg.text === "string" && textMode) {
        realtimeTextDraftRef.current = `${realtimeTextDraftRef.current}${msg.text}`;
        replaceLastPendingAssistant({
          role: "assistant",
          text: realtimeTextDraftRef.current.trim() || "数字人正在组织回复...",
          files: [],
          pending: true,
        });
        return;
      }

      if (msg?.type === "assistant_text_final" && typeof msg.text === "string") {
        const finalText = textMode ? realtimeTextDraftRef.current.trim() || msg.text : msg.text;
        realtimeTextDraftRef.current = "";
        if (textMode) {
          replaceLastPendingAssistant({ role: "assistant", text: finalText, files: [] });
        } else {
          setChatHistory((prev) => [...prev, { role: "assistant", text: finalText, files: [] }].slice(-12));
        }
        return;
      }

      if (msg?.type === "assistant_done") {
        assistantDoneRef.current = true;
        if (textMode) {
          realtimeTextDraftRef.current = "";
          setChatSending(false);
          setChatStatus("实时文字回复完成，等待你的下一轮输入。");
        } else {
          setChatStatus("实时语音回复完成，等待用户下一轮输入。");
        }
        if (!assistantTalkingRef.current && pendingGoodbyeRef.current) {
          pendingGoodbyeRef.current = false;
          endSession();
        }
      }
    },
    [endSession],
  );

  const connectToBackend = useCallback(async () => {
    if (isConnecting || isVoiceConnected || voiceClientRef.current) return;
    markConnecting();

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
        url:
          `${WS_BASE}?token=${encodeURIComponent(getToken())}` +
          `${modelId ? `&model_id=${modelId}` : ""}` +
          `${voiceHint ? `&voice_hint=${encodeURIComponent(voiceHint)}` : ""}`,
        onWsClose: (event) => {
          if (voiceClientRef.current !== client) return;
          const code = event?.code ? `（code ${event.code}）` : "";
          const reason = event?.reason ? `，原因：${event.reason}` : "";
          setChatStatus(`实时语音会话已结束${code}${reason || "。"}`);
          endSession();
        },
        onWsError: (error) => {
          if (voiceClientRef.current !== client) return;
          const stage = error?.stage ? `[${error.stage}] ` : "";
          setChatStatus(`实时语音连接失败：${stage}${error?.message || "未知错误"}`);
        },
        onWsOpen: () => {
          if (voiceClientRef.current !== client) return;
          setChatStatus("实时语音会话已连接，可直接说话互动。");
        },
        onRxLevel: (lvl) => {
          if (voiceClientRef.current !== client) return;
          rxLevelRef.current = lvl;
          rxLevelAtRef.current = Date.now();
        },
        onTxLevel: (lvl) => {
          if (voiceClientRef.current !== client) return;
          if (introWavePendingRef.current) {
            userSpeakFramesRef.current = 0;
            userSpeakingRef.current = false;
            setUserSpeaking(false);
            return;
          }
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
        },

        onAssistantPlaybackStarted: () => {
          if (voiceClientRef.current !== client) return;
          voiceClientRef.current?.setTxEnabled?.(false);
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
          if (voiceClientRef.current !== client) return;
          voiceClientRef.current?.setTxEnabled?.(true);
          if (assistantTalkingRef.current) {
            assistantTalkingRef.current = false;
            setAssistantTalking(false);
          }
          interruptGateRef.current = true;
          userSpeakFramesRef.current = 0;
          userSpeakingRef.current = false;
          pendingInterruptRef.current = false;
          if (assistantDoneRef.current && pendingGoodbyeRef.current) {
            pendingGoodbyeRef.current = false;
            endSession();
          }
        },

        onTextEvent: (msg) => {
          if (voiceClientRef.current !== client) return;
          handleRealtimeTextEvent(msg);
        },
      });

      voiceClientRef.current = client;
      await client.start();
      client.setTxEnabled?.(false);

      setIsVoiceConnected(true);
      markActive();

      requestAnimationFrame(() => {
        triggerQueuedIntroWave();
      });
    } catch (error) {
      const stage = error?.stage ? `[${error.stage}] ` : "";
      setChatStatus(`实时语音启动失败：${stage}${error?.message || "未知错误"}`);
      await endSession();
    } finally {
      sessionLockingRef.current = false;
    }
  }, [handleRealtimeTextEvent, isConnecting, isVoiceConnected, endSession, markActive, markConnecting, modelId, setIsVoiceConnected, triggerQueuedIntroWave, voiceHint]);

  const connectTextBackend = useCallback(async () => {
    if (textConnectPromiseRef.current) {
      return textConnectPromiseRef.current;
    }
    if (voiceClientRef.current?.sendUserText) {
      return voiceClientRef.current;
    }
    if (isConnecting) {
      return null;
    }
    if (isVoiceConnected || voiceClientRef.current) {
      await endSession();
    }
    markConnecting();

    const connectPromise = (async () => {
      try {
        assistantTalkingRef.current = false;
        setAssistantTalking(false);
        lastPlaybackStartedAtRef.current = 0;
        assistantDoneRef.current = false;
        pendingGoodbyeRef.current = false;
        interruptGateRef.current = true;
        userSpeakFramesRef.current = 0;
        userSpeakingRef.current = false;
        pendingInterruptRef.current = false;
        setUserSpeaking(false);
        txLevelRef.current = 0;
        rxLevelRef.current = 0;
        rxLevelAtRef.current = 0;
        realtimeTextDraftRef.current = "";

        const client = createTextVoiceWsClient({
          url:
            `${WS_TEXT_BASE}?token=${encodeURIComponent(getToken())}` +
            `${modelId ? `&model_id=${modelId}` : ""}` +
          `${voiceHint ? `&voice_hint=${encodeURIComponent(voiceHint)}` : ""}`,
          onWsClose: (event) => {
            if (voiceClientRef.current !== client) return;
            const code = event?.code ? `（code ${event.code}）` : "";
            const reason = event?.reason ? `，原因：${event.reason}` : "";
            setChatStatus(`实时文字会话已结束${code}${reason || "。"}`);
            endSession();
          },
          onWsError: (error) => {
            if (voiceClientRef.current !== client) return;
            const stage = error?.stage ? `[${error.stage}] ` : "";
            setChatStatus(`实时文字连接失败：${stage}${error?.message || "未知错误"}`);
          },
          onWsOpen: () => {
            if (voiceClientRef.current !== client) return;
            setChatStatus("实时文字会话已连接，输入文字即可让数字人实时回复。");
          },
          onAssistantAudioIn: () => {
            if (voiceClientRef.current !== client) return;
            markRealtimeTextTalking();
          },
          onAssistantPlaybackStarted: () => {
            if (voiceClientRef.current !== client) return;
            markRealtimeTextTalking();
          },
          onAssistantPlaybackEnded: () => {
            if (voiceClientRef.current !== client) return;
            releaseRealtimeTextTalking();
          },
          onTextEvent: (msg) => {
            if (voiceClientRef.current !== client) return;
            handleRealtimeTextEvent(msg, { textMode: true });
          },
        });

        voiceClientRef.current = client;
        await client.start();

        setIsVoiceConnected(true);
        markActive();
        requestAnimationFrame(() => {
          triggerQueuedIntroWave();
        });
        return client;
      } catch (error) {
        const stage = error?.stage ? `[${error.stage}] ` : "";
        setChatStatus(`实时文字启动失败：${stage}${error?.message || "未知错误"}`);
        await endSession();
        return null;
      } finally {
        textConnectPromiseRef.current = null;
        sessionLockingRef.current = false;
      }
    })();

    textConnectPromiseRef.current = connectPromise;
    return connectPromise;
  }, [handleRealtimeTextEvent, isConnecting, isVoiceConnected, endSession, markActive, markConnecting, markRealtimeTextTalking, modelId, releaseRealtimeTextTalking, setIsVoiceConnected, triggerQueuedIntroWave, voiceHint]);

  const handleUserGreet = useCallback(() => {
    if (isSessionActive || isConnecting || isVoiceConnected || sessionLockingRef.current) return;
    sessionLockingRef.current = true;
    waveAfterConnectRef.current = true;
    introWaveStartedRef.current = false;
    introWavePendingRef.current = true;
    connectToBackend();
  }, [isSessionActive, isConnecting, isVoiceConnected, connectToBackend]);

  useEffect(() => {
    if (
      introWavePendingRef.current &&
      introWaveStartedRef.current &&
      isVoiceConnected &&
      !isWaving
    ) {
      releaseIntroWaveGate();
    }
  }, [isWaving, isVoiceConnected, releaseIntroWaveGate]);

  async function startVoiceRecordingLegacy() {
    if (recording || recordBusy) return;
    if (chatMode === "realtimeText") {
      setChatStatus("Recording is only available in realtime voice mode.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function") {
      setChatStatus("Canvas is not ready for recording yet.");
      return;
    }

    const client = voiceClientRef.current;
    const micStream = client?.getMicStream?.();
    const assistantStream = client?.getAssistantStream?.();
    if (!micStream || !assistantStream || !isSessionActive || !isVoiceConnected) {
      setChatStatus("Please start a realtime voice session before recording.");
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
        setRecording(false);
        setRecordBusy(false);
        setChatStatus("Recording failed. Please try again.");
      };

      recorder.onstop = async () => {
        const durationMs = Date.now() - recordStartAtRef.current;
        const chunkCount = recordChunksRef.current.length;
        const blob = new Blob(recordChunksRef.current, { type: preferType });
        recordChunksRef.current = [];
        setRecording(false);
        setRecordBusy(true);
        try {
          const file = new File([blob], `recording_${Date.now()}.webm`, { type: preferType });
          await uploadRecording({ file, modelId, durationMs });
          setChatStatus("Recording saved successfully.");
        } catch {
          setChatStatus("Recording upload failed. Please try again.");
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
      setChatStatus("Recording in progress. Click stop to save.");
    } catch {
      setRecording(false);
      setRecordBusy(false);
      setChatStatus("Failed to start recording. Please try again.");
    } finally {
      setRecordBusy(false);
    }
  }

  function handlePickChatFiles(event) {
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;

    const next = [];
    for (const file of picked) {
      if (!CHAT_ACCEPT.includes(file.type)) {
        setChatStatus(`不支持的文件类型：${file.name}`);
        continue;
      }
      if (file.size > CHAT_MAX_FILE_SIZE) {
        setChatStatus(`文件过大：${file.name}，请控制在10MB以内。`);
        continue;
      }
      next.push(file);
    }

    if (next.length) {
      setChatFiles((prev) => [...prev, ...next].slice(0, 6));
      setChatStatus("附件已添加，可直接发送给数字人。");
    }
    event.target.value = "";
  }

  function removeChatFile(index) {
    setChatFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleChatModeChange(nextMode) {
    if (nextMode === chatMode) return;
    if (chatReading) {
      stopDocumentRead();
    }
    if (isSessionActive || isVoiceConnected || voiceClientRef.current) {
      await endSession();
    }
    setChatMode(nextMode);
    if (nextMode === "realtimeText") {
      setChatFiles([]);
    }
    setChatStatus(
      nextMode === "realtimeText"
        ? "实时文字模式已开启。现在会复用实时数字人会话，只是把用户说话改成了文字输入。"
        : "支持文本与附件交互，可上传 jpg/png/webp/pdf/txt/docx；输入“请帮我阅读这份文件里的内容”可分段朗读文档。",
    );
  }

  function stopDocumentRead() {
    try {
      chatReadAbortRef.current?.abort?.();
    } catch {}
    chatReadAbortRef.current = null;
    resetAttachmentPlaybackQueue();
    setChatReading(false);
    setChatSending(false);
    setChatStatus("已停止文档朗读。");
  }

  async function sendDocumentReadMessage({ text, files }) {
    const controller = new AbortController();
    let combinedAnswer = "";
    let streamFailed = false;

    chatReadAbortRef.current = controller;
    setChatSending(true);
    setChatReading(true);
    setChatExpanded(true);
    setChatStatus("正在解析文档并准备分段朗读...");
    stopAssistantSpeech();
    resetAttachmentPlaybackQueue();
    setChatHistory((prev) => [
      ...prev,
      {
        role: "user",
        text: text || "(attachments only)",
        files: files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        })),
      },
      {
        role: "assistant",
        text: "数字人正在解析文档并生成朗读内容，请稍候...",
        files: [],
        pending: true,
      },
    ]);
    setChatText("");
    setChatFiles([]);

    try {
      await streamDocumentRead({
        text,
        files,
        modelId: modelId || null,
        sessionId: chatSessionId || null,
        voiceHint,
        signal: controller.signal,
        onEvent: (event) => {
          if (!event || typeof event !== "object") return;

          if (event.type === "session" && event.session_id) {
            setChatSessionId(event.session_id);
            return;
          }

          if (event.type === "progress") {
            setChatStatus(event.message || "正在处理文档朗读...");
            return;
          }

          if (event.type === "warning") {
            setChatStatus(event.message || "部分段落的服务端音频不可用，已跳过自动播报。");
            return;
          }

          if (event.type === "chunk") {
            combinedAnswer = combinedAnswer
              ? `${combinedAnswer}\n\n${event.text || ""}`.trim()
              : String(event.text || "").trim();
            replaceLastPendingAssistant({
              role: "assistant",
              text: combinedAnswer || "数字人正在朗读...",
              files: [],
              pending: true,
            });
            enqueueAttachmentPlayback({
              audioUrl: event.audio_url || "",
              text: String(event.text || "").trim(),
              errorMessage: String(event.audio_error || "").trim(),
            });
            setChatStatus(
              event.audio_url
                ? `数字人正在朗读第 ${event.index || "?"} 段...`
                : `第 ${event.index || "?"} 段文本已生成，但服务端音频不可用。`,
            );
            return;
          }

          if (event.type === "done") {
            const answerText = String(event.answer_text || "").trim() || combinedAnswer || "（未返回文本内容）";
            replaceLastPendingAssistant({
              role: "assistant",
              text: answerText,
              files: [],
            });
            setChatStatus(`文档朗读已完成，共 ${event.total_chunks || 0} 段。`);
            return;
          }

          if (event.type === "error") {
            streamFailed = true;
            setChatStatus(event.message || "文档朗读失败。");
          }
        },
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        replaceLastPendingAssistant({
          role: "assistant",
          text: combinedAnswer ? `${combinedAnswer}\n\n[朗读已中止]` : "文档朗读已中止。",
          files: [],
        });
        setChatStatus("已停止文档朗读。");
        return;
      }

      replaceLastPendingAssistant({
        role: "assistant",
        text: combinedAnswer
          ? `${combinedAnswer}\n\n[后续朗读失败：${error.message}]`
          : `当前回复失败：${error.message}`,
        files: [],
      });
      setChatStatus(`文档朗读失败：${error.message}`);
    } finally {
      chatReadAbortRef.current = null;
      setChatReading(false);
      setChatSending(false);
      if (streamFailed && !combinedAnswer) {
        resetAttachmentPlaybackQueue();
      }
    }
  }

  async function sendRealtimeTextMessage(text) {
    const content = String(text || "").trim();
    if (!content) return;

    try {
      let client = voiceClientRef.current;
      if (!client?.sendUserText || !isVoiceConnected || !isSessionActive) {
        sessionLockingRef.current = true;
        client = await connectTextBackend();
      }
      if (!client) {
        throw new Error("实时文字会话未建立成功");
      }

      realtimeTextDraftRef.current = "";
      setChatSending(true);
      setChatExpanded(true);
      setChatText("");
      setChatFiles([]);
      stopAssistantSpeech();
      resetAttachmentPlaybackQueue();
      setChatStatus("文字已发送，数字人正在实时思考并回复...");
      replaceLastPendingAssistant({
        role: "assistant",
        text: "数字人正在组织实时回复，请稍候...",
        files: [],
        pending: true,
      });
      client.sendUserText(content);
    } catch (error) {
      replaceLastPendingAssistant({
        role: "assistant",
        text: `当前实时文字回复失败：${error.message}`,
        files: [],
      });
      setChatSending(false);
      setChatStatus(`实时文字发送失败：${error.message}`);
    }
  }

  async function sendMultimodalMessage() {
    const text = chatText.trim();
    if (!text && chatFiles.length === 0) {
      setChatStatus("请输入文本或上传附件后再发送。");
      return;
    }
    if (chatSending) return;

    if (chatMode === "realtimeText") {
      if (chatFiles.length > 0) {
        setChatStatus("实时文字模式暂不支持附件，请切回文字/附件交互模式。");
        return;
      }
      await sendRealtimeTextMessage(text);
      return;
    }

    const readMode = resolveDocumentReadMode(text, chatFiles);
    if (readMode.requested && !readMode.enabled) {
      setChatStatus(readMode.reason);
      return;
    }
    if (readMode.enabled) {
      await sendDocumentReadMessage({ text, files: [...chatFiles] });
      return;
    }

    setChatSending(true);
    setChatStatus("正在发送消息...");
    setChatExpanded(true);
    stopAssistantSpeech();
    resetAttachmentPlaybackQueue();
    setChatHistory((prev) => [
      ...prev,
      {
        role: "user",
        text: text || "(attachments only)",
        files: chatFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        })),
      },
      {
        role: "assistant",
        text: "数字人正在组织回复，请稍候...",
        files: [],
        pending: true,
      },
    ]);

    try {
      const data = await sendMultimodalChat({
        text,
        files: chatFiles,
        modelId: modelId || null,
        sessionId: chatSessionId || null,
        voiceHint,
      });

      if (data.session_id) {
        setChatSessionId(data.session_id);
      }

      const nextSessionId = data.session_id || chatSessionId || null;
      const answerText = String(data.answer_text || "").trim() || "（未返回文本内容）";
      replaceLastPendingAssistant({ role: "assistant", text: answerText, files: [] });
      setChatText("");
      setChatFiles([]);
      setChatStatus("数字人回复已生成，正在准备独立播报...");
      void playAssistantSpeech({
        text: answerText,
        modelId: modelId || null,
        sessionId: nextSessionId,
        voiceHint,
      }).catch(() => {});
    } catch (error) {
      replaceLastPendingAssistant({ role: "assistant", text: `当前回复失败：${error.message}`, files: [] });
      setChatStatus(`发送失败：${error.message}`);
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="interactive-stage">
      <VoiceSilenceWatcher
        enabled={isSessionActive && isVoiceConnected && assistantDoneRef.current && !assistantTalkingRef.current}
        silenceTimeoutMs={AFTER_ASSISTANT_IDLE_MS}
        graceMs={1200}
        speakThreshold={USER_SPEAK_THRESHOLD}
        intervalMs={200}
        getLevel={() => txLevelRef.current}
        onSilenceTimeout={() => {
          if (pendingGoodbyeRef.current) {
            pendingGoodbyeRef.current = false;
          }
          endSession();
        }}
      />
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
          onClick={recording ? stopRecording : startVoiceRecordingLegacy}
          disabled={recordBusy || (isConnecting && !recording) || (!recording && chatMode === "realtimeText")}
          title={!recording && chatMode === "realtimeText" ? "当前仅支持实时语音会话录制" : ""}
        >
          {recordBusy ? "处理中..." : recording ? "结束录制" : "开始录制"}
        </button>
        <button type="button" className="secondary-btn control-nav-btn" onClick={() => navigate("/scene-preview")}>
          返回场景预设
        </button>
        <button type="button" className="secondary-btn control-nav-btn" onClick={() => navigate("/create")}>
          返回形象生成
        </button>
      </div>

      <div className="interactive-canvas-shell">
        <AvatarView
          isWaving={isWaving}
          setIsWaving={setIsWaving}
          isTalking={assistantTalking || attachmentAudioTalking}
          interruptSeq={interruptSeq}
          isSessionActive={isSessionActive}
          userSpeaking={userSpeaking}
          avatarModelUrl={avatarModelUrl}
          actionBasePath={actionBasePath}
          backdropTexturePath={activeBackdropPath}
          cameraPosition={cameraPosition}
          cameraFov={cameraFov}
          ambientIntensity={ambientIntensity}
          directionalIntensity={directionalIntensity}
          directionalPosition={directionalPosition}
          avatarPosition={avatarPosition}
          avatarRotationY={avatarRotationY}
          onCanvasReady={(canvas) => {
            canvasRef.current = canvas;
          }}
        />

        <section className={`multimodal-panel ${chatExpanded ? "expanded" : ""}`}>
          <div className="multimodal-input-row compact">
            <textarea
              className="multimodal-textarea compact"
              placeholder={
                chatMode === "realtimeText"
                  ? "输入文字后，会复用实时数字人会话来思考并返回语音..."
                  : "输入文字，或上传图片/文件给数字人..."
              }
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
            />
            <div className="multimodal-mode-switch" aria-label="聊天模式切换">
              <button
                type="button"
                className={`mode-switch-btn ${chatMode === "chat" ? "active" : ""}`}
                aria-pressed={chatMode === "chat"}
                onClick={() => handleChatModeChange("chat")}
              >
                文字问答
              </button>
              <button
                type="button"
                className={`mode-switch-btn ${chatMode === "realtimeText" ? "active" : ""}`}
                aria-pressed={chatMode === "realtimeText"}
                onClick={() => handleChatModeChange("realtimeText")}
              >
                实时文字
              </button>
            </div>
            <div className="multimodal-actions compact">
              <label className="secondary-btn upload-btn" htmlFor="chat-upload-input">
                上传
              </label>
              <input
                id="chat-upload-input"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.docx"
                multiple
                onChange={handlePickChatFiles}
                disabled={chatMode === "realtimeText"}
                style={{ display: "none" }}
              />
              <button type="button" className="secondary-btn" onClick={() => setChatExpanded((v) => !v)}>
                {chatExpanded ? "收起" : "展开"}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={chatReading ? stopDocumentRead : sendMultimodalMessage}
                disabled={chatSending && !chatReading}
              >
                {chatReading ? "停止朗读" : chatSending ? "发送中" : "发送"}
              </button>
            </div>
          </div>

          {chatExpanded ? (
            <div className="multimodal-drawer">
              <div className="multimodal-title-row">
                <strong>{chatMode === "realtimeText" ? "实时文字交互" : "文字/附件交互"}</strong>
                <span className="muted">
                  {chatMode === "realtimeText"
                    ? "当前模式仅支持纯文字输入，会复用实时数字人会话进行思考和播报"
                    : "支持 jpg/png/webp/pdf/txt/docx（单文件 10MB）"}
                </span>
              </div>

              {chatFiles.length ? (
                <div className="multimodal-files">
                  {chatFiles.map((file, index) => (
                    <div key={`${file.name}_${index}`} className="chat-file-chip">
                      <span>{file.name}</span>
                      <button type="button" onClick={() => removeChatFile(index)}>
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {chatHistory.length ? (
                <div className="multimodal-history">
                  {chatHistory.slice(-4).map((item, idx) => (
                    <div key={`${item.role}_${idx}`} className={`chat-bubble ${item.role}`}>
                      <div className="chat-role">{item.role === "user" ? "你" : "数字人"}</div>
                      <div className="chat-text">{item.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="status-box">{chatStatus}</div>
            </div>
          ) : null}
        </section>

        <GestureDetector onGreet={handleUserGreet} onLeave={endSession} isSessionActive={isSessionActive} />
      </div>
    </div>
  );
}
