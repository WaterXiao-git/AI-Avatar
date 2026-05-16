import { Canvas } from "@react-three/fiber";
import { OrbitControls, useFBX } from "@react-three/drei";
import { useEffect } from "react";
import Experience from "./avatar/Experience";
import { toAbsoluteUrl } from "../lib/config";

function resolveAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (String(pathOrUrl).startsWith("/assets/")) return toAbsoluteUrl(pathOrUrl);
  return pathOrUrl;
}

function joinActionPath(basePath, fileName) {
  const base = String(basePath || "").replace(/\/$/, "");
  const file = String(fileName || "").replace(/^\//, "");
  return `${base}/${file}`;
}

export default function ModelPreview({ modelUrl, actionBasePath = "/animations" }) {
  const idlePreviewUrl = resolveAssetUrl(joinActionPath(actionBasePath, "Standing Idle.fbx"));

  useEffect(() => {
    if (!idlePreviewUrl) return;
    useFBX.preload(idlePreviewUrl);
  }, [idlePreviewUrl]);

  return (
    <div className="model-preview">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, -0.25, 9.6], fov: 23 }}
        style={{ height: "100%", width: "100%" }}
      >
        <color attach="background" args={["#e6eef5"]} />
        <hemisphereLight args={["#f9fbff", "#b8cad8", 0.88]} />
        <ambientLight intensity={0.58} />
        <directionalLight position={[2.8, 6.8, 4.2]} intensity={0.88} color="#fff6ea" />
        <directionalLight position={[-2.4, 3.8, -2.2]} intensity={0.32} color="#d9ebff" />

        <Experience
          isWaving={false}
          setIsWaving={() => {}}
          isTalking={false}
          interruptSeq={0}
          isSessionActive={true}
          userSpeaking={false}
          previewAnimationName="Standing Idle.fbx"
          previewAnimationUrl={idlePreviewUrl}
          previewGuardMode="create"
          loadInteractionClips={false}
          avatarModelUrl={modelUrl}
          actionBasePath={actionBasePath}
          showBackdrop={false}
          showEnvironment={false}
          previewMaterialSoftening
        />

        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={2.2}
          maxDistance={14}
        />
      </Canvas>
    </div>
  );
}
