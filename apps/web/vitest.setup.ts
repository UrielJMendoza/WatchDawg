import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia; stub it so components that read
// prefers-reduced-motion etc. can render in tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
