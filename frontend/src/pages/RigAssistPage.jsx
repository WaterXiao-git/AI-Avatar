import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import ShellLayout from "../components/ShellLayout";
import MarkerBoard from "../components/MarkerBoard";
import AnimationStage from "../components/AnimationStage";
import { MARKER_LABELS, MARKER_ORDER, useFlow } from "../context/FlowContext";
import { getFakeRigStatus, listAnimations, startFakeRig } from "../lib/api";
import { DEV_BYPASS_FLOW } from "../lib/devMode";

export default function RigAssistPage() {
  const navigate = useNavigate();
  const { modelResult, markers, setMarkers, selectedAnimation, setSelectedAnimation, sourceImageUrl } = useFlow();

  const [activeMarker, setActiveMarker] = useState(MARKER_ORDER[0]);
  const [status, setStatus] = useState("请按顺序设置 8 个辅助点位。");
  const [animations, setAnimations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("markers");

  const placedCount = useMemo(
    () => MARKER_ORDER.filter((key) => Array.isArray(markers[key])).length,
    [markers],
  );

  useEffect(() => {
    if (!modelResult) {
      return;
    }
    const nextMissing = MARKER_ORDER.find((key) => !markers[key]);
    if (nextMissing) {
      setActiveMarker(nextMissing);
    }
  }, [markers, modelResult]);

  if (!modelResult?.output_model_url && !DEV_BYPASS_FLOW) {
    return <Navigate to="/create" replace />;
  }

  function clearCurrentMarker() {
    setMarkers((prev) => ({ ...prev, [activeMarker]: null }));
  }

  function goNextMarker() {
    const idx = MARKER_ORDER.indexOf(activeMarker);
    setActiveMarker(MARKER_ORDER[(idx + 1 + MARKER_ORDER.length) % MARKER_ORDER.length]);
  }

  function resetAllMarkers() {
    setMarkers((prev) => {
      const next = { ...prev };
      MARKER_ORDER.forEach((key) => {
        next[key] = null;
      });
      return next;
    });
    setStatus("已重置全部点位，请重新放置。");
  }

  async function handleFakeRig() {
    if (placedCount !== MARKER_ORDER.length) {
      setStatus("点位尚未完成，需先设置全部 8 个点位。");
      return;
    }

    setLoading(true);
    setStatus("正在执行手动辅助+blender自动绑骨+重定向实现动作交互，请稍候...");
    setProgress(0);

    try {
      if (!modelResult?.output_model_url && DEV_BYPASS_FLOW) {
        for (let p = 0; p <= 100; p += 10) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 380));
          setProgress(p);
        }
        const animData = await listAnimations();
        setAnimations(animData.items || []);
        setSelectedAnimation(animData.items?.[0] || null);
        setPhase("preview");
        setStatus("开发模式：已跳过流程前置条件，进入动作预览。");
        return;
      }

      const payload = {
        model_url: modelResult.output_model_url,
        markers: MARKER_ORDER.reduce((acc, key) => {
          acc[key] = markers[key];
          return acc;
        }, {}),
      };

      const start = await startFakeRig(payload);
      let done = false;
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 550));
        const task = await getFakeRigStatus(start.task_id);
        setProgress(task.progress || 0);
        if (task.status === "completed") {
          done = true;
        }
      }

      const animData = await listAnimations();
      setAnimations(animData.items || []);
      setSelectedAnimation(animData.items?.[0] || null);
      setPhase("preview");
      setStatus("辅助流程完成。你可以预览动作并确认进入第 3 页。");
    } catch (error) {
      setStatus(`流程失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ShellLayout
      title="Assist Rig"
      subtitle="该页采用手动辅助+blender自动绑骨+重定向实现动作交互流程，确认后进入动作预览。"
    >
      {phase === "markers" ? (
        <div className="two-column">
          <section className="glass-panel">
            <h2>Marker Setup</h2>
            {!modelResult?.output_model_url && DEV_BYPASS_FLOW ? (
              <p className="muted">开发模式：当前页允许直接访问，未从第1页带入模型也可调试。</p>
            ) : null}
            <p className="muted">当前点位：{MARKER_LABELS[activeMarker]}。点击面板放点，拖拽可微调位置。</p>
            <p className="muted">仅当前点位可拖动。靠近推荐位置时会自动吸附，减少误操作。</p>
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

            <div className="row-btns">
              <button type="button" className="secondary-btn" onClick={goNextMarker}>
                下一个点位
              </button>
              <button type="button" className="secondary-btn" onClick={clearCurrentMarker}>
                撤销当前点
              </button>
            </div>
            <button type="button" className="secondary-btn" onClick={resetAllMarkers}>
              重置全部点
            </button>

            <button
              type="button"
              className="confirm-btn"
              disabled={loading || placedCount !== MARKER_ORDER.length}
              onClick={handleFakeRig}
            >
              确认进入加载
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
            <h2>Front Marker Board</h2>
            <p className="muted">按 Mixamo 正视图逻辑进行点位确认。系统将执行手动辅助+blender自动绑骨+重定向实现动作交互后进入动作预览。</p>
            <MarkerBoard
              markers={markers}
              setMarkers={setMarkers}
              activeMarker={activeMarker}
              backgroundImage={sourceImageUrl}
            />
          </section>
        </div>
      ) : (
        <div className="single-column">
          <section className="glass-panel">
            <h2>Animations Preview</h2>
            <p className="muted">动作文件直接来自 animations 目录（FBX）。点击动作名称可预览。</p>
            <AnimationStage
              animations={animations}
              selectedAnimation={selectedAnimation}
              onSelect={setSelectedAnimation}
            />
            <div className="row-btns" style={{ marginTop: 16 }}>
              <button type="button" className="secondary-btn" onClick={() => setPhase("markers")}>
                返回点位页
              </button>
              <button type="button" className="confirm-btn" onClick={() => navigate("/interact")}>
                确认进入第 3 页
              </button>
            </div>
          </section>
        </div>
      )}
    </ShellLayout>
  );
}
