import { InjectionToken } from "../core/injection";
import type { Platform } from "./ports";
import { createWebPlatform } from "./web";

/**
 * La plateforme choisie au démarrage, que la racine de composition fournit. Sans elle — dans les tests —, celle du navigateur : les tests hérités de SSK Canon lisent et écrivent le stockage local, et la retrouvent ainsi.
 *
 * C'est ce jeton que le cœur et les vues demandent, jamais la racine : eux ne choisissent pas d'adaptateur (docs/pratiques.md, « Les couches »).
 */
export const PLATFORM = new InjectionToken<Platform>("PLATEFORME", {
  factory: createWebPlatform,
});
