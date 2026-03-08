/* eslint-disable no-empty, react-hooks/immutability */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFBX, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import {
  detectRootBoneName,
  findFirstSkinnedMesh,
  removeLowerBodyTracks,
  removeRootPositionTracks,
  summarizeClipMatch,
  weightedPick,
} from "./avatarFbxUtils";
import { createAvatarFbxController } from "./avatarFbxController";
import { toAbsoluteUrl } from "../../lib/config";

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

const NOOP = () => {};

export function Avatar({
  isWaving = false,
  setIsWaving = () => {},
  isTalking = false,
  interruptSeq = 0,
  isSessionActive = false,
  userSpeaking = false,
  previewAnimationName = "",
  previewAnimationUrl = "",
  previewGuardMode = "",
  previewSwitchSafe = false,
  onPreviewApplied = NOOP,
  loadInteractionClips = true,
  avatarModelUrl = "/models/avatar.fbx",
  actionBasePath = "/animations",
  ...threeProps
}) {
  const group = useRef();
  const resolvedModel = resolveAssetUrl(avatarModelUrl);
  const modelPath = /\.fbx(\?|$)/i.test(resolvedModel || "") ? resolvedModel : "/models/avatar.fbx";
  const model = useFBX(modelPath);
  const rootBoneName = useMemo(() => detectRootBoneName(model), [model]);
  const previewMode = Boolean(previewAnimationName);
  const fitTransform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const safeHeight = Math.max(size.y, 0.0001);
    const targetHeight = previewMode ? 0.82 : 0.84;
    const scale = targetHeight / safeHeight;
    return {
      scale,
      position: [-center.x * scale, -box.min.y * scale, -center.z * scale],
    };
  }, [model, previewMode]);

  const idleUrl = resolveAssetUrl(joinActionPath(actionBasePath, "Standing Idle.fbx"));
  const waveUrl = resolveAssetUrl(
    joinActionPath(actionBasePath, loadInteractionClips ? "Waving.fbx" : "Standing Idle.fbx"),
  );
  const talking1Url = resolveAssetUrl(
    joinActionPath(actionBasePath, loadInteractionClips ? "Talking1.fbx" : "Standing Idle.fbx"),
  );
  const talking2Url = resolveAssetUrl(
    joinActionPath(actionBasePath, loadInteractionClips ? "Talking2.fbx" : "Standing Idle.fbx"),
  );
  const talking3Url = resolveAssetUrl(
    joinActionPath(actionBasePath, loadInteractionClips ? "Talking3.fbx" : "Standing Idle.fbx"),
  );
  const listeningUrl = resolveAssetUrl(
    joinActionPath(actionBasePath, loadInteractionClips ? "Listening.fbx" : "Standing Idle.fbx"),
  );
  const globalIdleUrl = resolveAssetUrl("/animations/Standing Idle.fbx");
  const fallbackPreviewUrl = resolveAssetUrl(previewAnimationUrl || idleUrl);
  const previewActionName = useMemo(() => {
    const seed = `${previewAnimationName}|${fallbackPreviewUrl}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return `Preview_${Math.abs(hash).toString(36)}`;
  }, [previewAnimationName, fallbackPreviewUrl]);

  const idleFbx = useFBX(idleUrl);
  const waveFbx = useFBX(waveUrl);
  const talk1Fbx = useFBX(talking1Url);
  const talk2Fbx = useFBX(talking2Url);
  const talk3Fbx = useFBX(talking3Url);
  const listeningFbx = useFBX(listeningUrl);
  const globalIdleFbx = useFBX(globalIdleUrl);
  const previewFbx = useFBX(fallbackPreviewUrl);

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
      const cleaned = removeRootPositionTracks(clip, rootBoneName);
      cleaned.name = name;
      out.push(cleaned);
    };
    const addUpperBody = (clip, name) => {
      if (!clip) return;
      const noRoot = removeRootPositionTracks(clip, rootBoneName);
      const upper = removeLowerBodyTracks(noRoot, { removeHipsRotation: true });
      upper.name = name;
      out.push(upper);
    };
    add(idleFbx?.animations?.[0], "Idle");
    if (previewMode) {
      const hint = String(previewAnimationName || previewAnimationUrl || "");
      const rawPreview = previewFbx?.animations?.[0];

      if (rawPreview) {
        let previewClip = removeRootPositionTracks(rawPreview, rootBoneName);
        const skinned = findFirstSkinnedMesh(model);
        const boneSet = new Set((skinned?.skeleton?.bones || []).map((bone) => bone.name));
        const previewMatch = summarizeClipMatch({ clip: previewClip, boneSet });
        if (!/idle|standing/i.test(hint) && (previewClip.tracks.length < 4 || previewMatch.rate < 0.35)) {
          return out;
        }

        if (/idle|standing/i.test(hint) && globalIdleFbx?.animations?.[0]) {
          const globalIdleClip = removeRootPositionTracks(globalIdleFbx.animations[0], rootBoneName);
          const globalMatch = summarizeClipMatch({ clip: globalIdleClip, boneSet });

          const previewWeak = previewClip.tracks.length < 6 || previewMatch.rate < 0.45;
          const globalStrong = globalIdleClip.tracks.length >= previewClip.tracks.length || globalMatch.rate >= 0.6;

          if (previewWeak && globalStrong) {
            previewClip = globalIdleClip;
          }
        }

        previewClip.name = previewActionName;
        out.push(previewClip);
      }
      return out;
    }

    addUpperBody(waveFbx?.animations?.[0], "Wave");
    addUpperBody(talk1Fbx?.animations?.[0], "Talking1");
    addUpperBody(talk2Fbx?.animations?.[0], "Talking2");
    addUpperBody(talk3Fbx?.animations?.[0], "Talking3");
    addUpperBody(listeningFbx?.animations?.[0], "Listening");
    return out;
  }, [
    model,
    idleFbx,
    previewMode,
    previewAnimationName,
    waveFbx,
    talk1Fbx,
    talk2Fbx,
    talk3Fbx,
    listeningFbx,
    globalIdleFbx,
    previewFbx,
    previewAnimationUrl,
    previewActionName,
    rootBoneName,
  ]);

  const { actions, mixer } = useAnimations(clips, group);
  const ctrlRef = useRef(null);
  const previewCurrentRef = useRef(null);
  const previewFenceTimerRef = useRef(null);
  const [previewReady, setPreviewReady] = useState(() => !(previewMode && previewGuardMode === "create"));

  useEffect(() => {
    if (previewMode && previewGuardMode === "create") {
      setPreviewReady(false);
    }
  }, [modelPath, fallbackPreviewUrl, previewMode, previewGuardMode]);

  useEffect(() => {
    if (!(previewMode && previewGuardMode === "create")) {
      return;
    }
    const root = group.current;
    if (mixer && root) {
      try {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
      } catch {}
    }
    previewCurrentRef.current = null;
    setPreviewReady(false);
  }, [modelPath, fallbackPreviewUrl, previewMode, previewGuardMode, mixer]);

  useEffect(() => {
    if (!model) return;
    model.traverse((obj) => {
      if (!obj?.isMesh || !obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => {
        if (!material) return;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      });
    });
  }, [model]);

  useEffect(() => {
    if (previewMode) {
      ctrlRef.current?.dispose?.();
      ctrlRef.current = null;
      return undefined;
    }
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
  }, [actions, mixer, setIsWaving, TALK_WEIGHTS, previewMode]);

  useEffect(() => {
    if (previewFenceTimerRef.current) {
      window.clearTimeout(previewFenceTimerRef.current);
      previewFenceTimerRef.current = null;
    }

    if (!previewMode) {
      setPreviewReady(true);
      previewCurrentRef.current = null;
      return;
    }
    if (!previewMode || !actions) return;
    setPreviewReady(false);

    const hint = String(previewAnimationName || previewAnimationUrl || "");
    const idleOnlyPreview = /standing\s*idle|\bidle\b/i.test(hint);
    const createIdleOnly = previewGuardMode === "create";

    if (createIdleOnly) {
      Object.entries(actions).forEach(([, action]) => {
        if (!action) return;
        action.stop();
        action.enabled = false;
      });

      previewCurrentRef.current = null;
      const idleAction = actions.Idle;
      if (!idleAction) {
        setPreviewReady(false);
        return;
      }

      idleAction.enabled = true;
      idleAction.paused = false;
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.clampWhenFinished = false;
      idleAction.reset();
      idleAction.setEffectiveWeight(1);
      idleAction.setEffectiveTimeScale(1);
      idleAction.play();
      mixer?.update(1 / 120);
      mixer?.update(1 / 120);
      setPreviewReady(true);
      onPreviewApplied("Idle");
      return;
    }

    Object.entries(actions).forEach(([key, action]) => {
      if (!action) return;
      if (key !== "Idle" && key !== previewActionName) {
        if (previewSwitchSafe) {
          action.enabled = true;
        } else {
          action.stop();
          action.enabled = false;
        }
      }
    });

    const preview = actions[previewActionName];

    const idle = actions.Idle;
    if (idle) {
      idle.enabled = true;
      idle.paused = false;
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.clampWhenFinished = false;
      idle.reset();
      idle.setEffectiveWeight(1);
      idle.setEffectiveTimeScale(1);
      idle.fadeIn(0).play();
    }

    if (!preview) {
      mixer?.update(1 / 120);
      setPreviewReady(true);
      return;
    }

    if (idleOnlyPreview) {
      preview.stop();
      preview.enabled = false;
      mixer?.update(1 / 120);
      setPreviewReady(true);
      onPreviewApplied(previewAnimationName || "Idle");
      return;
    }

    preview.enabled = true;
    preview.paused = false;
    preview.setLoop(THREE.LoopRepeat, Infinity);
    preview.clampWhenFinished = false;
    const prev = previewCurrentRef.current && previewCurrentRef.current !== preview ? previewCurrentRef.current : null;
    preview.reset();
    if (previewSwitchSafe) {
      const duration = preview.getClip()?.duration || 0;
      if (duration > 0.08) {
        preview.time = Math.min(0.06, duration * 0.08);
      }
    }
    preview.setEffectiveWeight(1);
    preview.setEffectiveTimeScale(1);
    if (previewSwitchSafe && prev && prev.isRunning?.()) {
      preview.play();
      preview.crossFadeFrom(prev, 0.12, false);
      prev.fadeOut?.(0.12);
    } else {
      preview.fadeIn(0.08).play();
    }
    previewCurrentRef.current = preview;
    mixer?.update(1 / 120);
    previewFenceTimerRef.current = window.setTimeout(() => {
      const idleAction = actions.Idle;
      if (idleAction) {
        idleAction.setEffectiveWeight(idleOnlyPreview ? 1 : 0.12);
      }

      Object.entries(actions).forEach(([key, action]) => {
        if (!action) return;
        if (key === "Idle" || key === previewActionName) return;
        action.fadeOut?.(0.06);
        action.stop();
        action.enabled = false;
      });

      setPreviewReady(true);
      previewFenceTimerRef.current = null;
    }, previewSwitchSafe && !idleOnlyPreview ? 110 : 0);
    onPreviewApplied(previewAnimationName || previewActionName);
  }, [
    actions,
    previewMode,
    previewAnimationName,
    previewAnimationUrl,
    previewGuardMode,
    previewSwitchSafe,
    previewActionName,
    mixer,
    onPreviewApplied,
  ]);

  useEffect(() => {
    return () => {
      if (previewFenceTimerRef.current) {
        window.clearTimeout(previewFenceTimerRef.current);
        previewFenceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previewMode) return;
    if (!ctrlRef.current) return;
    ctrlRef.current.update({
      isWaving,
      isTalking,
      interruptSeq,
      userSpeaking,
    });
  }, [isWaving, isTalking, interruptSeq, userSpeaking, previewMode]);

  useEffect(() => {
    const skinned = findFirstSkinnedMesh(model);
    const bones = skinned?.skeleton?.bones || [];
    const boneSet = new Set(bones.map((bone) => bone.name));
    const names = previewMode
      ? ["Idle", previewActionName]
      : ["Idle", "Wave", "Listening", "Talking1", "Talking2", "Talking3"];

    names.forEach((name) => {
      summarizeClipMatch({
        clip: clips.find((clipItem) => clipItem.name === name),
        boneSet,
      });
    });
  }, [model, actions, clips, previewMode, previewActionName]);

  useEffect(() => {
    if (previewMode) return;
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
  }, [interruptSeq, isSessionActive, isTalking, isWaving, previewMode, userSpeaking]);

  return (
    <group ref={group} visible={!previewMode || previewReady} {...threeProps}>
      <group position={fitTransform.position} scale={fitTransform.scale}>
        <primitive object={model} />
      </group>
    </group>
  );
}

export default Avatar;
