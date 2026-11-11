import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { setDisplayCurrency } from "../lib/fx.js";
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "../lib/profileStorage.js";

afterEach(() => { cleanup(); setDisplayCurrency("USD"); }); // display currency is shared module state
configure({ asyncUtilTimeout: 5000 });

// Most tests exercise pages inside the (now auth-gated) dashboard, so they run
// with a signed-in demo profile. AuthFlow.test.jsx clears both storages in its
// own beforeEach, which runs after this one, so it still controls its state.
beforeEach(() => {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
    "demo@agency.com": { email: "demo@agency.com", fullName: "Alex Morgan", designation: "Travel designer", agencyType: "self-employed" },
  }));
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: "demo@agency.com" }));
});

// jsdom lacks these; framer-motion and the router's scroll handling need them.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
globalThis.IntersectionObserver = IntersectionObserverStub;
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
}));
