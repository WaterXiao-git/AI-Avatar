/* eslint-disable no-empty, react-hooks/exhaustive-deps */
import { useEffect, useEffectEvent, useRef, useState } from "react";

const ERROR_HINT = {
  "not-allowed": "麦克风权限被拒绝",
  "service-not-allowed": "浏览器语音服务不可用",
  network: "语音服务网络异常",
  "no-speech": "未识别到语音",
  "audio-capture": "音频采集失败",
  aborted: "语音识别被中断",
};

export function useSpeechInput({
  lang = "zh-CN",
  onText,
  onStatus,
  startHint = "正在聆听，请开始说话...",
  doneHint = "语音已识别并填入输入框。",
}) {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const isStartingRef = useRef(false);
  const manualStopRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const hasResultRef = useRef(false);
  const startTimeoutRef = useRef(null);

  const emitText = useEffectEvent((text) => {
    onText?.(text);
  });

  const emitStatus = useEffectEvent((text) => {
    onStatus?.(text);
  });

  function clearStartTimeout() {
    if (startTimeoutRef.current) {
      window.clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      setSpeechSupported(false);
      return undefined;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechSupported(false);
      return undefined;
    }

    setSpeechSupported(true);
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      clearStartTimeout();
      isStartingRef.current = false;
      setListening(true);
    };

    recognition.onresult = (event) => {
      let finalText = finalTranscriptRef.current;
      let interimText = "";

      for (let index = event.resultIndex || 0; index < (event.results?.length || 0); index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript || "";
        if (!transcript) continue;
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      finalTranscriptRef.current = finalText;
      interimTranscriptRef.current = interimText;
      const text = `${finalText}${interimText}`.trim();
      if (text) {
        hasResultRef.current = true;
        emitText(text);
        emitStatus(interimText ? "正在识别语音..." : doneHint);
      }
    };

    recognition.onerror = (event) => {
      clearStartTimeout();
      const code = String(event?.error || "unknown");
      if (code === "aborted" && manualStopRef.current) {
        return;
      }
      if (code === "not-allowed") {
        emitStatus("麦克风权限被拒绝");
        return;
      }
      if (code === "service-not-allowed") {
        emitStatus("当前浏览器语音服务不可用，请手动输入");
        return;
      }
      if (code === "network") {
        emitStatus("浏览器语音识别网络异常，请重试或手动输入");
        return;
      }

      const hint = ERROR_HINT[code] || `未知错误：${code}`;
      emitStatus(`语音识别失败：${hint}`);
    };

    recognition.onend = () => {
      clearStartTimeout();
      const finalText = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
      if (finalText && !hasResultRef.current) {
        emitText(finalText);
      }
      if (finalText) {
        emitStatus(doneHint);
      }
      setListening(false);
      isStartingRef.current = false;
      finalTranscriptRef.current = "";
      interimTranscriptRef.current = "";
      hasResultRef.current = false;
      manualStopRef.current = false;
    };

    recognitionRef.current = recognition;
    return () => {
      clearStartTimeout();
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
      setListening(false);
      isStartingRef.current = false;
      finalTranscriptRef.current = "";
      interimTranscriptRef.current = "";
      hasResultRef.current = false;
    };
  }, [doneHint, lang]);

  function toggleSpeechInput(disabled = false) {
    if (disabled || !speechSupported) return;
    if (!window.isSecureContext) {
      emitStatus("当前环境非安全上下文，语音识别仅支持 https 或 localhost。");
      return;
    }

    const recognition = recognitionRef.current;

    if (listening || isStartingRef.current) {
      manualStopRef.current = true;
      try {
        recognition?.stop();
      } catch {}
      setListening(false);
      isStartingRef.current = false;
      emitStatus("语音采集已结束，正在识别...");
      return;
    }

    if (!recognition) {
      emitStatus("当前浏览器不支持语音识别，请手动输入。");
      return;
    }

    try {
      isStartingRef.current = true;
      setListening(true);
      finalTranscriptRef.current = "";
      interimTranscriptRef.current = "";
      hasResultRef.current = false;
      recognition.start();
      clearStartTimeout();
      startTimeoutRef.current = window.setTimeout(() => {
        if (!recognitionRef.current || !isStartingRef.current) {
          return;
        }
        emitStatus("已请求启动语音识别，但浏览器暂未进入采集中状态。");
      }, 2000);
      emitStatus(startHint);
    } catch {
      isStartingRef.current = false;
      setListening(false);
      emitStatus("语音识别启动失败，请稍后重试。");
    }
  }

  return {
    speechSupported,
    listening,
    toggleSpeechInput,
  };
}
