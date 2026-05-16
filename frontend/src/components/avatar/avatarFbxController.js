import * as THREE from "three";

/* eslint-disable no-empty */
export function createAvatarFbxController({
  actions,
  mixer,
  setIsWaving,
  setIsWavingExternal,
  TALK_WEIGHTS,
  weightedPick,
}) {
  const FADE_BASE = 0.22;
  const FADE_WAVE = 0.28;
  const FADE_INTERRUPT = 0.18;
  const TALK_HANGOVER_MS = 650;
  const WAVE_COOLDOWN_MS = 1200;
  const MIN_MAIN_SWITCH_GAP_MS = 220;
  const WARM_ENTRY_GUARD_MS = 340;
  const LISTENING_ENTRY_DELAY_MS = 110;
  const IDLE_FLOOR_WEIGHT = 0.72;
  const WAVE_IDLE_FENCE_WEIGHT = 0.08;
  const WAVE_ACTIVE_IDLE_WEIGHT = 0;
  const WAVE_EXIT_IDLE_FLOOR = 0.2;
  const WAVE_START_GUARD_MS = 100;
  const WAVE_EXIT_RATIO = 0.96;
  const LISTENING_BLEND_WEIGHT = 0.62;
  const TALKING_BLEND_WEIGHT = 0.68;

  const state = {
    mode: "idle",
    currentTalkKey: null,
    waveLocked: false,
    waveCooldownUntil: 0,
    lastInterruptSeq: 0,
    interruptCooldownUntil: 0,
    cleanupListeningOnce: null,
    cleanupWave: null,
    talkingHoldUntil: 0,
    currentMainAction: null,
    sessionEnded: false,
    warmEntryUntil: 0,
    waveGuardUntil: 0,
    lastMainSwitchAt: 0,
    pendingMode: null,
    pendingModeAt: 0,
  };

  const stopTimers = new WeakMap();

  const clearStopTimer = (action) => {
    const timer = stopTimers.get(action);
    if (timer) clearTimeout(timer);
    stopTimers.delete(action);
  };

  const softStop = (action, fade = FADE_BASE) => {
    if (!action) return;
    clearStopTimer(action);
    try {
      action.fadeOut(fade);
    } catch {}
  };

  const hardStopNow = (action) => {
    if (!action) return;
    clearStopTimer(action);
    try {
      action.stop();
      action.enabled = false;
      action.paused = false;
      action.setEffectiveWeight?.(0);
      action.setEffectiveTimeScale?.(1);
    } catch {}
  };

  const prepLoop = (action) => {
    action.enabled = true;
    action.paused = false;
    action.setEffectiveTimeScale(1);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  };

  const prepOnce = (action) => {
    action.enabled = true;
    action.paused = false;
    action.setEffectiveTimeScale(1);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  };

  const ensureIdleRunning = () => {
    const idle = actions?.Idle;
    if (!idle) return;
    try {
      idle.enabled = true;
      idle.paused = false;
      idle.setEffectiveTimeScale(1);
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.clampWhenFinished = false;
      if (!idle.isRunning()) {
        idle.reset();
        idle.setEffectiveWeight(1);
        idle.fadeIn(0.12).play();
      }
    } catch {}
  };

  const ensureIdleFloor = () => {
    const idle = actions?.Idle;
    if (!idle) return;
    ensureIdleRunning();
    try {
      const now = Date.now();
      const guarded = now < state.warmEntryUntil || now < state.waveGuardUntil;
      const targetFloor = state.mode === "wave"
        ? WAVE_ACTIVE_IDLE_WEIGHT
        : guarded
          ? Math.max(IDLE_FLOOR_WEIGHT, 0.78)
          : IDLE_FLOOR_WEIGHT;
      const weight = idle.getEffectiveWeight?.() ?? 1;
      if (weight < targetFloor) {
        idle.enabled = true;
        idle.setEffectiveWeight(targetFloor);
      }
    } catch {}
  };

  const canSwitchMain = (now = Date.now()) => now - state.lastMainSwitchAt >= MIN_MAIN_SWITCH_GAP_MS;

  const schedulePendingMode = (mode, now = Date.now()) => {
    state.pendingMode = mode;
    state.pendingModeAt = now;
  };

  const resolveMainWeight = (key) => {
    if (key === "Listening") return LISTENING_BLEND_WEIGHT;
    if (/^Talking/i.test(String(key || ""))) return TALKING_BLEND_WEIGHT;
    return 1;
  };

  const transitionMainTo = (nextKey, { fade = FADE_BASE, reset = true, once = false } = {}) => {
    const next = actions?.[nextKey];
    if (!next || state.sessionEnded) return false;
    if (state.currentMainAction === next && next.isRunning()) return true;

    clearStopTimer(next);

    try {
      const targetWeight = resolveMainWeight(nextKey);
      if (once) {
        prepOnce(next);
        next.setEffectiveWeight(targetWeight);
        next.reset();
        next.fadeIn(fade).play();
      } else {
        prepLoop(next);
        next.setEffectiveWeight(targetWeight);
        if (reset) next.reset();
        if (!next.isRunning()) next.fadeIn(fade).play();
      }
    } catch {
      return false;
    }

    const prev = state.currentMainAction;
    if (prev && prev !== next) {
      try {
        prev.crossFadeTo(next, fade, false);
      } catch {
        prev.fadeOut?.(fade);
      }
      try {
        prev.fadeOut(fade);
      } catch {}
    }

    state.currentMainAction = next;
    state.lastMainSwitchAt = Date.now();
    return true;
  };

  const flushPendingMode = (now = Date.now()) => {
    if (!state.pendingMode) return false;
    if (state.mode === "wave" || now < state.waveGuardUntil) return false;
    if (!canSwitchMain(now)) return false;
    const pending = state.pendingMode;
    state.pendingMode = null;
    state.pendingModeAt = 0;
    if (pending === "talking") {
      startTalkingLoop(now);
      return true;
    }
    if (pending === "listening") {
      startListeningLoop(now, { force: true });
      return true;
    }
    if (pending === "idle") {
      backToIdle(FADE_BASE, now);
      return true;
    }
    return false;
  };

  const stopAllTalking = () => {
    ["Talking1", "Talking2", "Talking3"].forEach((key) => softStop(actions?.[key], FADE_BASE));
    state.currentTalkKey = null;
  };

  const stopListeningLoop = () => softStop(actions?.Listening, FADE_BASE);

  const backToIdle = (fade = FADE_BASE, now = Date.now()) => {
    if (state.sessionEnded) return;
    if (!canSwitchMain(now) && state.mode !== "idle") {
      schedulePendingMode("idle", now);
      ensureIdleFloor();
      return;
    }
    if (state.currentMainAction) {
      softStop(state.currentMainAction, fade);
      state.currentMainAction = null;
    }
    stopAllTalking();
    stopListeningLoop();
    state.mode = "idle";
    state.currentTalkKey = null;
    state.lastMainSwitchAt = now;
    ensureIdleFloor();
  };

  let blendGuardRAF = 0;
  let waveStartGuardRAF = 0;

  const cancelWaveToIdleGuard = () => {
    if (blendGuardRAF) {
      cancelAnimationFrame(blendGuardRAF);
      blendGuardRAF = 0;
    }
  };

  const cancelWaveStartGuard = () => {
    if (waveStartGuardRAF) {
      cancelAnimationFrame(waveStartGuardRAF);
      waveStartGuardRAF = 0;
    }
  };

  const startWaveStartGuard = (idle, ms = WAVE_START_GUARD_MS) => {
    if (!idle) return;
    cancelWaveStartGuard();
    const t0 = performance.now();
    const tick = (now) => {
      if (state.sessionEnded || state.mode !== "wave") {
        waveStartGuardRAF = 0;
        return;
      }
      try {
        idle.enabled = true;
        idle.paused = false;
        const weight = idle.getEffectiveWeight?.() ?? 0;
        if (weight < WAVE_IDLE_FENCE_WEIGHT) {
          idle.setEffectiveWeight(WAVE_IDLE_FENCE_WEIGHT);
        }
      } catch {}

      if (now - t0 < ms) {
        waveStartGuardRAF = requestAnimationFrame(tick);
      } else {
        try {
          idle.setEffectiveWeight(WAVE_ACTIVE_IDLE_WEIGHT);
          if (WAVE_ACTIVE_IDLE_WEIGHT <= 0) {
            idle.fadeOut?.(0.08);
          }
        } catch {}
        waveStartGuardRAF = 0;
      }
    };

    waveStartGuardRAF = requestAnimationFrame(tick);
  };

  const startWaveToIdleGuard = (wave, idle, ms = 280) => {
    cancelWaveToIdleGuard();
    cancelWaveStartGuard();
    const t0 = performance.now();
    const floor = WAVE_EXIT_IDLE_FLOOR;

    try {
      idle.enabled = true;
      idle.paused = false;
      idle.setEffectiveWeight(Math.max(floor, idle.getEffectiveWeight?.() ?? floor));
      wave.enabled = true;
      wave.paused = false;
      wave.setEffectiveWeight(Math.min(1 - floor, wave.getEffectiveWeight?.() ?? 1 - floor));
    } catch {}

    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const idleW = Math.max(floor, floor + (1 - floor) * t);
      const waveW = (1 - floor) * (1 - t);

      try {
        idle.enabled = true;
        idle.paused = false;
        idle.setEffectiveWeight(idleW);
        wave.enabled = true;
        wave.paused = false;
        wave.setEffectiveWeight(waveW);
      } catch {}

      if (t < 1) {
        blendGuardRAF = requestAnimationFrame(tick);
      } else {
        try {
          idle.setEffectiveWeight(1);
          wave.setEffectiveWeight(0);
          wave.stop();
          wave.enabled = false;
        } catch {}
        blendGuardRAF = 0;
      }
    };

    blendGuardRAF = requestAnimationFrame(tick);
  };

  const crossFadeToIdleWithGuard = (wave, fade = FADE_WAVE) => {
    const idle = actions?.Idle;
    if (!idle || !wave) return;

    ensureIdleRunning();
    try {
      idle.enabled = true;
      idle.paused = false;
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.clampWhenFinished = false;
      if (!idle.isRunning()) idle.play();
      idle.setEffectiveWeight(1);
      wave.crossFadeTo(idle, fade, true);
    } catch {}

    startWaveToIdleGuard(wave, idle, Math.ceil(fade * 1000));
    ensureIdleFloor();
  };

  const startTalkingLoop = (now = Date.now()) => {
    const wave = actions?.Wave;
    if (state.mode === "wave" || (wave && wave.isRunning()) || now < state.waveGuardUntil) {
      schedulePendingMode("talking", now);
      ensureIdleFloor();
      return;
    }
    if (state.mode === "listening") stopListeningLoop();
    if (state.mode === "talking" && state.currentTalkKey) {
      const current = actions?.[state.currentTalkKey];
      if (current && current.isRunning()) return ensureIdleFloor();
    }
    if (!canSwitchMain(now)) {
      schedulePendingMode("talking", now);
      ensureIdleFloor();
      return;
    }
    const pick = state.currentTalkKey || weightedPick(TALK_WEIGHTS);
    const talk = actions?.[pick];
    if (!talk) return backToIdle(0.18);

    stopAllTalking();
    state.currentTalkKey = pick;
    state.mode = "talking";
    transitionMainTo(pick, { fade: 0.18, reset: true, once: false });
    ensureIdleFloor();
  };

  const playListeningOnceThenIdle = () => {
    const listen = actions?.Listening;
    if (!listen || state.mode === "listening") return null;

    state.mode = "listening";
    stopAllTalking();
    transitionMainTo("Listening", { fade: FADE_INTERRUPT, reset: true, once: true });
    ensureIdleFloor();

    const back = () => !state.sessionEnded && backToIdle(FADE_BASE);
    const onFinished = (event) => {
      const name = event?.action?._clip?.name || event?.action?.getClip?.()?.name;
      if (name === "Listening") back();
    };

    mixer?.addEventListener("finished", onFinished);
    const duration = listen.getClip()?.duration ?? 1.6;
    const timer = setTimeout(() => back(), Math.ceil(duration * 1000) + 220);

    return () => {
      mixer?.removeEventListener("finished", onFinished);
      clearTimeout(timer);
    };
  };

  const startListeningLoop = (now = Date.now(), { force = false } = {}) => {
    const wave = actions?.Wave;
    if (state.mode === "wave" || (wave && wave.isRunning()) || now < state.waveGuardUntil) {
      schedulePendingMode("listening", now);
      ensureIdleFloor();
      return;
    }
    if (state.mode === "talking") stopAllTalking();
    if (!force) {
      if (now < state.warmEntryUntil + LISTENING_ENTRY_DELAY_MS) {
        schedulePendingMode("listening", now);
        ensureIdleFloor();
        return;
      }
      if (!canSwitchMain(now)) {
        schedulePendingMode("listening", now);
        ensureIdleFloor();
        return;
      }
    }
    const entering = state.mode !== "listening";
    state.mode = "listening";
    transitionMainTo("Listening", { fade: FADE_BASE, reset: entering, once: false });
    ensureIdleFloor();
  };

  const startWaveOnce = () => {
    const wave = actions?.Wave;
    if (!wave) {
      setIsWaving?.(false);
      setIsWavingExternal?.(false);
      state.waveLocked = false;
      return backToIdle(FADE_BASE);
    }

    const now = Date.now();
    if (now < state.waveCooldownUntil || state.waveLocked) return;

    cancelWaveToIdleGuard();
    cancelWaveStartGuard();
    state.waveLocked = true;
    state.mode = "wave";
    state.pendingMode = null;
    state.pendingModeAt = 0;
    stopAllTalking();
    stopListeningLoop();

    transitionMainTo("Wave", { fade: 0.12, reset: true, once: true });
    try {
      mixer?.update(1 / 120);
    } catch {}
    const idle = actions?.Idle;
    if (idle) {
      try {
        idle.enabled = true;
        idle.paused = false;
        idle.setEffectiveWeight(Math.max(WAVE_IDLE_FENCE_WEIGHT, idle.getEffectiveWeight?.() ?? 0));
      } catch {}
      startWaveStartGuard(idle, WAVE_START_GUARD_MS);
    }

    let exited = false;
    const doExit = () => {
      if (exited || state.sessionEnded) return;
      exited = true;
      cancelWaveStartGuard();
      crossFadeToIdleWithGuard(wave, FADE_WAVE);
      state.currentMainAction = null;
      state.waveLocked = false;
      state.mode = "idle";
      state.waveGuardUntil = Date.now() + WARM_ENTRY_GUARD_MS;
      setIsWaving?.(false);
      setIsWavingExternal?.(false);
      state.waveCooldownUntil = Date.now() + WAVE_COOLDOWN_MS;
      flushPendingMode(Date.now());
    };

    const duration = wave.getClip()?.duration ?? 2.5;
    const durationMs = duration * 1000;
    const tRatio = Math.floor(durationMs * WAVE_EXIT_RATIO);
    const tFade = Math.floor(Math.max(0, durationMs - FADE_WAVE * 1000 - 60));
    const exitAt = Math.max(50, Math.min(tRatio, tFade));
    const timerExit = setTimeout(() => doExit(), exitAt);

    const onFinished = (event) => {
      const name = event?.action?._clip?.name || event?.action?.getClip?.()?.name;
      if (name === "Wave") doExit();
    };

    mixer?.addEventListener("finished", onFinished);
    state.cleanupWave = () => {
      clearTimeout(timerExit);
      mixer?.removeEventListener("finished", onFinished);
    };
  };

  const endSessionNow = () => {
    state.sessionEnded = true;
    cancelWaveToIdleGuard();
    cancelWaveStartGuard();
    try {
      state.cleanupListeningOnce?.();
    } catch {}
    try {
      state.cleanupWave?.();
    } catch {}
    state.cleanupListeningOnce = null;
    state.cleanupWave = null;
    state.waveLocked = false;
    state.currentTalkKey = null;
    state.mode = "idle";
    state.talkingHoldUntil = 0;
    state.currentMainAction = null;
    state.pendingMode = null;
    state.pendingModeAt = 0;
    state.waveGuardUntil = 0;
    state.warmEntryUntil = 0;
    state.lastMainSwitchAt = 0;

    ["Wave", "Listening", "Talking1", "Talking2", "Talking3"].forEach((key) => {
      const action = actions?.[key];
      if (action) hardStopNow(action);
    });

    const idle = actions?.Idle;
    if (idle) {
      try {
        idle.enabled = true;
        idle.paused = false;
        idle.setEffectiveWeight(1);
        idle.setEffectiveTimeScale(1);
        idle.reset();
        idle.setLoop(THREE.LoopRepeat, Infinity);
        idle.clampWhenFinished = false;
        idle.play();
      } catch {}
    }

    setIsWaving?.(false);
    setIsWavingExternal?.(false);
  };

  const beginSessionNow = () => {
    if (!state.sessionEnded && state.warmEntryUntil) {
      ensureIdleRunning();
      ensureIdleFloor();
      return;
    }
    state.sessionEnded = false;
    state.mode = "idle";
    state.currentTalkKey = null;
    state.currentMainAction = null;
    state.pendingMode = null;
    state.pendingModeAt = 0;
    state.waveGuardUntil = 0;
    state.warmEntryUntil = Date.now() + WARM_ENTRY_GUARD_MS;
    state.lastMainSwitchAt = 0;
    ensureIdleRunning();
    ensureIdleFloor();
  };

  ensureIdleRunning();
  ensureIdleFloor();

  return {
    update({ isWaving, isTalking, interruptSeq, userSpeaking }) {
      const now = Date.now();
      if (state.sessionEnded) {
        ensureIdleFloor();
        return;
      }
      if (isWaving) {
        startWaveOnce();
        return;
      }
      if (flushPendingMode(now)) {
        ensureIdleFloor();
        return;
      }
      if (userSpeaking) {
        startListeningLoop(now);
        ensureIdleFloor();
        return;
      }
      if (isTalking) {
        state.talkingHoldUntil = now + TALK_HANGOVER_MS;
      } else if (now < state.talkingHoldUntil) {
        isTalking = true;
      }

      if (
        interruptSeq &&
        interruptSeq !== state.lastInterruptSeq &&
        now >= state.interruptCooldownUntil
      ) {
        state.lastInterruptSeq = interruptSeq;
        const wave = actions?.Wave;
        const waveRunning = state.mode === "wave" || (wave && wave.isRunning());
        const canInterrupt = !waveRunning && (isTalking || state.mode === "talking");
        if (canInterrupt) {
          stopAllTalking();
          state.cleanupListeningOnce = playListeningOnceThenIdle();
          state.interruptCooldownUntil = now + 400;
        }
        ensureIdleFloor();
        return;
      }

      if (isTalking) {
        startTalkingLoop(now);
        ensureIdleFloor();
        return;
      }

      if (state.mode !== "idle") backToIdle(FADE_BASE, now);
      ensureIdleFloor();
    },
    endSessionNow,
    beginSessionNow,
    dispose() {
      cancelWaveToIdleGuard();
      cancelWaveStartGuard();
      try {
        state.cleanupListeningOnce?.();
        state.cleanupWave?.();
      } catch {}
      ["Idle", "Wave", "Listening", "Talking1", "Talking2", "Talking3"].forEach((key) => {
        const action = actions?.[key];
        if (action) clearStopTimer(action);
      });
    },
  };
}
