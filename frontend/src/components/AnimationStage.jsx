import { useEffect, useMemo } from "react";
import { useFBX } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Experience from "./avatar/Experience";
import { toAbsoluteUrl } from "../lib/config";
import { toChineseAnimationName } from "../lib/displayNames";

function resolveAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (String(pathOrUrl).startsWith("/assets/")) return toAbsoluteUrl(pathOrUrl);
  return pathOrUrl;
}

export default function AnimationStage({
  animations,
  selectedAnimation,
  onSelect,
  avatarModelUrl,
  actionBasePath,
  previewAnimationUrl,
}) {
  const preloadUrls = useMemo(() => {
    const items = [avatarModelUrl, ...(animations || []).map((anim) => anim?.file_url)];
    return Array.from(new Set(items.map(resolveAssetUrl).filter(Boolean)));
  }, [animations, avatarModelUrl]);

  useEffect(() => {
    preloadUrls.forEach((url) => {
      useFBX.preload(url);
    });
  }, [preloadUrls]);

  return (
    <section className="animation-stage-wrap">
      <div className="animation-list">
        {animations.map((anim) => (
          <button
            key={anim.file_name}
            type="button"
            onClick={() => onSelect(anim)}
            className={selectedAnimation?.file_name === anim.file_name ? "anim-btn active" : "anim-btn"}
          >
            {toChineseAnimationName(anim.display_name)}
          </button>
        ))}
      </div>

      <div className="animation-stage">
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
            previewAnimationName={selectedAnimation?.file_name || ""}
            previewAnimationUrl={previewAnimationUrl || selectedAnimation?.file_url || ""}
            avatarModelUrl={avatarModelUrl}
            actionBasePath={actionBasePath}
            showBackdrop={false}
            showEnvironment={false}
            previewMaterialSoftening
          />
        </Canvas>
      </div>
    </section>
  );
}
