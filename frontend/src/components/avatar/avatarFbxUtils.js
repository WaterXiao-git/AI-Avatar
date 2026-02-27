export function findFirstSkinnedMesh(root) {
  if (!root) return null;
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.isSkinnedMesh) found = obj;
  });
  return found;
}

export function normalizeTrackTarget(name) {
  const last = String(name).split("|").pop();
  return String(last).split(".")[0];
}

export function removeRootPositionTracks(clip, rootBoneName = "mixamorigHips") {
  if (!clip) return clip;
  const cloned = clip.clone();
  cloned.tracks = cloned.tracks.filter((track) => {
    const name = String(track.name);
    return !name.endsWith(`${rootBoneName}.position`) && !name.includes(`|${rootBoneName}.position`);
  });
  return cloned;
}

export function removeLowerBodyTracks(
  clip,
  {
    removeHipsRotation = false,
    lowerBones = [
      "mixamorigLeftUpLeg",
      "mixamorigRightUpLeg",
      "mixamorigLeftLeg",
      "mixamorigRightLeg",
      "mixamorigLeftFoot",
      "mixamorigRightFoot",
      "mixamorigLeftToeBase",
      "mixamorigRightToeBase",
    ],
  } = {},
) {
  if (!clip) return clip;
  const cloned = clip.clone();
  const deny = new Set(lowerBones);

  cloned.tracks = cloned.tracks.filter((track) => {
    const target = normalizeTrackTarget(track.name);
    if (deny.has(target)) {
      return false;
    }
    if (removeHipsRotation && target === "mixamorigHips" && String(track.name).endsWith(".quaternion")) {
      return false;
    }
    if (String(track.name).endsWith(".scale")) {
      return false;
    }
    return true;
  });
  return cloned;
}

export function summarizeClipMatch({ clip, boneSet }) {
  if (!clip) {
    return { targets: [], hit: [], miss: [], rate: 0 };
  }
  const trackNames = clip.tracks.map((track) => track.name);
  const targets = Array.from(new Set(trackNames.map(normalizeTrackTarget)));
  const hit = targets.filter((target) => boneSet.has(target));
  const miss = targets.filter((target) => !boneSet.has(target));
  const rate = targets.length ? hit.length / targets.length : 0;
  return { targets, hit, miss, rate };
}

export function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + (item.weight || 0), 0);
  if (total <= 0) return items[0]?.key;
  let random = Math.random() * total;
  for (const item of items) {
    random -= item.weight || 0;
    if (random <= 0) return item.key;
  }
  return items[items.length - 1]?.key;
}
