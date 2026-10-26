import { lireRattachementsPiste } from "@ssk-it/canon-check/pistes";
import { GithubClient, GithubError, RefDepot } from "../github/github-client";
import { inject } from "../injection";
import { Cadrage } from "../model/model";
import { signal } from "../signaux";

/**
 * Une piste : ce qu'on envisage pour le produit, porté par une issue du dépôt
 * de référentiel étiquetée `piste` (cadrage 2026-058, RG-piste-definition).
 *
 * Elle n'appartient pas au référentiel : elle n'a ni identifiant de cadrage,
 * ni statut, et ne se mêle jamais à ce que le dépôt contient.
 */
export interface IssuePiste {
  readonly numero: number;
  readonly titre: string;
  readonly url: string;
  readonly etiquettes: readonly string[];
  /** Le titre du jalon, qui porte l'horizon ; `null` sans jalon. */
  readonly jalon: string | null;
}

/** Une piste telle qu'une vue la montre : son état « en cours » déduit des cadrages. */
export interface PisteVue extends IssuePiste {
  /** Les cadrages non livrés qui la citent par un lien `piste` — RG-piste-etat-deduit. */
  readonly cadragesEnCours: readonly string[];
}

export type Horizon = "maintenant" | "ensuite" | "plus-tard" | "non-classee";

export interface GroupeHorizon {
  readonly horizon: Horizon;
  readonly pistes: readonly PisteVue[];
}

export type EtatPistes =
  "inactif" | "chargement" | "pret" | "droit-manquant" | "erreur";

/** Les horizons dans leur ordre d'affichage — RG-piste-horizon. */
const ORDRE_HORIZONS: readonly Horizon[] = [
  "maintenant",
  "ensuite",
  "plus-tard",
  "non-classee",
];

/**
 * Lit l'horizon dans le titre d'un jalon.
 *
 * La casse et les accents ne comptent pas : « Plus tard » et « plus-tard »
 * désignent le même horizon. Un jalon d'un autre nom ne dit pas d'horizon, et
 * sa piste se range avec les non classées plutôt que de passer devant.
 */
function horizonDuJalon(jalon: string | null): Horizon {
  const cle = (jalon ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return (ORDRE_HORIZONS as readonly string[]).includes(cle) &&
    cle !== "non-classee"
    ? (cle as Horizon)
    : "non-classee";
}

/** Le numéro d'une issue de ce dépôt que désigne une adresse, ou `null`. */
function numeroIssue(url: string, depot: RefDepot): number | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(
    url.trim(),
  );
  if (!m) return null;
  const memeDepot =
    m[1].toLowerCase() === depot.owner.toLowerCase() &&
    m[2].toLowerCase() === depot.repo.toLowerCase();
  return memeDepot ? Number(m[3]) : null;
}

/**
 * Les pistes rattachées à un domaine ou à une fonctionnalité, avec les
 * cadrages non livrés qui les citent.
 *
 * Le rattachement se lit comme l'automatisation le vérifie, par la
 * bibliothèque commune (INV-7, RG-piste-rattachee). Le lien va du cadrage vers
 * la piste, jamais l'inverse : seul un lien de nature `piste` vers une issue
 * de ce dépôt compte.
 */
export function pistesRattachees(
  issues: readonly IssuePiste[],
  collection: "domains" | "features",
  id: string,
  cadrages: readonly Cadrage[],
  depot: RefDepot,
): PisteVue[] {
  const enCours = new Map<number, string[]>();
  for (const c of cadrages) {
    if (c.statut === "livree") continue;
    for (const lien of c.liens) {
      if (lien.tag !== "piste") continue;
      const numero = numeroIssue(lien.url, depot);
      if (numero === null) continue;
      enCours.set(numero, [...(enCours.get(numero) ?? []), c.id]);
    }
  }

  return issues
    .filter((i) =>
      lireRattachementsPiste(i.etiquettes).some(
        (r) => r.collection === collection && r.id === id,
      ),
    )
    .map((i) => ({ ...i, cadragesEnCours: enCours.get(i.numero) ?? [] }));
}

/** Range les pistes par horizon, sans groupe vide — RG-piste-horizon. */
export function grouperParHorizon(
  pistes: readonly PisteVue[],
): GroupeHorizon[] {
  return ORDRE_HORIZONS.map((horizon) => ({
    horizon,
    pistes: pistes.filter((p) => horizonDuJalon(p.jalon) === horizon),
  })).filter((g) => g.pistes.length > 0);
}

/**
 * La roadmap d'un projet : ses pistes, lues une fois par projet.
 *
 * Une seule liste sert toutes les vues : un lecteur qui passe d'un domaine à
 * l'autre ne repaie pas l'appel (RG-pistes-a-part). Elle passe par la file
 * régulée du client, comme tout appel à l'API (INV-6).
 */
export class PistesService {
  private readonly github = inject(GithubClient);

  readonly etat = signal<EtatPistes>("inactif");
  readonly issues = signal<readonly IssuePiste[]>([]);
  readonly erreur = signal<string | null>(null);

  private cle: string | null = null;
  private enVol: Promise<void> | null = null;

  charger(depot: RefDepot): Promise<void> {
    const cle = `${depot.owner}/${depot.repo}`.toLowerCase();
    if (cle === this.cle && this.enVol) return this.enVol;

    this.cle = cle;
    this.etat.set("chargement");
    this.issues.set([]);
    this.erreur.set(null);
    this.enVol = this.lire(depot, cle);
    return this.enVol;
  }

  private async lire(depot: RefDepot, cle: string): Promise<void> {
    try {
      const brutes = await this.github.listPistes(depot);
      if (cle !== this.cle) return;
      this.issues.set(
        brutes.map((i) => ({
          numero: i.number,
          titre: i.title,
          url: i.html_url,
          etiquettes: i.labels
            .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
            .filter((l) => l !== ""),
          jalon: i.milestone?.title ?? null,
        })),
      );
      this.etat.set("pret");
    } catch (e) {
      if (cle !== this.cle) return;
      // Un 403 qui n'est pas un quota épuisé : le jeton n'a pas le droit de
      // lire les issues. Le dire tel quel, plutôt qu'une section vide qui se
      // lirait « rien n'est envisagé » (RG-message-nomme-la-cause).
      if (e instanceof GithubError && e.statut === 403 && !e.quotaEpuise) {
        this.etat.set("droit-manquant");
        return;
      }
      this.erreur.set(
        e instanceof Error ? e.message : "Les pistes n'ont pas pu être lues.",
      );
      this.etat.set("erreur");
      // Une erreur ne se garde pas : la vue suivante retentera.
      this.enVol = null;
    }
  }
}
