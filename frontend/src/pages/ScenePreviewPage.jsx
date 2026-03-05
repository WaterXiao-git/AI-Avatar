import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import ShellLayout from "../components/ShellLayout";
import Experience from "../components/avatar/Experience";
import { useFlow } from "../context/FlowContext";
import { generateSceneBackground, listSceneLibrary, polishSceneText, transcribeSpeech } from "../lib/api";
import { DEV_BYPASS_FLOW } from "../lib/devMode";
import { API_BASE, toAbsoluteUrl } from "../lib/config";
import { useSpeechInput } from "../hooks/useSpeechInput";

function normalizeSceneUrl(value) {
  if (!value) return "";
  if (/^(data:|blob:)/i.test(value)) return value;
  if (String(value).startsWith(`${API_BASE}/scenes/proxy-image?`)) return value;
  if (/^https?:\/\//i.test(value)) {
    return `${API_BASE}/scenes/proxy-image?url=${encodeURIComponent(value)}`;
  }
  return toAbsoluteUrl(value);
}

export default function ScenePreviewPage() {
  const navigate = useNavigate();
  const { modelResult, presetName, sceneBackgroundUrl, setSceneBackgroundUrl, modelId } = useFlow();

  const [q, setQ] = useState("办公室");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("请选择一个场景背景，再进入展示页面。");
  const [items, setItems] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [selectedUrl, setSelectedUrl] = useState(sceneBackgroundUrl || "");
  const [bgPrompt, setBgPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const { speechSupported, listening, toggleSpeechInput } = useSpeechInput({
    lang: "zh-CN",
    onText: (text) => setBgPrompt(text),
    onStatus: (text) => setStatus(text),
    onFallbackTranscribe: async (audioBlob) => {
      const file = new File([audioBlob], `speech_scene_${Date.now()}.webm`, { type: "audio/webm" });
      const data = await transcribeSpeech(file);
      return String(data.text || "").trim();
    },
    startHint: "正在聆听，请说出背景描述...",
    doneHint: "语音已识别并填入背景描述。可继续润色或直接生成。",
  });

  const previewUrl = useMemo(() => normalizeSceneUrl(selectedUrl), [selectedUrl]);

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      try {
        const data = await listSceneLibrary({ query: q, page: 1, perPage: 12 });
        const next = data.items || [];
        if (!mounted) return;
        setItems(next);
        if (!selectedUrl) {
          const first = next[0]?.full_url || next[0]?.thumb_url || "";
          setSelectedUrl(first);
        }
        setStatus(data.source === "unsplash" ? "已接入 Unsplash 场景图库。" : "当前使用本地预设场景图库。");
      } catch (error) {
        if (!mounted) return;
        setStatus(`加载场景图库失败：${error.message}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePolishPrompt() {
    if (!bgPrompt.trim()) {
      setStatus("请先输入需要润色的背景描述。");
      return;
    }
    setPolishing(true);
    setStatus("正在润色背景描述，请稍候...");
    try {
      const data = await polishSceneText(bgPrompt.trim());
      const polished = String(data.polished_prompt || "").trim();
      if (!polished) {
        setStatus("润色未返回有效内容，请保留原描述继续生成。");
        return;
      }
      setBgPrompt(polished);
      setStatus("背景描述已润色并覆盖到输入框。");
    } catch (error) {
      setStatus(`润色失败：${error.message}`);
    } finally {
      setPolishing(false);
    }
  }

  async function refreshLibrary() {
    setLoading(true);
    setStatus("正在刷新场景图库...");
    try {
      const data = await listSceneLibrary({ query: q.trim() || "office", page: 1, perPage: 12 });
      const next = data.items || [];
      setItems(next);
      const first = next[0]?.full_url || next[0]?.thumb_url || "";
      setSelectedUrl(first);
      setStatus(data.source === "unsplash" ? "已刷新 Unsplash 场景图库。" : "当前使用本地预设场景图库。");
    } catch (error) {
      setStatus(`刷新失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadBackground(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    }).catch((error) => {
      setStatus(`上传失败：${error.message}`);
      return "";
    });
    if (!dataUrl) return;
    const customItem = {
      id: `upload_${Date.now()}`,
      thumb_url: dataUrl,
      full_url: dataUrl,
      title: file.name || "自定义背景",
      source: "upload",
    };
    setCustomItems((prev) => [customItem, ...prev]);
    setSelectedUrl(dataUrl);
    setStatus("已添加你的背景图，右侧可实时预览。");
  }

  async function handleGenerateBackground() {
    if (!bgPrompt.trim()) {
      setStatus("请先输入用于生成背景图的文字描述。");
      return;
    }
    setGenerating(true);
    setStatus("正在根据描述生成背景图...");
    try {
      const item = await generateSceneBackground(bgPrompt.trim());
      setCustomItems((prev) => [item, ...prev]);
      setSelectedUrl(item.full_url || item.thumb_url || "");
      setStatus("背景图生成成功，已自动选中。你可继续切换其他场景。");
    } catch (error) {
      setStatus(`背景图生成失败：${error.message}`);
    } finally {
      setGenerating(false);
    }
  }

  function handleConfirm() {
    if (!selectedUrl) {
      setStatus("请先选择一个场景背景。");
      return;
    }
    setSceneBackgroundUrl(normalizeSceneUrl(selectedUrl));
    navigate("/interact", { state: { modelId } });
  }

  if (!modelResult?.output_model_url && !DEV_BYPASS_FLOW) {
    return <Navigate to="/create" replace />;
  }

  return (
    <ShellLayout title="场景预览" subtitle="选择展示场景背景，确认后进入展示页面进行实时交互。">
      <div className="two-column">
        <section className="glass-panel">
          <h2>场景图库</h2>
          <p className="muted">可输入关键词刷新背景图库。点击左侧图片即可在右侧实时预览。</p>
          <div className="scene-search-row">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="例如：办公室、教室、studio" />
            <button type="button" className="secondary-btn" onClick={refreshLibrary} disabled={loading}>
              {loading ? "加载中..." : "刷新图库"}
            </button>
          </div>

          <div className="scene-gallery-list">
            {items.map((item) => {
              const thumb = normalizeSceneUrl(item.thumb_url || item.full_url);
              const full = item.full_url || item.thumb_url || "";
              const active = selectedUrl === full;
              return (
                <button
                  key={item.id || full}
                  type="button"
                  className={active ? "scene-thumb active" : "scene-thumb"}
                  onClick={() => setSelectedUrl(full)}
                >
                  <img src={thumb} alt="场景缩略图" loading="lazy" />
                </button>
              );
            })}
          </div>

          <div className="status-box">{status}</div>

          <div className="scene-extra-tools">
            <label className="field-label" htmlFor="scene-upload-input">
              上传背景图
            </label>
            <input id="scene-upload-input" type="file" accept="image/*" onChange={handleUploadBackground} />

            <div className="prompt-label-row">
              <label className="field-label" htmlFor="scene-prompt-input">
                文字生成背景图
              </label>
              <div className="prompt-tools">
                <button
                  type="button"
                  className="speech-btn"
                  onClick={handlePolishPrompt}
                  disabled={generating || polishing}
                >
                  {polishing ? "润色中..." : "润色描述"}
                </button>
                <button
                  type="button"
                  className="speech-btn"
                  onClick={() => toggleSpeechInput(generating)}
                  disabled={generating || !speechSupported}
                >
                  {listening ? "停止语音" : "语音输入"}
                </button>
              </div>
            </div>
            <textarea
              id="scene-prompt-input"
              value={bgPrompt}
              onChange={(event) => setBgPrompt(event.target.value)}
              placeholder="例如：现代科技感办公室，落地窗，柔和自然光"
            />
            <button type="button" className="secondary-btn" onClick={handleGenerateBackground} disabled={generating}>
              {generating ? "生成中..." : "生成背景图"}
            </button>

            {customItems.length ? (
              <div className="scene-custom-list">
                <p className="muted" style={{ margin: "2px 0 0" }}>
                  我的背景
                </p>
                {customItems.map((item) => {
                  const thumb = normalizeSceneUrl(item.thumb_url || item.full_url);
                  const full = item.full_url || item.thumb_url || "";
                  const active = selectedUrl === full;
                  return (
                    <button
                      key={item.id || full}
                      type="button"
                      className={active ? "scene-thumb active" : "scene-thumb"}
                      onClick={() => setSelectedUrl(full)}
                    >
                      <img src={thumb} alt="自定义背景缩略图" loading="lazy" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <button type="button" className="confirm-btn" onClick={handleConfirm} disabled={!selectedUrl}>
            点击确认进入展示
          </button>
        </section>

        <section className="glass-panel preview-panel scene-preview-panel">
          <h2>场景效果预览</h2>
          <p className="muted">可在此页面确认背景与角色展示效果。</p>
          <div className="animation-stage scene-animation-stage">
            <Canvas
              shadows
              dpr={[1, 1.5]}
              gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
              camera={{ position: [0, -0.25, 9.6], fov: 23 }}
              style={{ height: "100%", width: "100%" }}
            >
              <ambientLight intensity={0.95} />
              <directionalLight position={[5, 10, 5]} intensity={1.35} />
              <Experience
                isWaving={false}
                setIsWaving={() => {}}
                isTalking={false}
                interruptSeq={0}
                isSessionActive
                userSpeaking={false}
                previewAnimationName="Standing Idle.fbx"
                previewAnimationUrl={presetName ? `/assets/presets/${presetName}/animations/Standing Idle.fbx` : "/animations/Standing Idle.fbx"}
                loadInteractionClips={false}
                avatarModelUrl={modelResult?.output_model_url || "/models/avatar.fbx"}
                actionBasePath={presetName ? `/assets/presets/${presetName}/animations` : "/animations"}
                backdropTexturePath={previewUrl}
                showBackdrop
                showEnvironment={false}
              />
            </Canvas>
          </div>
        </section>
      </div>
    </ShellLayout>
  );
}
