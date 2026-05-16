import { useCallback, useEffect, useRef, useState } from "react";
import { requestAssistantSpeech } from "../lib/api";
import { toAbsoluteUrl } from "../lib/config";

export function useAssistantSpeechPlayer({ onStart, onEnd, onError } = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const requestAbortRef = useRef(null);
  const playbackTokenRef = useRef(0);

  const stop = useCallback(() => {
    playbackTokenRef.current += 1;

    try {
      requestAbortRef.current?.abort?.();
    } catch {}
    requestAbortRef.current = null;

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    } catch {}

    setIsPlaying(false);
    onEnd?.();
  }, [onEnd]);

  const playAudioUrl = useCallback(
    async ({ audioUrl = "", spokenText = "", voice = "", errorMessage = "" } = {}) => {
      const absoluteUrl = toAbsoluteUrl(String(audioUrl || "").trim());
      if (!absoluteUrl) {
        throw new Error(errorMessage || "Server speech audio unavailable");
      }

      stop();
      const token = playbackTokenRef.current;
      const audio = new Audio(absoluteUrl);
      audioRef.current = audio;

      await new Promise((resolve, reject) => {
        let settled = false;

        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          fn(value);
        };

        audio.onplay = () => {
          if (token !== playbackTokenRef.current) {
            finish(reject, new Error("speech_playback_stale"));
            return;
          }
          setIsPlaying(true);
          onStart?.({ spokenText, audioUrl: absoluteUrl, voice });
        };
        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
          onEnd?.();
          finish(resolve, true);
        };
        audio.onerror = () => {
          const err = new Error(errorMessage || "Speech audio playback failed");
          setIsPlaying(false);
          audioRef.current = null;
          onError?.(err);
          onEnd?.();
          finish(reject, err);
        };

        audio.play().catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error || "Speech audio playback failed"));
          setIsPlaying(false);
          audioRef.current = null;
          onError?.(err);
          onEnd?.();
          finish(reject, err);
        });
      });
    },
    [onEnd, onError, onStart, stop],
  );

  const play = useCallback(
    async ({ text = "", modelId = null, sessionId = null, voiceHint = "" } = {}) => {
      const content = String(text || "").trim();
      if (!content) {
        throw new Error("No speech text provided");
      }

      stop();
      const token = playbackTokenRef.current;
      const controller = new AbortController();
      requestAbortRef.current = controller;

      try {
        const data = await requestAssistantSpeech({
          text: content,
          modelId,
          sessionId,
          voiceHint,
          signal: controller.signal,
        });

        if (token !== playbackTokenRef.current) {
          return data;
        }

        const spokenText = String(data.spoken_text || "").trim() || content;
        const audioUrl = String(data.audio_url || "").trim();
        const audioError = String(data.audio_error || "").trim();
        await playAudioUrl({
          audioUrl,
          spokenText,
          voice: data.voice || "",
          errorMessage: audioError || "Server speech audio unavailable",
        });

        return { ...data, spoken_text: spokenText };
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }
        const err = error instanceof Error ? error : new Error(String(error || "Assistant speech failed"));
        setIsPlaying(false);
        onError?.(err);
        onEnd?.();
        throw err;
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      }
    },
    [playAudioUrl, stop],
  );

  useEffect(() => () => {
    try {
      requestAbortRef.current?.abort?.();
    } catch {}
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch {}
  }, []);

  return {
    isPlaying,
    play,
    playAudioUrl,
    stop,
  };
}
