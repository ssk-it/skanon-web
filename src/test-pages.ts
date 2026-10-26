import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, RouterView } from "vue-router";
import type { Language } from "./core/i18n/language";
import { LocaleService } from "./core/i18n/locale.service";
import { provideHttpTesting } from "./core/http/http-testing";
import { inject, provide } from "./core/injection";
import { COMPOSITION, compose } from "./extension/composer";
import type { Extension } from "./extension/extension";
import { PLATFORM } from "./platform/platform-token";
import { createWebPlatform } from "./platform/web";
import { createAppRouter } from "./router";

/**
 * A page outside any project — help, the legal notice —, as a deliverable shows it: its target, its extensions, the displayed language (French by default). For the extensions' tests, which exercise their contributions in the page that renders them, in each language (RG-textes-traduits).
 */
export async function mountPage(
  address: string,
  target: "web" | "bureau",
  extensions: readonly Extension[],
  language: Language = "fr",
): Promise<VueWrapper> {
  provideHttpTesting();
  inject(LocaleService).choice.set(language);
  provide(PLATFORM, { ...createWebPlatform(), target });
  provide(COMPOSITION, compose(extensions));
  const router = createAppRouter(createMemoryHistory());
  await router.push(address);
  await router.isReady();
  const view = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return view;
}

/** This page's text. */
export async function pageText(
  address: string,
  target: "web" | "bureau",
  extensions: readonly Extension[],
  language: Language = "fr",
): Promise<string> {
  return (await mountPage(address, target, extensions, language)).text();
}
