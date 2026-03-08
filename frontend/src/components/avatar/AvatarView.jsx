import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MdCloseFullscreen, MdFullscreen } from "react-icons/md";
import Experience from "./Experience";

export default function AvatarView({
  isWaving,
  setIsWaving,
  isTalking,
  interruptSeq,
  isSessionActive,
  userSpeaking,
  previewAnimationName,
  previewAnimationUrl,
  avatarModelUrl,
  actionBasePath,
  backdropTexturePath,
  onCanvasReady,
  cameraPosition = [0, 0, 10],
  cameraFov = 20,
  ambientIntensity = 1.25,
  directionalIntensity = 1.35,
  directionalPosition = [5, 15, 5],
  avatarPosition = [0, -1.6, 0],
  enableAvatarDrag = false,
  onAvatarPositionChange,
}) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const containerRef = useRef(null);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current
        ?.requestFullscreen?.()
        .then(() => setIsFullScreen(true))
        .catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullScreen(false));
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const canvas = containerRef.current?.querySelector("canvas") || null;
    onCanvasReady?.(canvas);
  }, [onCanvasReady]);

  return (
    <div ref={containerRef} className="avatar-view-wrap">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: cameraPosition, fov: cameraFov }}
        style={{ height: "100%", width: "100%" }}
      >
        <ambientLight intensity={ambientIntensity} />
        <directionalLight position={directionalPosition} intensity={directionalIntensity} />
        <Experience
          isWaving={isWaving}
          setIsWaving={setIsWaving}
          isTalking={isTalking}
          interruptSeq={interruptSeq}
          isSessionActive={isSessionActive}
          userSpeaking={userSpeaking}
          previewAnimationName={previewAnimationName}
          previewAnimationUrl={previewAnimationUrl}
          avatarModelUrl={avatarModelUrl}
          actionBasePath={actionBasePath}
          backdropTexturePath={backdropTexturePath}
          avatarPosition={avatarPosition}
          enableAvatarDrag={enableAvatarDrag}
          onAvatarPositionChange={onAvatarPositionChange}
        />
      </Canvas>

      <button type="button" onClick={toggleFullScreen} className="floating-icon-btn">
        {isFullScreen ? <MdCloseFullscreen size={22} /> : <MdFullscreen size={22} />}
      </button>
    </div>
  );
}
