import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "../lib/profileStorage.js";

export function seedDemoSession() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
    "demo@agency.com": { email: "demo@agency.com", fullName: "Rain Sharma", designation: "Travel designer", agencyType: "self-employed" },
  }));
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: "demo@agency.com" }));
}
