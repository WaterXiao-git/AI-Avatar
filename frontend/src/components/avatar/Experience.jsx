import { Environment, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import Avatar from "./Avatar";
import { TEXTURE_PATH } from "./constant";

export default function Experience({
  isWaving,
  setIsWaving,
  isTalking,
  interruptSeq,
  isSessionActive,
  userSpeaking,
}) {
  const texture = useTexture(TEXTURE_PATH);
  const viewport = useThree((state) => state.viewport);

  return (
    <>
      <Avatar
        position={[0, -5, 5]}
        scale={3}
        isWaving={isWaving}
        setIsWaving={setIsWaving}
        isTalking={isTalking}
        interruptSeq={interruptSeq}
        isSessionActive={isSessionActive}
        userSpeaking={userSpeaking}
      />

      <Environment preset="sunset" />

      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </>
  );
}
