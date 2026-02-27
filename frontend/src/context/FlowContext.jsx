import { createContext, useContext, useMemo, useState } from "react";

const FlowContext = createContext(null);

const initialMarkers = {
  chin: null,
  groin: null,
  wrist_left: null,
  wrist_right: null,
  elbow_left: null,
  elbow_right: null,
  knee_left: null,
  knee_right: null,
};

export function FlowProvider({ children }) {
  const [modelResult, setModelResult] = useState(null);
  const [markers, setMarkers] = useState(initialMarkers);
  const [selectedAnimation, setSelectedAnimation] = useState(null);
  const [sourceImageUrl, setSourceImageUrl] = useState("");

  const resetMarkers = () => setMarkers(initialMarkers);

  const value = useMemo(
    () => ({
      modelResult,
      setModelResult,
      markers,
      setMarkers,
      resetMarkers,
      selectedAnimation,
      setSelectedAnimation,
      sourceImageUrl,
      setSourceImageUrl,
    }),
    [modelResult, markers, selectedAnimation, sourceImageUrl],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error("useFlow must be used inside FlowProvider");
  }
  return context;
}

export const MARKER_ORDER = [
  "chin",
  "groin",
  "wrist_left",
  "wrist_right",
  "elbow_left",
  "elbow_right",
  "knee_left",
  "knee_right",
];

export const MARKER_LABELS = {
  chin: "Chin",
  groin: "Groin",
  wrist_left: "Left Wrist",
  wrist_right: "Right Wrist",
  elbow_left: "Left Elbow",
  elbow_right: "Right Elbow",
  knee_left: "Left Knee",
  knee_right: "Right Knee",
};
