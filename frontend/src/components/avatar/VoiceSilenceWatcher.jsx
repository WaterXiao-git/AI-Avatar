import { useEffect, useRef } from "react";

export default function VoiceSilenceWatcher({
  enabled,
  silenceTimeoutMs = 15000,
  graceMs = 3000,
  speakThreshold = 0.03,
  intervalMs = 200,
  onSilenceTimeout,
  onLevel,
  getLevel,
}) {
  const startTimeRef = useRef(0);
  const lastSpokenRef = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    const now = Date.now();
    startTimeRef.current = now;
    lastSpokenRef.current = now;
    firedRef.current = false;

    const timer = window.setInterval(() => {
      const ts = Date.now();
      const level = typeof getLevel === "function" ? (getLevel() ?? 0) : 0;
      onLevel?.(level);

      if (level >= speakThreshold) {
        lastSpokenRef.current = ts;
      }

      if (ts - startTimeRef.current < graceMs) return;

      if (!firedRef.current && ts - lastSpokenRef.current >= silenceTimeoutMs) {
        firedRef.current = true;
        onSilenceTimeout?.({
          reason: "silence_timeout",
          lastSpokenAt: lastSpokenRef.current,
          now: ts,
          level,
        });
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, silenceTimeoutMs, graceMs, speakThreshold, intervalMs, onSilenceTimeout, onLevel, getLevel]);

  return null;
}
