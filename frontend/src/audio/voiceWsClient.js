import { sendMultimodalChat } from "../lib/api";
import { toAbsoluteUrl } from "../lib/config";

const SESSION_START_TIMEOUT_MS = 10000;
const RECOGNITION_START_TIMEOUT_MS = 5000;
const RECOGNITION_RETRY_DELAY_MS = 500;

function calcRms(buffer) {
  if (!buffer?.length) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, ms);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseSessionHints(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    const modelIdRaw = parsed.searchParams.get("model_id");
    const modelId = modelIdRaw ? Number(modelIdRaw) : null;
    return {
      modelId: Number.isFinite(modelId) ? modelId : null,
      voiceHint: parsed.searchParams.get("voice_hint") || "",
    };
  } catch {
    return { modelId: null, voiceHint: "" };
  }
}

function pickVoice(voiceHint) {
  const hint = String(voiceHint || "").toLowerCase();
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;
  if (hint === "male") {
    return (
      voices.find((voice) => /male|yunxi|yunyang|xiaogang|guy/i.test(voice.name)) ||
      voices.find((voice) => /^zh/i.test(voice.lang))
    );
  }
  if (hint === "female") {
    return (
      voices.find((voice) => /female|xiaoxiao|xiaoyi|aria|jenny/i.test(voice.name)) ||
      voices.find((voice) => /^zh/i.test(voice.lang))
    );
  }
  return voices.find((voice) => /^zh/i.test(voice.lang)) || voices[0] || null;
}

