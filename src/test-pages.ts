import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, RouterView } from "vue-router";
import { provideHttpTesting } from "./core/http/http-testing";
import { provide } from "./core/injection";
import { COMPOSITION, composer } from "./extension/composer";
import type { Extension } from "./extension/extension";
import { PLATEFORME } from "./plateforme/jeton";
import { createPlateformeWeb } from "./plateforme/web";
import { createRouteur } from "./routeur";

/**
 * Une page hors projet — l'aide, les mentions —, telle qu'un livrable la montre : sa cible, ses extensions. Pour les tests des extensions, qui éprouvent leurs apports dans la page qui les rend.
 */
export async function montePage(
  adresse: string,
  cible: "web" | "bureau",
  extensions: readonly Extension[],
): Promise<VueWrapper> {
  provideHttpTesting();
  provide(PLATEFORME, { ...createPlateformeWeb(), cible });
  provide(COMPOSITION, composer(extensions));
  const routeur = createRouteur(createMemoryHistory());
  await routeur.push(adresse);
  await routeur.isReady();
  const vue = mount(RouterView, { global: { plugins: [routeur] } });
  await flushPromises();
  return vue;
}

/** Le texte de cette page. */
export async function textePage(
  adresse: string,
  cible: "web" | "bureau",
  extensions: readonly Extension[],
): Promise<string> {
  return (await montePage(adresse, cible, extensions)).text();
}
