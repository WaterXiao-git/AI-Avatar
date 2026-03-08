import { useEffect, useMemo, useRef, useState } from "react";
import { MARKER_LABELS, MARKER_ORDER } from "../context/FlowContext";

const defaultMap = MARKER_ORDER.reduce((acc, key, index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  acc[key] = [7 + col * 10, 70 + row * 8];
  return acc;
}, {});

function markerPart(key) {
  if (String(key).includes("wrist")) return "wrist";
  if (String(key).includes("elbow")) return "elbow";
  if (String(key).includes("knee")) return "knee";
  if (String(key).includes("chin")) return "chin";
  if (String(key).includes("groin")) return "groin";
  return "general";
}

export default function MarkerBoard({
  markers,
  setMarkers,
  activeMarker,
  backgroundImage = "",
  mirrorMode = false,
  onMarkerPlaced,
  onMarkerCancel,
  onPlacingChange,
}) {
  const boardRef = useRef(null);
  const zoomCanvasRef = useRef(null);
  const zoomImageRef = useRef(null);
  const [pointerVisual, setPointerVisual] = useState(null);
  const [dragPreviewPoint, setDragPreviewPoint] = useState(null);
  const [boardSize, setBoardSize] = useState({ width: 1, height: 1 });
  const [imageRatio, setImageRatio] = useState(null);
  const [imageReady, setImageReady] = useState(false);
  const draggingRef = useRef(false);
  const draggingMarkerKeyRef = useRef(null);
  const draggingPointRef = useRef(null);
  const dragStartClientRef = useRef(null);

  useEffect(() => {
    if (!boardRef.current) return undefined;
    const update = () => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      setBoardSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(boardRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!backgroundImage) {
      zoomImageRef.current = null;
      const frame = window.requestAnimationFrame(() => {
        setImageRatio(null);
        setImageReady(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const img = new Image();
    img.onload = () => {
      if (!img.width || !img.height) return;
      zoomImageRef.current = img;
      setImageRatio(img.width / img.height);
      setImageReady(true);
    };
    img.onerror = () => {
      zoomImageRef.current = null;
      setImageRatio(null);
      setImageReady(false);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  const contentBox = useMemo(() => {
    const { width, height } = boardSize;
    if (!backgroundImage || !imageRatio || !width || !height) {
      return { leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 };
    }

    const boardRatio = width / height;
    if (boardRatio > imageRatio) {
      const contentWidth = (height * imageRatio) / width;
      const left = (1 - contentWidth) / 2;
      return { leftPct: left * 100, topPct: 0, widthPct: contentWidth * 100, heightPct: 100 };
    }

    const contentHeight = (width / imageRatio) / height;
    const top = (1 - contentHeight) / 2;
    return { leftPct: 0, topPct: top * 100, widthPct: 100, heightPct: contentHeight * 100 };
  }, [backgroundImage, boardSize, imageRatio]);

  useEffect(() => {
    const canvas = zoomCanvasRef.current;
    const image = zoomImageRef.current;
    if (!canvas || !image || !pointerVisual || !imageReady) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const zoom = 2.6;
    const contentWidthPx = boardSize.width * (contentBox.widthPct / 100);
    const contentHeightPx = boardSize.height * (contentBox.heightPct / 100);
    const mapScaleX = image.width / Math.max(1, contentWidthPx);
    const mapScaleY = image.height / Math.max(1, contentHeightPx);

    const lensWidthCss = Math.max(1, rect.width);
    const lensHeightCss = Math.max(1, rect.height);
    const srcW = (lensWidthCss / zoom) * mapScaleX;
    const srcH = (lensHeightCss / zoom) * mapScaleY;
    const cx = (pointerVisual.imageX / 100) * image.width;
    const cy = (pointerVisual.imageY / 100) * image.height;
    const sx = Math.max(0, Math.min(image.width - srcW, cx - srcW / 2));
    const sy = Math.max(0, Math.min(image.height - srcH, cy - srcH / 2));

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, sx, sy, srcW, srcH, 0, 0, width, height);
  }, [pointerVisual, imageReady, boardSize, contentBox]);

  function toBoardPosition(value) {
    return [Number(value[0]) || 0, Number(value[1]) || 0];
  }

  const stagingZoneStyle = useMemo(
    () => ({
      left: "2%",
      top: "66%",
      width: "21%",
      height: "32%",
    }),
    [],
  );

  const points = useMemo(() => {
    return MARKER_ORDER.map((key) => {
      const usePreview = key === activeMarker && Array.isArray(dragPreviewPoint);
      const val = usePreview ? dragPreviewPoint : markers[key] || defaultMap[key];
      return { key, x: val[0], y: val[1] };
    });
  }, [activeMarker, dragPreviewPoint, markers]);

  function eventToPercent(event) {
    const rect = boardRef.current.getBoundingClientRect();
    let x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    if (mirrorMode) {
      x = 100 - x;
    }
    return [Math.max(4, Math.min(96, x)), Math.max(4, Math.min(96, y))];
  }

  function eventToVisualPercent(event) {
    const rect = boardRef.current.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
    const localX = (rawX - contentBox.leftPct) / Math.max(0.001, contentBox.widthPct);
    const localY = (rawY - contentBox.topPct) / Math.max(0.001, contentBox.heightPct);
    if (localX < 0 || localX > 1 || localY < 0 || localY > 1) {
      return null;
    }
    const xInImage = localX * 100;
    const yInImage = localY * 100;
    return {
      imageX: mirrorMode ? 100 - xInImage : xInImage,
      imageY: yInImage,
    };
  }

  function commitMarker(key, value, autoAdvance = false) {
    setMarkers((prev) => ({ ...prev, [key]: [Number(value[0].toFixed(2)), Number(value[1].toFixed(2))] }));
    if (autoAdvance) {
      onMarkerPlaced?.(key);
    }
  }

  function onBoardPointerDown(event) {
    if (!boardRef.current) return;
    if (!activeMarker) return;
    const activeDefaultPoint = markers[activeMarker] || defaultMap[activeMarker] || null;
    const isActiveMarkerButton = event.target?.closest?.(".marker-dot.active");
    const point = eventToPercent(event) || (isActiveMarkerButton ? activeDefaultPoint : null);
    if (!point) return;
    draggingRef.current = true;
    draggingMarkerKeyRef.current = activeMarker;
    draggingPointRef.current = point;
    dragStartClientRef.current = { x: event.clientX, y: event.clientY };
    setDragPreviewPoint(point);
    setPointerVisual(eventToVisualPercent(event));
    onPlacingChange?.(true);
    boardRef.current?.setPointerCapture?.(event.pointerId);
  }

  function onBoardMove(event) {
    const visualPoint = eventToVisualPercent(event);
    setPointerVisual(visualPoint);

    if (!draggingRef.current || !draggingMarkerKeyRef.current) {
      return;
    }

    const start = dragStartClientRef.current;
    if (start) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (dx * dx + dy * dy < 16) {
        return;
      }
    }

    const point = eventToPercent(event);
    if (!point) {
      return;
    }
    draggingPointRef.current = point;
    setDragPreviewPoint(point);
  }

  function onBoardPointerUp(event) {
    if (!draggingRef.current) {
      return;
    }
    const markerKey = draggingMarkerKeyRef.current;
    draggingRef.current = false;
    draggingMarkerKeyRef.current = null;
    dragStartClientRef.current = null;
    onPlacingChange?.(false);

    const point = draggingPointRef.current || eventToPercent(event);
    draggingPointRef.current = null;

    boardRef.current?.releasePointerCapture?.(event.pointerId);

    if (!markerKey) {
      setPointerVisual(null);
      setDragPreviewPoint(null);
      return;
    }

    if (!point) {
      setPointerVisual(null);
      setDragPreviewPoint(null);
      return;
    }
    setPointerVisual(eventToVisualPercent(event));
    setDragPreviewPoint(null);
    commitMarker(markerKey, point, true);
  }

  function onBoardPointerCancel() {
    draggingRef.current = false;
    draggingMarkerKeyRef.current = null;
    draggingPointRef.current = null;
    dragStartClientRef.current = null;
    setDragPreviewPoint(null);
    setPointerVisual(null);
    onPlacingChange?.(false);
  }

  function onBoardLeave() {
    if (draggingRef.current) return;
    setPointerVisual(null);
  }

  function onContextMenu(event) {
    event.preventDefault();
    if (!activeMarker) return;
    onMarkerCancel?.(activeMarker);
  }

  const activePoint = markers[activeMarker] || defaultMap[activeMarker] || [50, 50];
  const focusPoint = activePoint;
  const lensPoint = pointerVisual;

  return (
    <div
      ref={boardRef}
      className={mirrorMode ? "marker-board mirror" : "marker-board"}
      style={
        backgroundImage
          ? {
              backgroundImage: `linear-gradient(170deg, rgba(247,253,255,0.45), rgba(222,239,250,0.45)), url(${backgroundImage})`,
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
      onPointerDown={onBoardPointerDown}
      onPointerMove={onBoardMove}
      onPointerUp={onBoardPointerUp}
      onPointerCancel={onBoardPointerCancel}
      onPointerLeave={onBoardLeave}
      onContextMenu={onContextMenu}
      role="presentation"
    >
      {!backgroundImage ? <div className="marker-silhouette" /> : null}
      <div className="marker-staging-zone" style={stagingZoneStyle} aria-hidden="true" />

      {points.map((point) => {
        const isActive = point.key === activeMarker;
        const isPlaced = !!markers[point.key];
        const part = markerPart(point.key);
        const [boardX, boardY] = toBoardPosition([point.x, point.y]);
        return (
          <button
            key={point.key}
            className={`marker-dot marker-part-${part}${isActive ? " active" : ""}${isPlaced ? " placed" : ""}`}
            style={{ left: `${boardX}%`, top: `${boardY}%` }}
            type="button"
            title={MARKER_LABELS[point.key]}
          >
            <span>{MARKER_LABELS[point.key]}</span>
          </button>
        );
      })}

      <div
        className="target-hint"
        style={{
          left: `${toBoardPosition(activePoint)[0]}%`,
          top: `${toBoardPosition(activePoint)[1]}%`,
        }}
      />

      <div className={`zoom-lens${lensPoint && imageReady ? "" : " hidden"}`}>
        <canvas ref={zoomCanvasRef} className="zoom-canvas" />
        <div className="zoom-crosshair" />
        <div className="zoom-label">
          <strong>{MARKER_LABELS[activeMarker]}</strong>
          <span>
            中心点 {(lensPoint?.imageX ?? focusPoint[0]).toFixed(1)}%, {(lensPoint?.imageY ?? focusPoint[1]).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
