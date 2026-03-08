import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useFBX } from "@react-three/drei";
import ShellLayout from "../components/ShellLayout";
import MarkerBoard from "../components/MarkerBoard";
import AnimationStage from "../components/AnimationStage";
import { MARKER_LABELS, MARKER_ORDER, useFlow } from "../context/FlowContext";
import { getRigStatus, listAnimations, startRig } from "../lib/api";
import { toAbsoluteUrl } from "../lib/config";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneMarkers(markers) {
  return MARKER_ORDER.reduce((acc, key) => {
    const value = markers?.[key];
    acc[key] = Array.isArray(value) ? [value[0], value[1]] : null;
    return acc;
  }, {});
}

function markersEqual(a, b) {
  return MARKER_ORDER.every((key) => {
    const va = a?.[key];
    const vb = b?.[key];
    if (!va && !vb) return true;
    if (!Array.isArray(va) || !Array.isArray(vb)) return false;
    return Number(va[0]) === Number(vb[0]) && Number(va[1]) === Number(vb[1]);
  });
}

function pickDefaultAnimation(items = []) {
  return (
    items.find((item) => /standing\s*idle/i.test(String(item?.file_name || ""))) ||
    items.find((item) => /idle/i.test(String(item?.file_name || ""))) ||
    items[0] ||
    null
  );
}

