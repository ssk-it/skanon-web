import { InjectionToken } from "../core/injection";
import type { Platform } from "./ports";
import { createWebPlatform } from "./web";

/**
 * The platform chosen at startup, which the composition root provides. Without it — in tests —, the browser's: the tests inherited from SSK Canon read and write local storage, and so find it again.
 *
 * It is this token that the core and the views request, never the root: they do not choose an adapter (docs/practices.md, "Layers").
 */
export const PLATFORM = new InjectionToken<Platform>("PLATEFORME", {
  factory: createWebPlatform,
});
