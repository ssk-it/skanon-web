import { afterEach } from "vitest";
import { resetInjection } from "./core/injection";

// Each test starts again from an empty container, as `TestBed.resetTestingModule` did.
afterEach(() => {
  resetInjection();
  // A test may have replaced storage with one that refuses everything: the refusal is its subject, not a cleanup error.
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      storage.clear();
    } catch {
      /* a test's fake storage */
    }
  }
});

// jsdom lays nothing out and does not implement `scrollTo`, which the router's scrolling calls on every navigation (`src/router.ts`): without this fake, every routed page test writes it to the console.
window.scrollTo = () => {};
