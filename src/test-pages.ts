import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, RouterView } from "vue-router";
import { provideHttpTesting } from "./core/http/http-testing";
import { provide } from "./core/injection";
import { COMPOSITION, compose } from "./extension/composer";
import type { Extension } from "./extension/extension";
import { PLATFORM } from "./plateforme/jeton";
import { createWebPlatform } from "./plateforme/web";
import { createAppRouter } from "./routeur";

/**
 * Une page hors projet — l'aide, les mentions —, telle qu'un livrable la montre : sa cible, ses extensions. Pour les tests des extensions, qui éprouvent leurs apports dans la page qui les rend.
 */
export async function mountPage(
  address: string,
  target: "web" | "bureau",
  extensions: readonly Extension[],
): Promise<VueWrapper> {
  provideHttpTesting();
  provide(PLATFORM, { ...createWebPlatform(), target });
  provide(COMPOSITION, compose(extensions));
  const router = createAppRouter(createMemoryHistory());
  await router.push(address);
  await router.isReady();
  const view = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return view;
}

/** Le texte de cette page. */
export async function pageText(
  address: string,
  target: "web" | "bureau",
  extensions: readonly Extension[],
): Promise<string> {
  return (await mountPage(address, target, extensions)).text();
}
