/* eslint-disable no-empty */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AvatarView from "./AvatarView";
import GestureDetector from "./GestureDetector";
import { createVoiceWsClient } from "../../audio/voiceWsClient";
import { API_BASE, toAbsoluteUrl } from "../../lib/config";
import { getToken } from "../../lib/auth";
import { sendMultimodalChat, uploadRecording } from "../../lib/api";

const USER_SPEAK_THRESHOLD = 0.14;
const USER_SPEAK_FRAMES = 10;
const USER_SPEAK_HANGOVER_MS = 350;
const AFTER_ASSISTANT_IDLE_MS = 20000;
const RX_STALE_MS = 200;
const TX_OVER_RX_RATIO = 2.8;
const TX_OVER_RX_DELTA = 0.02;
const PLAYBACK_GUARD_MS = 350;
const INTERRUPT_CONFIRM_MS = 180;
const GOODBYE_RE = /(?:bye|goodbye|exit|end session)/i;
const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHAT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const WS_BASE = `${API_BASE.replace(/^http/i, "ws")}/ws/audio`;
const DEFAULT_BACKDROP = "/textures/Black.jpg";

export default function InteractiveAvatarScene({
  avatarModelUrl = "/models/avatar.fbx",
  actionBasePath = "/animations",
  modelId = null,
  backdropTexturePath = "",
  avatarPosition = [0, -1.6, 0],
  cameraPosition = [0, 0, 10],
  cameraFov = 20,
  ambientIntensity = 1.25,
  directionalIntensity = 1.35,
  directionalPosition = [5, 15, 5],
  presetName = "",
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
  const [chatText, setChatText] = useState("");
  const [chatFiles, setChatFiles] = useState([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatStatus, setChatStatus] = useState("支持文本与附件交互，可上传 jpg/png/webp/pdf/txt/docx。");
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
  const waveAfterConnectRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const canvasRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStartAtRef = useRef(0);
  const recordCleanupRef = useRef(() => {});
  const chatAudioRef = useRef(null);

  const activeBackdropPath = backdropTexturePath || DEFAULT_BACKDROP;

  function inferVoiceHint() {
    const name = String(presetName || "").toLowerCase();
    if (!name) return "";
    if (/(^|_|\b)(male|man|boy|men)(_|\b)/i.test(name)) return "male";
    if (/(^|_|\b)(female|woman|women|girl)(_|\b)/i.test(name)) return "female";
    return "";
  }

  const voiceHint = inferVoiceHint();

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
      try {
        if (chatAudioRef.current) {
          chatAudioRef.current.pause();
          chatAudioRef.current = null;
        }
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
        url:
          `${WS_BASE}?token=${encodeURIComponent(getToken())}` +
          `${modelId ? `&model_id=${modelId}` : ""}` +
          `${voiceHint ? `&voice_hint=${encodeURIComponent(voiceHint)}` : ""}`,
        onWsClose: () => {
          endSession();
        },
        onWsError: (error) => {
        },
        onWsOpen: () => {
        },
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
    } catch (error) {
      await endSession();
    } finally {
      setIsConnecting(false);
      sessionLockingRef.current = false;
    }
  }, [isConnecting, isVoiceConnected, endSession, fireInterruptOnce, modelId, voiceHint]);

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
      return;
    }

    const client = voiceClientRef.current;
    const micStream = client?.getMicStream?.();
    const assistantStream = client?.getAssistantStream?.();
    if (!micStream || !assistantStream) {
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
      };

      recorder.onstop = async () => {
        const durationMs = Date.now() - recordStartAtRef.current;
        const blob = new Blob(recordChunksRef.current, { type: preferType });
        recordChunksRef.current = [];
        setRecording(false);
        setRecordBusy(true);
        try {
          const file = new File([blob], `recording_${Date.now()}.webm`, { type: preferType });
          await uploadRecording({ file, modelId, durationMs });
        } catch {
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
    } catch {
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

  function playChatAudio(audioUrl) {
    if (!audioUrl) return;
    try {
      if (chatAudioRef.current) {
        chatAudioRef.current.pause();
        chatAudioRef.current = null;
      }
    } catch {}

    const audio = new Audio(toAbsoluteUrl(audioUrl));
    chatAudioRef.current = audio;
    setAttachmentAudioTalking(true);
    audio.onended = () => {
      setAttachmentAudioTalking(false);
      chatAudioRef.current = null;
    };
    audio.onerror = () => {
      setAttachmentAudioTalking(false);
      chatAudioRef.current = null;
    };
    audio.play().catch(() => {
      setAttachmentAudioTalking(false);
      chatAudioRef.current = null;
    });
  }

  function speakChatText(text) {
    const content = String(text || "").trim();
    if (!content || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "zh-CN";
    utterance.onstart = () => {
      setAttachmentAudioTalking(true);
    };
    const finish = () => {
      setAttachmentAudioTalking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  async function sendMultimodalMessage() {
    const text = chatText.trim();
    if (!text && chatFiles.length === 0) {
      setChatStatus("??????");
      return;
    }
    if (chatSending) return;

    setChatSending(true);
    setChatStatus("???????...");
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

      const answerText = String(data.answer_text || "").trim() || "(no answer text returned)";
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: answerText, files: [] },
      ]);
      setChatText("");
      setChatFiles([]);
      if (data.audio_url) {
        setChatStatus("Avatar reply ready. Playing audio.");
        playChatAudio(data.audio_url);
      } else if (data.audio_error) {
        setChatStatus(`Avatar reply ready. Server audio unavailable: ${data.audio_error}. Using browser speech.`);
        speakChatText(answerText);
      } else {
        setChatStatus("Avatar reply ready. Using browser speech.");
        speakChatText(answerText);
      }
    } catch (error) {
      setChatStatus(`Send failed: ${error.message}`);
    } finally {
      setChatSending(false);
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
          onCanvasReady={(canvas) => {
            canvasRef.current = canvas;
          }}
        />

        <section className={`multimodal-panel ${chatExpanded ? "expanded" : ""}`}>
          <div className="multimodal-input-row compact">
            <textarea
              className="multimodal-textarea compact"
              placeholder="输入文字，或上传图片/文件给数字人..."
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
            />
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
                style={{ display: "none" }}
              />
              <button type="button" className="secondary-btn" onClick={() => setChatExpanded((v) => !v)}>
                {chatExpanded ? "收起" : "展开"}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={sendMultimodalMessage}
                disabled={chatSending}
              >
                {chatSending ? "发送中" : "发送"}
              </button>
            </div>
          </div>

          {chatExpanded ? (
            <div className="multimodal-drawer">
              <div className="multimodal-title-row">
                <strong>文字/附件交互</strong>
                <span className="muted">支持 jpg/png/webp/pdf/txt/docx（单文件 10MB）</span>
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
