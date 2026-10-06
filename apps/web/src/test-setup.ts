import "@testing-library/jest-dom/vitest";

// jsdom has no layout/media-query APIs; retain production portals and focus.
if (!window.matchMedia) window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Floating UI's detached-reference detection needs nonzero geometry. jsdom
// has no layout engine; supply a deterministic viewport/box without replacing
// portals, focus traps, keyboard handlers or the production provider.
const nativeOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")?.get;
const nativeOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")?.get;
const nativeBoundingRect = HTMLElement.prototype.getBoundingClientRect;
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.matches('button[aria-haspopup="menu"]') ? 100 : nativeOffsetWidth?.call(this) ?? 0; } });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return this.matches('button[aria-haspopup="menu"]') ? 30 : nativeOffsetHeight?.call(this) ?? 0; } });
Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1024 });
Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 768 });
HTMLElement.prototype.getBoundingClientRect = function () { return this.matches('button[aria-haspopup="menu"]') ? DOMRect.fromRect({ x: 0, y: 0, width: this.offsetWidth, height: this.offsetHeight }) : nativeBoundingRect.call(this); };
