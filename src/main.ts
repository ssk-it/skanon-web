import { start } from "./startup";
import { createWebPlatform } from "./platform/web";
import { webExtension } from "./web/extension";

/**
 * La racine de composition de la version web : les adaptateurs du navigateur, et ce que ce livrable apporte (ADR-extensions-commerciales).
 */
void start({
  platform: createWebPlatform(),
  extensions: [webExtension()],
});
