import type { RepoRef } from "../../core/github/github-client";
import { provide } from "../../core/injection";
import type { IdentityVariant } from "../../core/repo/identity-names";
import { ProjectIdentityService } from "../../core/repo/project-identity.service";
import { signal } from "../../core/signals";

/**
 * Des identités inventées, pour les essais : des formes simples, qui ne reproduisent le logo d'aucun produit réel. SSK Canon s'en servait dans ses stories, que Skanon ne porte pas ; elles restent pour les tests qui montent un symbole.
 */
const svg = (body: string) =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`,
  )}`;

export const FAKE_SYMBOLS = {
  disque: {
    clair: svg(
      '<circle cx="16" cy="16" r="13" fill="#1d4ed8"/><circle cx="16" cy="16" r="5" fill="#facc15"/>',
    ),
    dark: svg(
      '<circle cx="16" cy="16" r="13" fill="#93c5fd"/><circle cx="16" cy="16" r="5" fill="#fde047"/>',
    ),
  },
  triangle: {
    clair: svg('<path d="M16 3 L29 28 H3 Z" fill="#15803d"/>'),
    dark: svg('<path d="M16 3 L29 28 H3 Z" fill="#86efac"/>'),
  },
  /** Une version sans suffixe, qui convient aux deux fonds. */
  losange: svg('<path d="M16 2 L30 16 L16 30 L2 16 Z" fill="#c2410c"/>'),
} as const;

/** Fournit un service d'identités qui répond sans réseau, d'après le nom du dépôt. */
export function provideFakeIdentities(
  byRepo: Record<string, string | Partial<Record<IdentityVariant, string>>>,
): void {
  provide(ProjectIdentityService, {
    generation: signal(0),
    reread: () => {},
    request: async () => {},
    findSymbol: (d: RepoRef, v: IdentityVariant) => {
      const s = byRepo[`${d.owner}/${d.repo}`];
      return (typeof s === "string" ? s : s?.[v]) ?? null;
    },
  } satisfies Partial<ProjectIdentityService>);
}
