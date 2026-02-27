import { useEffect, useMemo, useRef } from "react";
import { useFBX, useAnimations } from "@react-three/drei";
import {
  findFirstSkinnedMesh,
  removeLowerBodyTracks,
  removeRootPositionTracks,
  summarizeClipMatch,
  weightedPick,
} from "./avatarFbxUtils";
import { createAvatarFbxController } from "./avatarFbxController";

export function Avatar({
  isWaving = false,
  setIsWaving = () => {},
  isTalking = false,
  interruptSeq = 0,
  isSessionActive = false,
  userSpeaking = false,
  ...threeProps
}) {
  const FIXED_POSITION = [0, 1.65, -1.0];
  const FIXED_SCALE = 0.004;

  const group = useRef();
  const model = useFBX("/models/avatar.fbx");

  const idleFbx = useFBX("/animations/Standing Idle.fbx");
  const waveFbx = useFBX("/animations/Waving.fbx");
  const talk1Fbx = useFBX("/animations/Talking1.fbx");
  const talk2Fbx = useFBX("/animations/Talking2.fbx");
  const talk3Fbx = useFBX("/animations/Talking3.fbx");
  const listeningFbx = useFBX("/animations/Listening.fbx");

  const TALK_WEIGHTS = useMemo(
    () => [
      { key: "Talking1", weight: 0.4 },
      { key: "Talking2", weight: 0.4 },
      { key: "Talking3", weight: 0.2 },
    ],
    [],
  );

  const clips = useMemo(() => {
    const out = [];
    const add = (clip, name) => {
      if (!clip) return;
      const cleaned = removeRootPositionTracks(clip, "mixamorigHips");
      cleaned.name = name;
      out.push(cleaned);
    };
    add(idleFbx?.animations?.[0], "Idle");
    if (waveFbx?.animations?.[0]) {
      const waveNoRoot = removeRootPositionTracks(waveFbx.animations[0], "mixamorigHips");
      const waveUpperBody = removeLowerBodyTracks(waveNoRoot, { removeHipsRotation: true });
      waveUpperBody.name = "Wave";
      out.push(waveUpperBody);
    }
    add(talk1Fbx?.animations?.[0], "Talking1");
    add(talk2Fbx?.animations?.[0], "Talking2");
    add(talk3Fbx?.animations?.[0], "Talking3");
    add(listeningFbx?.animations?.[0], "Listening");
    return out;
  }, [idleFbx, waveFbx, talk1Fbx, talk2Fbx, talk3Fbx, listeningFbx]);

  const { actions, mixer } = useAnimations(clips, group);
  const ctrlRef = useRef(null);

  useEffect(() => {
    if (!actions) return undefined;
    ctrlRef.current = createAvatarFbxController({
      actions,
      mixer,
      setIsWaving,
      setIsWavingExternal: setIsWaving,
      TALK_WEIGHTS,
      weightedPick,
    });
    return () => {
      ctrlRef.current?.dispose?.();
      ctrlRef.current = null;
    };
  }, [actions, mixer, setIsWaving, TALK_WEIGHTS]);

  useEffect(() => {
    if (!ctrlRef.current) return;
    ctrlRef.current.update({
      isWaving,
      isTalking,
      interruptSeq,
      userSpeaking,
    });
  }, [isWaving, isTalking, interruptSeq, userSpeaking]);

  useEffect(() => {
    const skinned = findFirstSkinnedMesh(model);
    const bones = skinned?.skeleton?.bones || [];
    const boneSet = new Set(bones.map((bone) => bone.name));
    ["Idle", "Wave", "Listening", "Talking1", "Talking2", "Talking3"].forEach((name) => {
      summarizeClipMatch({
        clip: clips.find((clipItem) => clipItem.name === name),
        boneSet,
      });
    });
  }, [model, actions, clips]);

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    if (!isSessionActive) {
      ctrl.endSessionNow?.();
      return;
    }
    ctrl.beginSessionNow?.();
    ctrl.update?.({
      isWaving,
      isTalking,
      interruptSeq,
      userSpeaking,
    });
  }, [isSessionActive]);

  return (
    <group ref={group} {...threeProps}>
      <group position={FIXED_POSITION} scale={FIXED_SCALE}>
        <primitive object={model} />
      </group>
    </group>
  );
}

export default Avatar;
