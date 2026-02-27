import { useMemo, useRef, useState } from "react";
import { MARKER_LABELS, MARKER_ORDER } from "../context/FlowContext";

const defaultMap = {
  chin: [50, 16],
  groin: [50, 56],
  wrist_left: [28, 36],
  wrist_right: [72, 36],
  elbow_left: [35, 31],
  elbow_right: [65, 31],
  knee_left: [44, 73],
  knee_right: [56, 73],
};

export default function MarkerBoard({ markers, setMarkers, activeMarker, backgroundImage = "" }) {
  const boardRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  const points = useMemo(() => {
    return MARKER_ORDER.map((key) => {
      const val = markers[key] || defaultMap[key];
      return { key, x: val[0], y: val[1] };
    });
  }, [markers]);

  function eventToPercent(event) {
    const rect = boardRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    return [Math.max(4, Math.min(96, x)), Math.max(4, Math.min(96, y))];
  }

  function commitMarker(key, value) {
    setMarkers((prev) => ({ ...prev, [key]: [Number(value[0].toFixed(2)), Number(value[1].toFixed(2))] }));
  }

  function snapMarker(key, value) {
    const [x, y] = value;
    const [ax, ay] = defaultMap[key];
    const dx = x - ax;
    const dy = y - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5.6) {
      return [ax, ay];
    }
    return value;
  }

  function onBoardClick(event) {
    if (!activeMarker || dragging) {
      return;
    }
    commitMarker(activeMarker, snapMarker(activeMarker, eventToPercent(event)));
  }

  function onDragStart(event, key) {
    event.stopPropagation();
    setDragging(key);
  }

  function onPointerMove(event) {
    if (!dragging) {
      return;
    }
    commitMarker(dragging, snapMarker(dragging, eventToPercent(event)));
  }

  function onPointerUp() {
    setDragging(null);
  }

  return (
    <div
      ref={boardRef}
      className="marker-board"
      style={
        backgroundImage
          ? {
              backgroundImage: `linear-gradient(170deg, rgba(247,253,255,0.45), rgba(222,239,250,0.45)), url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
      onClick={onBoardClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      role="presentation"
    >
      {!backgroundImage ? <div className="marker-silhouette" /> : null}

      {points.map((point) => {
        const isActive = point.key === activeMarker;
        const isPlaced = !!markers[point.key];
        const canDrag = isActive;
        return (
          <button
            key={point.key}
            className={`marker-dot${isActive ? " active" : ""}${isPlaced ? " placed" : ""}${canDrag ? " drag-enabled" : ""}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onPointerDown={(event) => {
              if (canDrag) {
                onDragStart(event, point.key);
              }
            }}
            type="button"
            title={MARKER_LABELS[point.key]}
          >
            <span>{MARKER_LABELS[point.key].slice(0, 1)}</span>
          </button>
        );
      })}

      <div className="active-guide" style={{ left: `${(markers[activeMarker] || defaultMap[activeMarker])[0]}%`, top: `${(markers[activeMarker] || defaultMap[activeMarker])[1]}%` }} />
    </div>
  );
}
