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

  return (
    <div ref={containerRef} className="avatar-view-wrap">
      <Canvas shadows camera={{ position: [0, 0, 10], fov: 20 }} style={{ height: "100%", width: "100%" }}>
        <color attach="background" args={["#edf7ff"]} />
        <ambientLight intensity={0.95} />
        <directionalLight position={[5, 10, 5]} intensity={1.35} />
        <Experience
          isWaving={isWaving}
          setIsWaving={setIsWaving}
          isTalking={isTalking}
          interruptSeq={interruptSeq}
          isSessionActive={isSessionActive}
          userSpeaking={userSpeaking}
        />
      </Canvas>

      <button type="button" onClick={toggleFullScreen} className="floating-icon-btn">
        {isFullScreen ? <MdCloseFullscreen size={22} /> : <MdFullscreen size={22} />}
      </button>
    </div>
  );
}
