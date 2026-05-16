import { useCallback, useMemo, useReducer, useState } from "react";

const SESSION_PHASE = {
  IDLE: "idle",
  CONNECTING: "connecting",
  ACTIVE: "active",
  ENDING: "ending",
};

const SESSION_PHASE_TRANSITIONS = {
  [SESSION_PHASE.IDLE]: [SESSION_PHASE.CONNECTING],
  [SESSION_PHASE.CONNECTING]: [SESSION_PHASE.ACTIVE, SESSION_PHASE.ENDING, SESSION_PHASE.IDLE],
  [SESSION_PHASE.ACTIVE]: [SESSION_PHASE.ENDING],
  [SESSION_PHASE.ENDING]: [SESSION_PHASE.IDLE],
};

function sessionPhaseReducer(state, action) {
  const next = action?.type;
  if (!next || state === next) return state;
  return SESSION_PHASE_TRANSITIONS[state]?.includes(next) ? next : state;
}

export function useSessionMachine() {
  const [sessionPhase, dispatchSessionPhase] = useReducer(sessionPhaseReducer, SESSION_PHASE.IDLE);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);

  const isConnecting = sessionPhase === SESSION_PHASE.CONNECTING;
  const isSessionActive = sessionPhase === SESSION_PHASE.ACTIVE;

  const setPhase = useCallback((phase) => {
    dispatchSessionPhase({ type: phase });
  }, []);

  const markConnecting = useCallback(() => setPhase(SESSION_PHASE.CONNECTING), [setPhase]);
  const markActive = useCallback(() => setPhase(SESSION_PHASE.ACTIVE), [setPhase]);
  const markEnding = useCallback(() => setPhase(SESSION_PHASE.ENDING), [setPhase]);
  const markIdle = useCallback(() => setPhase(SESSION_PHASE.IDLE), [setPhase]);

  return useMemo(
    () => ({
      sessionPhase,
      isConnecting,
      isSessionActive,
      isVoiceConnected,
      setIsVoiceConnected,
      setPhase,
      markConnecting,
      markActive,
      markEnding,
      markIdle,
      SESSION_PHASE,
    }),
    [sessionPhase, isConnecting, isSessionActive, isVoiceConnected, setPhase, markConnecting, markActive, markEnding, markIdle],
  );
}
