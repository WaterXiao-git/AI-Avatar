import { API_BASE } from "./config";

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Request failed");
  }
  return data;
}

export async function createFromText(prompt) {
  const response = await fetch(`${API_BASE}/pipeline/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return parseJson(response);
}

export async function createFromImage(file) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_BASE}/pipeline/image`, {
    method: "POST",
    body,
  });
  return parseJson(response);
}

export async function startFakeRig(payload) {
  const response = await fetch(`${API_BASE}/pipeline/fake-rig`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function getFakeRigStatus(taskId) {
  const response = await fetch(`${API_BASE}/pipeline/fake-rig/${taskId}`);
  return parseJson(response);
}

export async function listAnimations() {
  const response = await fetch(`${API_BASE}/animations`);
  return parseJson(response);
}
