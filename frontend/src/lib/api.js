import { API_BASE } from "./config";
import { getToken } from "./auth";

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Request failed");
  }
  return data;
}

export async function authRequestCaptcha(purpose) {
  const response = await fetch(`${API_BASE}/auth/captcha/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose }),
  });
  return parseJson(response);
}

export async function authSendRegisterCode(phoneNumber, captchaId, captchaAnswer, turnstileToken = "") {
  const response = await fetch(`${API_BASE}/auth/register/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: phoneNumber,
      captcha_id: captchaId,
      captcha_answer: captchaAnswer,
      turnstile_token: turnstileToken,
    }),
  });
  return parseJson(response);
}

export async function authRegister(username, password, phoneNumber, smsCode) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      phone_number: phoneNumber,
      sms_code: smsCode,
    }),
  });
  return parseJson(response);
}

export async function authLogin(username, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseJson(response);
}

export async function authMe() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  });
  return parseJson(response);
}

export async function authSendResetCode(phoneNumber, captchaId, captchaAnswer, turnstileToken = "") {
  const response = await fetch(`${API_BASE}/auth/password/send-reset-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: phoneNumber,
      captcha_id: captchaId,
      captcha_answer: captchaAnswer,
      turnstile_token: turnstileToken,
    }),
  });
  return parseJson(response);
}

export async function authResetPassword(phoneNumber, smsCode, newPassword) {
  const response = await fetch(`${API_BASE}/auth/password/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: phoneNumber,
      sms_code: smsCode,
      new_password: newPassword,
    }),
  });
  return parseJson(response);
}

export async function listPresets() {
  const response = await fetch(`${API_BASE}/presets`);
  return parseJson(response);
}

export async function createFromPreset(presetName) {
  const response = await fetch(`${API_BASE}/pipeline/preset`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ preset_name: presetName }),
  });
  return parseJson(response);
}

export async function createFromText(prompt) {
  const response = await fetch(`${API_BASE}/pipeline/text`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt }),
  });
  return parseJson(response);
}

export async function polishText(prompt) {
  const response = await fetch(`${API_BASE}/pipeline/polish-text`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt }),
  });
  return parseJson(response);
}

export async function createFromImage(file) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_BASE}/pipeline/image`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return parseJson(response);
}

export async function saveModel(payload) {
  const response = await fetch(`${API_BASE}/models/save`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function myModels({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const response = await fetch(`${API_BASE}/models/my?${params.toString()}`, {
    headers: authHeaders(),
  });
  return parseJson(response);
}

export async function myHistory({ q = "", start = "", end = "", page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const response = await fetch(`${API_BASE}/history/my?${params.toString()}`, {
    headers: authHeaders(),
  });
  return parseJson(response);
}

export async function getHistoryDetail(sessionId) {
  const response = await fetch(`${API_BASE}/history/${sessionId}`, {
    headers: authHeaders(),
  });
  return parseJson(response);
}

export async function startRig(payload) {
  const response = await fetch(`${API_BASE}/pipeline/rig`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function getRigStatus(taskId) {
  const response = await fetch(`${API_BASE}/pipeline/rig/${taskId}`, {
    headers: authHeaders(),
  });
  return parseJson(response);
}

export async function listAnimations(presetName = "") {
  const params = new URLSearchParams();
  if (presetName) params.set("preset_name", presetName);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/animations${suffix}`);
  return parseJson(response);
}

export async function retryPipeline(payload) {
  const response = await fetch(`${API_BASE}/pipeline/retry`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function listSceneLibrary({ query = "office", page = 1, perPage = 12 } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  const response = await fetch(`${API_BASE}/scenes/library?${params.toString()}`);
  return parseJson(response);
}

export async function generateSceneBackground(prompt) {
  const response = await fetch(`${API_BASE}/scenes/generate`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt }),
  });
  return parseJson(response);
}

export async function polishSceneText(prompt) {
  const response = await fetch(`${API_BASE}/scenes/polish-text`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt }),
  });
  return parseJson(response);
}

export async function transcribeSpeech(file) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_BASE}/speech/transcribe`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return parseJson(response);
}

export async function uploadRecording({ file, modelId = null, sessionId = null, durationMs = 0 }) {
  const body = new FormData();
  body.append("file", file);
  if (modelId) body.append("model_id", String(modelId));
  if (sessionId) body.append("session_id", String(sessionId));
  body.append("duration_ms", String(durationMs));
  const response = await fetch(`${API_BASE}/recordings/upload`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Request failed");
  }
  return data;
}

export async function myRecordings({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const response = await fetch(`${API_BASE}/recordings/my?${params.toString()}`, {
    headers: authHeaders(),
  });
  return parseJson(response);
}

export async function sendMultimodalChat({ text = "", files = [], modelId = null, sessionId = null, voiceHint = "" } = {}) {
  const body = new FormData();
  const trimmed = String(text || "").trim();
  if (trimmed) body.append("text", trimmed);
  if (modelId) body.append("model_id", String(modelId));
  if (sessionId) body.append("session_id", String(sessionId));
  if (voiceHint) body.append("voice_hint", String(voiceHint));
  for (const file of files) {
    body.append("files", file);
  }
  const response = await fetch(`${API_BASE}/chat/multimodal`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return parseJson(response);
}

export async function requestAssistantSpeech({ text = "", modelId = null, sessionId = null, voiceHint = "", signal } = {}) {
  const body = new FormData();
  const trimmed = String(text || "").trim();
  if (trimmed) body.append("text", trimmed);
  if (modelId) body.append("model_id", String(modelId));
  if (sessionId) body.append("session_id", String(sessionId));
  if (voiceHint) body.append("voice_hint", String(voiceHint));

  const response = await fetch(`${API_BASE}/chat/assistant-speech`, {
    method: "POST",
    headers: authHeaders(),
    body,
    signal,
  });
  return parseJson(response);
}

export async function streamDocumentRead({
  text = "",
  files = [],
  modelId = null,
  sessionId = null,
  voiceHint = "",
  signal,
  onEvent,
} = {}) {
  const body = new FormData();
  const trimmed = String(text || "").trim();
  if (trimmed) body.append("text", trimmed);
  if (modelId) body.append("model_id", String(modelId));
  if (sessionId) body.append("session_id", String(sessionId));
  if (voiceHint) body.append("voice_hint", String(voiceHint));
  for (const file of files) {
    body.append("files", file);
  }

  const response = await fetch(`${API_BASE}/chat/document-read-stream`, {
    method: "POST",
    headers: authHeaders(),
    body,
    signal,
  });

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const data = await response.json();
      detail = data.detail || data.message || detail;
    } catch {
      const textBody = await response.text().catch(() => "");
      if (textBody) detail = textBody;
    }
    throw new Error(detail);
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const event = JSON.parse(line);
        onEvent?.(event);
        if (event?.type === "error" && event?.message) {
          streamError = String(event.message);
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      const lastLine = buffer.trim();
      if (lastLine) {
        const event = JSON.parse(lastLine);
        onEvent?.(event);
        if (event?.type === "error" && event?.message) {
          streamError = String(event.message);
        }
      }
      break;
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
}
