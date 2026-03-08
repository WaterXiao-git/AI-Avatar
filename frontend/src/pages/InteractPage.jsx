import { Navigate, useLocation } from "react-router-dom";
import ShellLayout from "../components/ShellLayout";
import { MARKER_ORDER, useFlow } from "../context/FlowContext";
import InteractiveAvatarScene from "../components/avatar/InteractiveAvatarScene";

export default function InteractPage() {
  const location = useLocation();
  const { modelResult, markers, presetName, modelId, sceneBackgroundUrl, sceneAvatarPosition, sceneCamera, sceneLight } = useFlow();
  const activeModelId = modelId || location.state?.modelId || null;
  const markersReady = MARKER_ORDER.every((key) => Array.isArray(markers?.[key]));

  if (!modelResult?.output_model_url) {
    return <Navigate to="/create" replace />;
  }

  if (!markersReady) {
    return <Navigate to="/rig-preview" replace />;
  }

  if (!sceneBackgroundUrl) {
    return <Navigate to="/scene-preview" replace />;
  }

  return (
    <ShellLayout
      title="交互会话"
      subtitle="可通过挥手或手动按钮进入语音会话，并支持展示录制。"
      backTo="/scene-preview"
    >
      <section className="glass-panel full-stage">
        <InteractiveAvatarScene
          avatarModelUrl={modelResult?.output_model_url || "/models/avatar.fbx"}
          actionBasePath={presetName ? `/assets/presets/${presetName}/animations` : "/animations"}
          modelId={activeModelId}
          backdropTexturePath={sceneBackgroundUrl}
          avatarPosition={sceneAvatarPosition}
          cameraPosition={sceneCamera?.position}
          cameraFov={sceneCamera?.fov}
          ambientIntensity={sceneLight?.ambient}
          directionalIntensity={sceneLight?.directional}
          directionalPosition={sceneLight?.directionalPosition}
          presetName={presetName}
        />
      </section>
    </ShellLayout>
  );
}