export default function RigAssistPage() {
  const navigate = useNavigate();
  const {
    modelResult,
    markers,
    setMarkers,
    selectedAnimation,
    setSelectedAnimation,
    sourceImageUrl,
    presetName,
    modelId,
  } = useFlow();

  const [activeMarker, setActiveMarker] = useState(MARKER_ORDER[0]);
  const [status, setStatus] = useState("请按顺序设置 8 个辅助点位。");
  const [animations, setAnimations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("markers");
  const [mirrorMode, setMirrorMode] = useState(false);
  const isPlacingRef = useRef(false);
  const markerHistoryRef = useRef([]);

  function setMarkersTracked(updater) {
    setMarkers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevSnapshot = cloneMarkers(prev);
      const nextSnapshot = cloneMarkers(next);
      if (!markersEqual(prevSnapshot, nextSnapshot)) {
        markerHistoryRef.current.push(prevSnapshot);
      }
      return next;
    });
  }

  function resolveAssetFetchUrl(fileUrl) {
    if (!fileUrl) return "";
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    if (String(fileUrl).startsWith("/assets/")) return toAbsoluteUrl(fileUrl);
    return fileUrl;
  }

  function preloadFbx(fileUrl) {
    const target = resolveAssetFetchUrl(fileUrl);
    if (!target) return;
    useFBX.preload(target);
    fetch(target, { cache: "force-cache" }).catch(() => {});
  }

  async function preloadFbxTask(fileUrl) {
    const target = resolveAssetFetchUrl(fileUrl);
    if (!target) return;
    useFBX.preload(target);
    await fetch(target, { cache: "force-cache" });
  }

  function preloadAvatarBundle(modelUrl, animationItems = []) {
    preloadFbx(modelUrl);
    animationItems.forEach((item) => preloadFbx(item?.file_url));
  }

  async function preloadEssentialBundle(modelUrl, animationItems = []) {
    const defaultAnim = pickDefaultAnimation(animationItems);
    const idleAnim = animationItems.find((item) => /standing\s*idle/i.test(String(item?.file_name || "")));
    const urls = [modelUrl, defaultAnim?.file_url, idleAnim?.file_url].filter(Boolean);
    await Promise.all(urls.map((url) => preloadFbxTask(url).catch(() => {})));
    return defaultAnim;
  }

  const placedCount = useMemo(
    () => MARKER_ORDER.filter((key) => Array.isArray(markers[key])).length,
    [markers],
  );

  useEffect(() => {
    if (!modelResult) {
      return;
    }
    if (isPlacingRef.current) {
      return;
    }
    const nextMissing = MARKER_ORDER.find((key) => !markers[key]);
    if (nextMissing) {
      setActiveMarker(nextMissing);
    }
  }, [markers, modelResult]);

  useEffect(() => {
    markerHistoryRef.current = [];
  }, [modelResult?.output_model_url]);

  function undoLastMarkerChange() {
    const history = markerHistoryRef.current;
    if (!history.length) {
      setStatus("没有可撤销的上一步。");
      return;
    }
    const last = history.pop();
    if (!last) {
      setStatus("没有可撤销的上一步。");
      return;
    }
    setMarkers(last);
    setStatus("已撤销上一步点位操作。");
  }

  function handleMarkerPlaced(placedKey) {
    const idx = MARKER_ORDER.indexOf(placedKey);
    setActiveMarker(MARKER_ORDER[(idx + 1 + MARKER_ORDER.length) % MARKER_ORDER.length]);
  }

  function handleMarkerCancel(key) {
    setMarkersTracked((prev) => ({ ...prev, [key]: null }));
    setActiveMarker(key);
  }

  function resetAllMarkers() {
    setMarkersTracked((prev) => {
      const next = { ...prev };
      MARKER_ORDER.forEach((key) => {
        next[key] = null;
      });
      return next;
    });
    setStatus("已重置全部点位，请重新放置。");
  }

  const markerQualityHint = useMemo(() => {
    const notes = [];
    const pairs = [
      ["wrist_left", "wrist_right", "手腕"],
      ["elbow_left", "elbow_right", "手肘"],
      ["knee_left", "knee_right", "膝盖"],
    ];

    pairs.forEach(([leftKey, rightKey, label]) => {
      const left = markers[leftKey];
      const right = markers[rightKey];
      if (!left || !right) return;
      const centerBias = Math.abs((left[0] + right[0]) / 2 - 50);
      const verticalDiff = Math.abs(left[1] - right[1]);
      if (centerBias > 10) {
        notes.push(`${label}左右整体略偏${(left[0] + right[0]) / 2 < 50 ? "左" : "右"}`);
      }
      if (verticalDiff > 10) {
        notes.push(`${label}两侧高度差稍大`);
      }
    });

    if (placedCount < 4) {
      return "提示：先完成更多关键点后再看质量建议。";
    }
    if (!notes.length) {
      return "提示：当前点位整体较平衡，可直接进入下一步。";
    }
    return `提示：${notes.slice(0, 2).join("；")}（可选微调）`;
  }, [markers, placedCount]);

  if (!modelResult?.output_model_url) {
    return <Navigate to="/create" replace />;
  }

  async function handleRig() {
    if (placedCount !== MARKER_ORDER.length) {
      setStatus("点位尚未完成，需先设置全部 8 个点位。");
      return;
    }

    setLoading(true);
    setStatus("正在执行辅助自动绑骨+重定向实现动作交互，请稍候...");
    setProgress(0);

    try {
      setProgress(6);
      preloadFbx(modelResult?.output_model_url || "");

      const payload = {
        model_url: modelResult.output_model_url,
        markers: MARKER_ORDER.reduce((acc, key) => {
          acc[key] = markers[key];
          return acc;
        }, {}),
      };

      const start = await startRig(payload);
      setProgress(12);
      let done = false;
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 550));
        const task = await getRigStatus(start.task_id);
        const rawProgress = Number(task.progress || 0);
        const rigProgress = Math.min(80, Math.round((rawProgress / 100) * 80));
        setProgress((prev) => (rigProgress > prev ? rigProgress : prev));
        if (task.status === "completed") {
          done = true;
        }
      }

      setStatus("流程已完成，正在预加载模型与关键动作...");
      const animData = await listAnimations(presetName);
      setProgress((prev) => (prev < 86 ? 86 : prev));
      preloadAvatarBundle(modelResult?.output_model_url || "/models/avatar.fbx", animData.items || []);
      const primary = await preloadEssentialBundle(modelResult?.output_model_url || "/models/avatar.fbx", animData.items || []);
      setProgress((prev) => (prev < 97 ? 97 : prev));
      setProgress(100);
      await wait(120);
      setAnimations(animData.items || []);
      setSelectedAnimation(primary || animData.items?.[0] || null);
      setPhase("preview");
      setStatus("辅助流程完成。你可以预览动作并点击确认进入交互会话。");
    } catch (error) {
      setStatus(`流程失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ShellLayout
      title="辅助绑定"
      subtitle="该页采用辅助自动绑骨+重定向实现动作交互流程，确认后进入动作预览。"
      backTo="/create"
    >
      {phase === "markers" ? (
        <div className="two-column">
          <section className="glass-panel workflow-side-panel">
            <h2>点位设置</h2>
            <p className="muted marker-target-tip">请点击：{MARKER_LABELS[activeMarker]}</p>
            <p className="muted">初始点位会集中显示在左下角，点击面板即可绑定当前点位并自动切换到下一个；支持右键取消当前点位。</p>
            <label className="mirror-toggle">
              <input
                type="checkbox"
                checked={mirrorMode}
                onChange={(event) => setMirrorMode(event.target.checked)}
              />
              <span>翻转模式</span>
            </label>
            <div className="marker-meta">
              <span>已完成 {placedCount} / 8</span>
              <div className="marker-chip-list">
                {MARKER_ORDER.map((key) => (
                  <button
                    key={key}
                    className={`marker-chip${activeMarker === key ? " active" : ""}${markers[key] ? " placed" : ""}`}
                    type="button"
                    onClick={() => setActiveMarker(key)}
                  >
                    {MARKER_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
            <div className="quality-hint">{markerQualityHint}</div>

            <div className="stack-btns">
              <button type="button" className="secondary-btn" onClick={undoLastMarkerChange}>
                撤销上一步
              </button>
              <button type="button" className="secondary-btn" onClick={resetAllMarkers}>
                重置全部点
              </button>
            </div>

            <button
              type="button"
              className="confirm-btn"
              disabled={loading || placedCount !== MARKER_ORDER.length}
              onClick={handleRig}
            >
              点击确认进入动作预览
            </button>

            <div className="status-box">{status}</div>
            {loading ? (
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
                <p>{progress}%</p>
              </div>
            ) : null}
          </section>

          <section className="glass-panel preview-panel">
            <h2>正视图点位面板</h2>
            <p className="muted">按模型正视图进行点位确认。系统将执行辅助自动绑骨+重定向实现动作交互后进入动作预览。</p>
            <MarkerBoard
              markers={markers}
              setMarkers={setMarkersTracked}
              activeMarker={activeMarker}
              backgroundImage={sourceImageUrl}
              mirrorMode={mirrorMode}
              onMarkerPlaced={handleMarkerPlaced}
              onMarkerCancel={handleMarkerCancel}
              onPlacingChange={(isPlacing) => {
                isPlacingRef.current = isPlacing;
              }}
            />
          </section>
        </div>
      ) : (
        <div className="single-column">
          <section className="glass-panel rig-animation-panel workflow-fixed-panel">
            <h2>动作预览</h2>
            <p className="muted">动作文件直接来自“animations”目录（FBX）。点击动作名称可预览。</p>
            <AnimationStage
              animations={animations}
              selectedAnimation={selectedAnimation}
              onSelect={setSelectedAnimation}
              avatarModelUrl={modelResult?.output_model_url || "/models/avatar.fbx"}
              actionBasePath={presetName ? `/assets/presets/${presetName}/animations` : "/animations"}
              previewAnimationUrl={selectedAnimation?.file_url || ""}
            />
            <div className="row-btns" style={{ marginTop: 16 }}>
              <button type="button" className="secondary-btn" onClick={() => setPhase("markers")}>
                返回点位页
              </button>
              <button
                type="button"
                className="confirm-btn"
                onClick={() => navigate("/scene-preview", { state: { modelId } })}
              >
                点击确认进入场景预览
              </button>
            </div>
          </section>
        </div>
      )}
    </ShellLayout>
  );
}
