import { start } from "./startup";
import { createWebPlatform } from "./platform/web";
import { webExtension } from "./web/extension";

/**
 * The web version's composition root: the browser adapters, and what this deliverable contributes (ADR-extensions-commerciales).
 */
void start({
  platform: createWebPlatform(),
  extensions: [webExtension()],
});
