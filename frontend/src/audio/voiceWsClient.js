export function createVoiceWsClient({
  url,
  onRxLevel,
  onTxLevel,
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
  let srcNode = null;
  let workletNode = null;

  let curNode = null;
  const playQueue = [];
  let isPlaying = false;
  let playbackActive = false;
  let drainTimer = null;
  let suppressIncomingAudio = false;

  let txAcc = new Int16Array(0);
  let micStream = null;
  let assistantDestination = null;
  let txEnabled = true;

  function floatToInt16(f) {
    const v = Math.max(-1, Math.min(1, f));
    return v < 0 ? v * 0x8000 : v * 0x7fff;
  }

  function resampleTo16k(float32, inputRate) {
    const targetRate = 16000;
    if (inputRate === targetRate) return float32;

    const ratio = inputRate / targetRate;
    const outLen = Math.floor(float32.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i += 1) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, float32.length - 1);
      const t = idx - i0;
      out[i] = float32[i0] * (1 - t) + float32[i1] * t;
    }
    return out;
  }

  function calcRms(float32) {
    if (!float32?.length) return 0;
    let sum = 0;
    for (let i = 0; i < float32.length; i += 1) sum += float32[i] * float32[i];
    return Math.sqrt(sum / float32.length);
  }

  function pushTx(float32_16k) {
    const i16 = new Int16Array(float32_16k.length);
    for (let i = 0; i < float32_16k.length; i += 1) i16[i] = floatToInt16(float32_16k[i]);

    const merged = new Int16Array(txAcc.length + i16.length);
    merged.set(txAcc, 0);
    merged.set(i16, txAcc.length);
    txAcc = merged;

    const chunkSize = 320;
    while (txAcc.length >= chunkSize) {
      const chunk = txAcc.slice(0, chunkSize);
      txAcc = txAcc.slice(chunkSize);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(chunk.buffer);
      }
    }
  }

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
        onRxLevel?.(0);
        onTextEvent?.({ type: "assistant_done" });
      }
    }, 450);
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

  function setTxEnabled(enabled) {
    txEnabled = !!enabled;
    debugLog("setTxEnabled", { txEnabled });
  }

  async function playPcm16(pcmBuffer) {
    if (!ctx || suppressIncomingAudio) return;

    onAssistantAudioIn?.(Date.now());
    const int16 = new Int16Array(pcmBuffer);
    const f32 = int16ToFloat32(int16);
    onRxLevel?.(calcRms(f32));

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
        debugLog("audio context locked, waiting for unlock");
        await waitForAudioUnlock(ctx);
      }
      assistantDestination = ctx.createMediaStreamDestination();

      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        debugLog("microphone granted", {
          tracks: micStream.getAudioTracks().map((track) => ({
            label: track.label,
            enabled: track.enabled,
            readyState: track.readyState,
          })),
        });
      } catch (error) {
        debugLog("microphone request failed", error);
        throw createStageError("microphone", error);
      }

      srcNode = ctx.createMediaStreamSource(micStream);
      try {
        await ctx.audioWorklet.addModule("audios/mic-worklet.js");
      } catch (error) {
        debugLog("audio worklet load failed", error);
        throw createStageError("worklet", error);
      }
      workletNode = new AudioWorkletNode(ctx, "mic-processor");
      srcNode.connect(workletNode);
      workletNode.port.onmessage = (event) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !ctx) return;
      const floatChunk = event.data;
      const resampled = resampleTo16k(floatChunk, ctx.sampleRate);
      onTxLevel?.(calcRms(resampled));
      if (!txEnabled) return;
      pushTx(resampled);
    };

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
          if (payload?.type === "speech_started") {
            suppressIncomingAudio = false;
          }
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

  async function stop() {
    try {
      interruptPlayback();
    } catch {}

    try {
      if (drainTimer) clearTimeout(drainTimer);
      drainTimer = null;
    } catch {}

    try {
      if (workletNode) workletNode.port.onmessage = null;
      if (workletNode) workletNode.disconnect();
      if (srcNode) srcNode.disconnect();
    } catch {}

    try {
      micStream?.getTracks?.().forEach((track) => track.stop());
    } catch {}
    micStream = null;

    try {
      if (ctx) await ctx.close();
    } catch {}
    ctx = null;

    try {
      if (ws) ws.close();
    } catch {}
    ws = null;

    srcNode = null;
    workletNode = null;
    assistantDestination = null;
    playQueue.length = 0;
    txAcc = new Int16Array(0);
    curNode = null;
    suppressIncomingAudio = false;
    setPlaybackActive(false);
  }

  function getMicStream() {
    return micStream;
  }

  function getAssistantStream() {
    return assistantDestination?.stream || null;
  }

  return {
    start,
    stop,
    interruptPlayback,
    interrupt,
    setTxEnabled,
    getMicStream,
    getAssistantStream,
  };
}
