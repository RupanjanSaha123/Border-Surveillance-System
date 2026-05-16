/**
 * api.js — centralised fetch wrapper for the BSC-DOP backend.
 * Base URL is read from Vite env (VITE_API_URL) with a fallback to localhost.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ─── Token helpers ────────────────────────────────────────────────────────────
// Using an in-memory variable instead of sessionStorage/localStorage to ensure
// no user information is stored after the website is refreshed or relaunched.

let _token = null;

export const getToken = () => _token;
export const setToken = (t) => { _token = t; };
export const clearToken = () => { _token = null; };

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail ?? 'Request failed'), { status: res.status });
  }

  // 204 No Content — return null
  if (res.status === 204) return null;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login({ officerId, password }) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ officerId, password, unitCode: "MOCK" }), // backend handles unitCode now
  });
  setToken(data.access_token);
  return data;   // { access_token, officer_id, call_sign, unit_code, login_time }
}

export async function register(body) {
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function verifyOtp({ officerId, otp }) {
  return apiFetch('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ officerId, otp }),
  });
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function fetchAlerts({ skip = 0, limit = 50, sector, alertType } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (sector) params.set('sector', sector);
  if (alertType) params.set('alert_type', alertType);
  return apiFetch(`/api/alerts?${params}`);
}

export async function createAlert(body) {
  return apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify(body) });
}

export async function acknowledgeAlert(id, callSign) {
  return apiFetch(`/api/alerts/${id}/acknowledge`, {
    method: 'PATCH',
    body: JSON.stringify({ call_sign: callSign }),
  });
}

export async function deleteAlert(id) {
  return apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
}

// ─── Alert SSE stream ─────────────────────────────────────────────────────────

/**
 * Opens a Server-Sent Events connection to /api/alerts/stream.
 * @param {(alert: object) => void} onAlert  called for each new alert
 * @param {() => void}             onError  called when the stream errors / closes
 * @returns {() => void}  call this to close the connection
 */
export function subscribeAlerts(onAlert, onError) {
  const token = getToken();
  // SSE can't set headers — pass token as query param
  const url = `${BASE}/api/alerts/stream?token=${token}`;
  const es = new EventSource(url);

  es.addEventListener('alert', (e) => {
    try {
      onAlert(JSON.parse(e.data));
    } catch { /* ignore malformed */ }
  });

  es.addEventListener('heartbeat', () => { /* keep-alive — no-op */ });

  es.onerror = () => {
    onError?.();
    es.close();
  };

  return () => es.close();
}

// ─── Drones ───────────────────────────────────────────────────────────────────

export async function fetchDrones() {
  return apiFetch('/api/drones');
}

/**
 * Opens a WebSocket connection to /api/drones/ws.
 * @param {(drones: object[]) => void} onTelemetry
 * @returns {() => void}  close fn
 */
export function subscribeDrones(onTelemetry) {
  const token = getToken();
  const wsBase = BASE.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/api/drones/ws?token=${token}`);

  let pingInterval;

  ws.onopen = () => {
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 20_000);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'telemetry') onTelemetry(msg.drones);
    } catch { /* ignore */ }
  };

  ws.onerror = () => ws.close();

  return () => {
    clearInterval(pingInterval);
    ws.close();
  };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function fetchSettings() {
  return apiFetch('/api/settings');
}

export async function updateSettings(patch) {
  return apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) });
}

// ─── System status ────────────────────────────────────────────────────────────

export async function fetchStatus() {
  return apiFetch('/api/status');
}

// ─── AI Detection ─────────────────────────────────────────────────────────────

export async function registerAICamera({ camera_id, url, sector }) {
  return apiFetch('/api/detection/cameras', {
    method: 'POST',
    body: JSON.stringify({ camera_id, url, sector }),
  });
}

export async function unregisterAICamera(cameraId) {
  return apiFetch(`/api/detection/cameras/${cameraId}`, { method: 'DELETE' });
}

export async function fetchAICameras() {
  return apiFetch('/api/detection/cameras');
}

export async function fetchAIStatus() {
  return apiFetch('/api/detection/status');
}

export async function fetchAIResults() {
  return apiFetch('/api/detection/results');
}

export async function updateAIConfig(patch) {
  return apiFetch('/api/detection/config', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * Get the AI-annotated stream URL for a camera.
 * This replaces the raw feed with bounding boxes + detection HUD.
 */
export function getAIStreamUrl(cameraId) {
  return `${BASE}/api/detection/stream/${cameraId}`;
}

/**
 * WebSocket for real-time AI detection data.
 * @param {(data: object) => void} onDetection  called with detection updates
 * @returns {() => void}  close fn
 */
export function subscribeDetections(onDetection) {
  const token = getToken();
  const wsBase = BASE.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/api/detection/ws?token=${token}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      onDetection(msg);
    } catch { /* ignore */ }
  };

  ws.onerror = () => ws.close();

  return () => ws.close();
}

// ─── AI Detection History (Phase 4) ───────────────────────────────────────────

export async function fetchDetectionHistory({ camera_id, limit = 50, skip = 0, fire_only = false, weapons_only = false } = {}) {
  const params = new URLSearchParams({ limit, skip });
  if (camera_id) params.set('camera_id', camera_id);
  if (fire_only) params.set('fire_only', 'true');
  if (weapons_only) params.set('weapons_only', 'true');
  return apiFetch(`/api/detection/history?${params}`);
}

export async function fetchDetectionStats(hours = 24) {
  return apiFetch(`/api/detection/history/stats?hours=${hours}`);
}

export async function tuneAIPerformance() {
  return apiFetch('/api/detection/performance/tune', { method: 'POST' });
}
