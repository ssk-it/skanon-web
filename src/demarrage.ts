import { createApp } from "vue";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/material-symbols-outlined/400.css";
import App from "./App.vue";
import { TokenService } from "./core/github/token.service";
import { inject, provide } from "./core/injection";
import { TitreStrategy } from "./core/repo/titre.strategy";
import { COMPOSITION, composer } from "./extension/composer";
import type { Extension } from "./extension/extension";
import { PLATEFORME } from "./plateforme/jeton";
import type { Plateforme } from "./plateforme/ports";
import { createRouteur } from "./routeur";
import "./styles.css";

/** Ce que la racine de composition d'un livrable choisit : ses adaptateurs, et ses extensions. */
export interface Racine {
  readonly plateforme: Plateforme;
  readonly extensions: readonly Extension[];
}

/** Fournit la plateforme et la composition des extensions ; lève sur une composition fausse, avant que rien ne démarre. */
export function fournirLaRacine(racine: Racine): void {
  const composition = composer(racine.extensions);
  provide(PLATEFORME, racine.plateforme);
  provide(COMPOSITION, composition);
}

/**
 * Le démarrage, que chaque racine appelle (ADR-extensions-commerciales). La plateforme d'abord, puis les jetons : c'est le garde de route qui lance la lecture du dépôt, et il doit la lancer avec le jeton en main plutôt qu'en anonyme.
 */
export async function demarrer(racine: Racine): Promise<void> {
  fournirLaRacine(racine);
  await inject(TokenService).initialiser();

  const routeur = createRouteur();
  // Le titre porte le projet et l'élément consulté : sans eux, l'historique aligne des entrées identiques pour des pages différentes.
  inject(TitreStrategy).attach(routeur);
  await inject(PLATEFORME).liens.listen(
    (lien) => void routeur.push({ path: "/ouvrir", query: { lien } }),
  );

  createApp(App).use(routeur).mount("#app");
}
