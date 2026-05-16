export function createTextVoiceWsClient({
  url,
  onTextEvent,
  onAssistantPlaybackStarted,
  onAssistantPlaybackEnded,
  onAssistantAudioIn,
  onWsOpen,
  onWsClose,
  onWsError,
}) {
  const debugLog = () => {};

  let ws = null;
  let ctx = null;
  let assistantDestination = null;
  let curNode = null;
  const playQueue = [];
  let isPlaying = false;
  let playbackActive = false;
  let drainTimer = null;
  let suppressIncomingAudio = false;

  function int16ToFloat32(int16) {
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) out[i] = int16[i] / 0x8000;
    return out;
  }

  function createStageError(stage, error) {
    const message = error?.message || String(error || stage);
    const wrapped = new Error(message);
    wrapped.stage = stage;
    wrapped.original = error;
    return wrapped;
  }

  async function waitForAudioUnlock(audioContext, timeoutMs = 10000) {
    if (!audioContext || audioContext.state === "running") return;

    await new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;

      const cleanup = () => {
        window.removeEventListener("pointerdown", onUnlock);
        window.removeEventListener("keydown", onUnlock);
        window.removeEventListener("touchstart", onUnlock);
        if (timer) clearTimeout(timer);
      };

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      const onUnlock = async () => {
        try {
          await audioContext.resume();
          if (audioContext.state === "running") {
            finish(resolve);
          }
        } catch {}
      };

      window.addEventListener("pointerdown", onUnlock, { passive: true });
      window.addEventListener("keydown", onUnlock, { passive: true });
      window.addEventListener("touchstart", onUnlock, { passive: true });
      timer = window.setTimeout(() => finish(reject, new Error("audio_context_locked")), timeoutMs);
      onUnlock();
    });
  }

  function setPlaybackActive(next) {
    if (playbackActive === next) return;
    playbackActive = next;
    if (next) onAssistantPlaybackStarted?.(Date.now());
    else onAssistantPlaybackEnded?.(Date.now());
  }

  function scheduleDrainCheck() {
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = window.setTimeout(() => {
      drainTimer = null;
      if (!playQueue.length && !isPlaying && !curNode) {
        setPlaybackActive(false);
        onTextEvent?.({ type: "assistant_done" });
      }
    }, 900);
  }

  function interruptPlayback() {
    playQueue.length = 0;
    isPlaying = false;
    try {
      curNode?.stop();
    } catch {}
    curNode = null;
    scheduleDrainCheck();
    setPlaybackActive(false);
  }

  function sendJson(payload) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    } catch {}
  }

  function interrupt() {
    suppressIncomingAudio = true;
    interruptPlayback();
    sendJson({ type: "interrupt" });
  }

  async function playPcm16(pcmBuffer) {
    if (!ctx || suppressIncomingAudio) return;

    onAssistantAudioIn?.(Date.now());
    const int16 = new Int16Array(pcmBuffer);
    const f32 = int16ToFloat32(int16);
    const buffer = ctx.createBuffer(1, f32.length, 24000);
    buffer.copyToChannel(f32, 0);
    playQueue.push(buffer);
    setPlaybackActive(true);

    if (drainTimer) {
      clearTimeout(drainTimer);
      drainTimer = null;
    }
    if (!isPlaying) {
      drainPlayQueue();
    }
  }

  function drainPlayQueue() {
    if (!ctx) return;
    const buffer = playQueue.shift();
    if (!buffer) {
      isPlaying = false;
      scheduleDrainCheck();
      return;
    }

    isPlaying = true;
    const node = ctx.createBufferSource();
    curNode = node;
    node.buffer = buffer;
    node.connect(ctx.destination);
    if (assistantDestination) {
      node.connect(assistantDestination);
    }
    node.onended = () => {
      if (curNode === node) curNode = null;
      drainPlayQueue();
    };
    try {
      node.start();
    } catch {
      drainPlayQueue();
    }
  }

  async function start() {
    try {
      debugLog("start requested", { url });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {}
      }
      if (ctx.state !== "running") {
        await waitForAudioUnlock(ctx);
      }
      assistantDestination = ctx.createMediaStreamDestination();

      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        debugLog("websocket open");
        onWsOpen?.();
      };
      ws.onerror = (event) => {
        debugLog("websocket error", event);
        onWsError?.(createStageError("websocket", event));
      };
      ws.onclose = (event) => {
        debugLog("websocket close", { code: event?.code, reason: event?.reason, wasClean: event?.wasClean });
        onWsClose?.(event);
      };
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playPcm16(event.data);
          return;
        }
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "assistant_done") {
            suppressIncomingAudio = false;
          }
          onTextEvent?.(payload);
        } catch {}
      };

      await new Promise((resolve, reject) => {
        const ok = () => resolve();
        const bad = (event) => reject(createStageError("websocket", event));
        ws.addEventListener("open", ok, { once: true });
        ws.addEventListener("error", bad, { once: true });
      });
    } catch (error) {
      await stop();
      throw error;
    }
  }

  function sendUserText(text) {
    const content = String(text || "").trim();
    if (!content) return;
    sendJson({ type: "user_text", text: content });
  }

  async function stop() {
    try {
      interruptPlayback();
    } catch {}

    try {
      if (drainTimer) clearTimeout(drainTimer);
      drainTimer = null;
    } catch {}

    try {
      if (ctx) await ctx.close();
    } catch {}
    ctx = null;

    try {
      if (ws) ws.close();
    } catch {}
    ws = null;

    assistantDestination = null;
    playQueue.length = 0;
    curNode = null;
    suppressIncomingAudio = false;
    setPlaybackActive(false);
  }

  function getMicStream() {
    return null;
  }

  function getAssistantStream() {
    return assistantDestination?.stream || null;
  }

  return {
    start,
    stop,
    interruptPlayback,
    interrupt,
    sendUserText,
    getMicStream,
    getAssistantStream,
  };
}
