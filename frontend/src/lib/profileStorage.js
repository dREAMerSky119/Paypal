/**
 * Browser demo store. Replace these functions with backend profile/session
 * calls when the authentication API is available. Passwords are never stored.
 */
export const PROFILE_STORAGE_KEY = "wayfare.demo.profiles.v1";
export const SESSION_STORAGE_KEY = "wayfare.demo.session.v1";

function browserStorage(kind) {
  if (typeof window === "undefined") return null;
  try { return window[kind]; } catch { return null; }
}

function normalizedEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readProfiles() {
  const storage = browserStorage("localStorage");
  if (!storage) return {};
  try {
    const value = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function getSavedProfile(email) {
  const key = normalizedEmail(email);
  return key ? readProfiles()[key] || null : null;
}

export function saveProfile(email, profile) {
  const storage = browserStorage("localStorage");
  if (!storage) throw new Error("Browser profile storage is unavailable.");
  const key = normalizedEmail(email);
  const profiles = readProfiles();
  const saved = { ...profile, email: key, updatedAt: new Date().toISOString() };
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ ...profiles, [key]: saved }));
  return saved;
}

export function readDemoSession() {
  const storage = browserStorage("sessionStorage");
  if (!storage) return null;
  try {
    const session = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) || "null");
    const email = normalizedEmail(session?.email);
    return email ? { email } : null;
  } catch { return null; }
}

export function writeDemoSession(email) {
  const storage = browserStorage("sessionStorage");
  if (!storage) throw new Error("Temporary browser session storage is unavailable.");
  const key = normalizedEmail(email);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: key, startedAt: new Date().toISOString() }));
  return { email: key };
}

export function clearDemoSession() {
  browserStorage("sessionStorage")?.removeItem(SESSION_STORAGE_KEY);
}
