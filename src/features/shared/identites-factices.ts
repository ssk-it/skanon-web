import type { RefDepot } from "../../core/github/github-client";
import { provide } from "../../core/injection";
import type { VarianteIdentite } from "../../core/repo/identite-noms";
import { IdentitesService } from "../../core/repo/identites.service";
import { signal } from "../../core/signaux";

/**
 * Des identités inventées, pour les essais : des formes simples, qui ne reproduisent le logo d'aucun produit réel. SSK Canon s'en servait dans ses stories, que Skanon ne porte pas ; elles restent pour les tests qui montent un symbole.
 */
const svg = (corps: string) =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${corps}</svg>`,
  )}`;

export const SYMBOLES_FICTIFS = {
  disque: {
    clair: svg(
      '<circle cx="16" cy="16" r="13" fill="#1d4ed8"/><circle cx="16" cy="16" r="5" fill="#facc15"/>',
    ),
    sombre: svg(
      '<circle cx="16" cy="16" r="13" fill="#93c5fd"/><circle cx="16" cy="16" r="5" fill="#fde047"/>',
    ),
  },
  triangle: {
    clair: svg('<path d="M16 3 L29 28 H3 Z" fill="#15803d"/>'),
    sombre: svg('<path d="M16 3 L29 28 H3 Z" fill="#86efac"/>'),
  },
  /** Une version sans suffixe, qui convient aux deux fonds. */
  losange: svg('<path d="M16 2 L30 16 L16 30 L2 16 Z" fill="#c2410c"/>'),
} as const;

/** Fournit un service d'identités qui répond sans réseau, d'après le nom du dépôt. */
export function provideIdentitesFactices(
  parDepot: Record<string, string | Partial<Record<VarianteIdentite, string>>>,
): void {
  provide(IdentitesService, {
    generation: signal(0),
    relire: () => {},
    demander: async () => {},
    findSymbole: (d: RefDepot, v: VarianteIdentite) => {
      const s = parDepot[`${d.owner}/${d.repo}`];
      return (typeof s === "string" ? s : s?.[v]) ?? null;
    },
  } satisfies Partial<IdentitesService>);
}
