import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

afterEach(() => cleanup());
configure({ asyncUtilTimeout: 5000 });

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
