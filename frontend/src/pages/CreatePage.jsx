import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ShellLayout from "../components/ShellLayout";
import ModelPreview from "../components/ModelPreview";
import { createFromImage, createFromText } from "../lib/api";
import { toAbsoluteUrl } from "../lib/config";
import { useFlow } from "../context/FlowContext";

export default function CreatePage() {
  const navigate = useNavigate();
  const { modelResult, setModelResult, resetMarkers, setSourceImageUrl } = useFlow();

  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("输入文字或上传图片，生成你的数字人形象。");

  const previewUrl = useMemo(
    () => (modelResult?.output_model_url ? toAbsoluteUrl(modelResult.output_model_url) : ""),
    [modelResult],
  );

  async function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
  }

  async function handleRunText() {
    if (!prompt.trim()) {
      setStatus("请先输入文字描述。");
      return;
    }
    setBusy(true);
    setStatus("正在调用 Meshy 文本生成，请稍候...");
    try {
      const result = await createFromText(prompt.trim());
      setModelResult(result);
      setSourceImageUrl("");
      resetMarkers();
      setStatus("形象生成完成。可以旋转预览后确认。");
    } catch (error) {
      setStatus(`生成失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRunImage() {
    if (!imageFile) {
      setStatus("请先选择图片文件。");
      return;
    }
    setBusy(true);
    setStatus("正在调用 Meshy 图片生成，请稍候...");
    try {
      const result = await createFromImage(imageFile);
      setModelResult(result);
      setSourceImageUrl(await toDataUrl(imageFile));
      resetMarkers();
      setStatus("形象生成完成。可以旋转预览后确认。");
    } catch (error) {
      setStatus(`生成失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShellLayout
      title="Shape Creation"
      subtitle="通过文字或图片生成 3D 数字人，确认后进入辅助绑定流程。"
    >
      <div className="two-column">
        <section className="glass-panel">
          <h2>Input</h2>
          <p className="muted">你可以选择文字输入或图片输入，提交后会自动生成模型。</p>

          <label className="field-label" htmlFor="prompt-input">
            Text Prompt
          </label>
          <textarea
            id="prompt-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：a stylized friendly human character"
          />
          <button type="button" className="primary-btn" onClick={handleRunText} disabled={busy}>
            {busy ? "生成中..." : "文字生成"}
          </button>

          <div className="divider" />

          <label className="field-label" htmlFor="image-input">
            Image Upload
          </label>
          <input
            id="image-input"
            type="file"
            accept="image/*"
            onChange={(event) => setImageFile(event.target.files?.[0] || null)}
          />
          <button type="button" className="secondary-btn" onClick={handleRunImage} disabled={busy}>
            {busy ? "生成中..." : "图片生成"}
          </button>

          <div className="status-box">{status}</div>

          <button
            type="button"
            className="confirm-btn"
            disabled={!modelResult?.output_model_url || busy}
            onClick={() => navigate("/rig-preview")}
          >
            确认形象并进入辅助绑定
          </button>
        </section>

        <section className="glass-panel preview-panel">
          <h2>3D Preview</h2>
          <p className="muted">支持拖拽旋转和滚轮缩放，确认角色形象后再进入下一步。</p>
          {previewUrl ? <ModelPreview modelUrl={previewUrl} /> : <div className="empty-stage">等待生成模型</div>}
        </section>
      </div>
    </ShellLayout>
  );
}
