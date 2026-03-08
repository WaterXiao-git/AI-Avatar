/* eslint-disable no-empty, react-hooks/immutability */
import { Environment } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import Avatar from "./Avatar";
import { TEXTURE_PATH } from "./constant";

export default function Experience({
  isWaving,
  setIsWaving,
  isTalking,
  interruptSeq,
  isSessionActive,
  userSpeaking,
  previewAnimationName,
  previewAnimationUrl,
  previewGuardMode,
  previewSwitchSafe = false,
  loadInteractionClips = true,
  avatarModelUrl,
  actionBasePath,
  backdropTexturePath,
  showBackdrop = true,
  showEnvironment = false,
  avatarPosition = [0, -1.6, 0],
  enableAvatarDrag = false,
  onAvatarPositionChange,
}) {
  const scene = useThree((state) => state.scene);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, pos: [0, -1.6, 0] });
  const [backdropTexture, setBackdropTexture] = useState(null);
  const currentTextureUrlRef = useRef("");

  const textureUrl = useMemo(() => backdropTexturePath || TEXTURE_PATH, [backdropTexturePath]);

  useEffect(() => {
    if (currentTextureUrlRef.current === textureUrl) {
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();

    const applyTexture = (texture, loadedFromUrl) => {
      if (cancelled || !texture) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      setBackdropTexture(texture);
      currentTextureUrlRef.current = loadedFromUrl;
    };

    loader.load(
      textureUrl,
      (texture) => applyTexture(texture, textureUrl),
      undefined,
      () => {
        if (textureUrl === TEXTURE_PATH) {
          if (!cancelled) setBackdropTexture(null);
          return;
        }
        loader.load(
          TEXTURE_PATH,
          (texture) => applyTexture(texture, TEXTURE_PATH),
          undefined,
          () => {
            if (!cancelled) setBackdropTexture(null);
          },
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [textureUrl]);

  useEffect(() => {
    if (!showBackdrop) {
      scene.background = null;
      return;
    }
    scene.background = backdropTexture || null;
    return () => {
      if (scene.background === backdropTexture) {
        scene.background = null;
      }
    };
  }, [scene, backdropTexture, showBackdrop]);

  function toNum3(value, fallback = [0, -1.6, 0]) {
    if (!Array.isArray(value) || value.length < 3) return fallback;
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
  }

  function onAvatarPointerDown(event) {
    if (!enableAvatarDrag) return;
    event.stopPropagation();
    draggingRef.current = true;
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pos: toNum3(avatarPosition),
    };
    try {
      event.target.setPointerCapture?.(event.pointerId);
    } catch {}
  }

  function onAvatarPointerMove(event) {
    if (!enableAvatarDrag || !draggingRef.current) return;
    event.stopPropagation();
    const start = dragStartRef.current;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const scale = 0.012;
    const nextX = Math.max(-3, Math.min(3, start.pos[0] + dx * scale));
    const nextZ = Math.max(-3.5, Math.min(3.5, start.pos[2] - dy * scale));
    onAvatarPositionChange?.([Number(nextX.toFixed(3)), start.pos[1], Number(nextZ.toFixed(3))]);
  }

  function onAvatarPointerUp(event) {
    if (!enableAvatarDrag) return;
    draggingRef.current = false;
    try {
      event.target.releasePointerCapture?.(event.pointerId);
    } catch {}
  }

  return (
    <>
      <group
        position={toNum3(avatarPosition)}
        onPointerDown={onAvatarPointerDown}
        onPointerMove={onAvatarPointerMove}
        onPointerUp={onAvatarPointerUp}
        onPointerCancel={onAvatarPointerUp}
      >
        <Avatar
          position={[0, 0, 0]}
          scale={3.8}
          isWaving={isWaving}
          setIsWaving={setIsWaving}
          isTalking={isTalking}
          interruptSeq={interruptSeq}
          isSessionActive={isSessionActive}
          userSpeaking={userSpeaking}
          previewAnimationName={previewAnimationName}
          previewAnimationUrl={previewAnimationUrl}
          previewGuardMode={previewGuardMode}
          previewSwitchSafe={previewSwitchSafe}
          loadInteractionClips={loadInteractionClips}
          avatarModelUrl={avatarModelUrl}
          actionBasePath={actionBasePath}
        />
      </group>

      {showEnvironment ? <Environment preset="sunset" /> : null}
    </>
  );
}