export function createVoiceWsClient({
  url,
  onRxLevel,
  onTxLevel,
  onTextEvent,
  onAssistantPlaybackStarted,
  onAssistantPlaybackEnded,
  onWsOpen,
  onWsClose,
  onWsError,
}) {
  const hints = parseSessionHints(url);

  let ctx = null;
  let micStream = null;
  let assistantDestination = null;
  let assistantOscillator = null;
  let assistantGain = null;
  let assistantAudio = null;
  let assistantAudioSource = null;
  let analyser = null;
  let meterArray = null;
  let meterFrame = 0;
  let recognition = null;
  let sessionActive = false;
  let assistantSpeaking = false;
  let pendingRequest = false;
  let sessionId = null;
  let closeNotified = false;

  function notifyError(error) {
    onWsError?.(error instanceof Error ? error : new Error(String(error || "Unknown voice error")));
  }

  function stopMeterLoop() {
    if (meterFrame) {
      window.cancelAnimationFrame(meterFrame);
      meterFrame = 0;
    }
  }

  function runMeterLoop() {
    if (!analyser || !sessionActive) return;
    analyser.getFloatTimeDomainData(meterArray);
    onTxLevel?.(calcRms(meterArray));
    meterFrame = window.requestAnimationFrame(runMeterLoop);
  }

  function resetRecognitionHandlers(instance) {
    if (!instance) return;
    instance.onstart = null;
    instance.onresult = null;
    instance.onend = null;
    instance.onerror = null;
  }

  function stopRecognition() {
    if (!recognition) return;
    resetRecognitionHandlers(recognition);
    try {
      recognition.abort();
    } catch {
      // Ignore aborted recognition teardown races.
    }
    recognition = null;
  }

  function interruptPlayback() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (assistantSpeaking) {
      assistantSpeaking = false;
      onAssistantPlaybackEnded?.(Date.now());
    }
  }

  function cleanupMedia() {
    stopMeterLoop();

    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }
    if (assistantOscillator) {
      try {
        assistantOscillator.stop();
      } catch {
        // Ignore oscillator stop races during teardown.
      }
      assistantOscillator.disconnect();
      assistantOscillator = null;
    }
    if (assistantGain) {
      assistantGain.disconnect();
      assistantGain = null;
    }
    if (assistantAudioSource) {
      assistantAudioSource.disconnect();
      assistantAudioSource = null;
    }
    if (assistantAudio) {
      try {
        assistantAudio.pause();
      } catch {
        // Ignore stale HTMLAudioElement cleanup.
      }
      assistantAudio.src = "";
      assistantAudio = null;
    }
    assistantDestination = null;
    analyser = null;
    meterArray = null;
  }

  async function closeAudioContext() {
    if (!ctx) return;
    const current = ctx;
    ctx = null;
    try {
      await current.close();
    } catch {
      // Ignore duplicate audio-context close attempts.
    }
  }

  async function speakReply(text) {
    if (!text || !window.speechSynthesis) {
      onTextEvent?.({ type: "assistant_done" });
      return;
    }

    await new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const chosenVoice = pickVoice(hints.voiceHint);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
      } else {
        utterance.lang = "zh-CN";
      }
      utterance.rate = 1;
      utterance.pitch = 1;

      let rxTimer = 0;
      const finish = () => {
        if (rxTimer) {
          window.clearInterval(rxTimer);
          rxTimer = 0;
        }
        if (assistantSpeaking) {
          assistantSpeaking = false;
          onAssistantPlaybackEnded?.(Date.now());
        }
        onRxLevel?.(0);
        onTextEvent?.({ type: "assistant_done" });
        resolve();
      };

      utterance.onstart = () => {
        assistantSpeaking = true;
        onAssistantPlaybackStarted?.(Date.now());
        rxTimer = window.setInterval(() => {
          onRxLevel?.(0.18);
        }, 120);
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function playReplyAudio(audioUrl) {
    if (!audioUrl || !ctx || !assistantDestination) {
      return false;
    }

    return new Promise((resolve) => {
      const audio = new Audio(toAbsoluteUrl(audioUrl));
      audio.crossOrigin = "anonymous";
      assistantAudio = audio;
      let settled = false;

      let rxTimer = 0;
      const source = ctx.createMediaElementSource(audio);
      assistantAudioSource = source;
      source.connect(ctx.destination);
      source.connect(assistantDestination);

      const finish = (success = true) => {
        if (settled) return;
        settled = true;
        if (rxTimer) {
          window.clearInterval(rxTimer);
          rxTimer = 0;
        }
        if (assistantSpeaking) {
          assistantSpeaking = false;
          onAssistantPlaybackEnded?.(Date.now());
        }
        onRxLevel?.(0);
        onTextEvent?.({ type: "assistant_done" });
        if (assistantAudioSource === source) {
          assistantAudioSource = null;
        }
        try {
          source.disconnect();
        } catch {
          // Ignore audio-node disconnect races.
        }
        if (assistantAudio === audio) {
          assistantAudio = null;
        }
        resolve(success);
      };

      audio.onplay = () => {
        assistantSpeaking = true;
        onAssistantPlaybackStarted?.(Date.now());
        rxTimer = window.setInterval(() => {
          onRxLevel?.(0.18);
        }, 120);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);

      audio.play().catch(() => {
        if (settled) return;
        finish(false);
      });
    });
  }

  async function handleTranscript(text) {
    const finalText = String(text || "").trim();
    if (!finalText || pendingRequest || !sessionActive) return;

    pendingRequest = true;
    onTextEvent?.({ type: "user_final", text: finalText });

    try {
      const data = await sendMultimodalChat({
        text: finalText,
        files: [],
        modelId: hints.modelId,
        sessionId,
        voiceHint: hints.voiceHint,
      });
      if (data.session_id) {
        sessionId = data.session_id;
      }
      const answerText = String(data.answer_text || "").trim();
      if (answerText) {
        if (data.audio_url) {
          const played = await playReplyAudio(data.audio_url);
          if (!played) {
            await speakReply(answerText);
          }
        } else {
          await speakReply(answerText);
        }
      } else {
        onTextEvent?.({ type: "assistant_done" });
      }
    } catch (error) {
      notifyError(error);
      const message = `语音会话请求失败：${error?.message || "unknown error"}`;
      await speakReply(message);
    } finally {
      pendingRequest = false;
      if (sessionActive) {
        startRecognition().catch(notifyError);
      }
    }
  }

  function scheduleRecognitionRestart() {
    window.setTimeout(() => {
      if (sessionActive && !pendingRequest && !assistantSpeaking) {
        startRecognition().catch(notifyError);
      }
    }, RECOGNITION_RETRY_DELAY_MS);
  }

  function startRecognition() {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor || !sessionActive) {
      return Promise.resolve();
    }

    stopRecognition();

    return withTimeout(
      new Promise((resolve, reject) => {
        const instance = new RecognitionCtor();
        let started = false;

        instance.lang = "zh-CN";
        instance.continuous = true;
        instance.interimResults = false;

        instance.onstart = () => {
          started = true;
          resolve();
        };

        instance.onresult = (event) => {
          const pieces = [];
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const one = event.results[i];
            if (one?.isFinal) {
              pieces.push(one[0]?.transcript || "");
            }
          }
          const merged = pieces.join("").trim();
          if (!merged) return;
          stopRecognition();
          handleTranscript(merged);
        };

        instance.onend = () => {
          if (recognition === instance) {
            recognition = null;
          }
          if (sessionActive && !pendingRequest && !assistantSpeaking) {
            scheduleRecognitionRestart();
          }
        };

        instance.onerror = (event) => {
          const errorCode = String(event?.error || "unknown");
          if (!started) {
            reject(new Error(`Speech recognition failed to start: ${errorCode}`));
            return;
          }
          notifyError(new Error(`Speech recognition error: ${errorCode}`));
          if (recognition === instance) {
            recognition = null;
          }
          if (sessionActive && !pendingRequest && !assistantSpeaking) {
            scheduleRecognitionRestart();
          }
        };

        recognition = instance;
        try {
          instance.start();
        } catch (error) {
          reject(error);
        }
      }),
      RECOGNITION_START_TIMEOUT_MS,
      "Speech recognition did not become ready in time",
    );
  }

  async function start() {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      throw new Error("Browser speech recognition is unavailable");
    }

    closeNotified = false;

    await withTimeout(
      (async () => {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        assistantDestination = ctx.createMediaStreamDestination();
        assistantOscillator = ctx.createOscillator();
        assistantGain = ctx.createGain();
        assistantGain.gain.value = 0;
        assistantOscillator.connect(assistantGain);
        assistantGain.connect(assistantDestination);
        assistantOscillator.start();

        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const micSource = ctx.createMediaStreamSource(micStream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        meterArray = new Float32Array(analyser.fftSize);
        micSource.connect(analyser);

        sessionActive = true;
        runMeterLoop();
        await startRecognition();
        onWsOpen?.();
      })(),
      SESSION_START_TIMEOUT_MS,
      "Microphone permission was not granted in time",
    ).catch(async (error) => {
      sessionActive = false;
      stopRecognition();
      interruptPlayback();
      cleanupMedia();
      await closeAudioContext();
      throw error;
    });
  }

  async function stop() {
    sessionActive = false;
    pendingRequest = false;
    stopRecognition();
    interruptPlayback();
    cleanupMedia();
    await closeAudioContext();
    if (!closeNotified) {
      closeNotified = true;
      onWsClose?.();
    }
  }

  function interrupt() {
    interruptPlayback();
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
    getMicStream,
    getAssistantStream,
  };
}
