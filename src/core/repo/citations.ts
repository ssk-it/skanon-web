import { formaterAnomalie } from "@ssk-it/canon-check";
import { lireCitation, referentielsCites } from "@ssk-it/canon-check/citations";
import { LocaleService } from "../i18n/locale.service";
import { inject } from "../injection";
import type { Citation, CitedRepo } from "../model/model";

/*
 * The citation fields of the format — RG-regle-du-socle-citee —, read by
 * `@ssk-it/canon-check`, which the check also applies (INV-7). Only the
 * mapping to the model's names is done here.
 */

/** The `applique` field of a rule or an architecture decision. A malformed entry is left out: the check warns about it. */
export function parseApplies(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((text) => {
    const c = lireCitation(text);
    return c ? [{ prefix: c.prefixe, target: c.id, scoping: c.cadrage }] : [];
  });
}

/** The `referentiels_cites` block of `ssk-canon.yml`, and its faults in the displayed language. */
export function parseCitedRepos(config: unknown): {
  readonly citedRepos: CitedRepo[];
  readonly anomalies: string[];
} {
  const { cites, anomalies } = referentielsCites(config);
  const language = inject(LocaleService).language();
  return {
    citedRepos: [...cites].map(([prefix, repo]) => {
      const [owner, name] = repo.split("/");
      return { prefix, repo: { owner, repo: name } };
    }),
    anomalies: anomalies.map((a) => formaterAnomalie(a, language)),
  };
}
