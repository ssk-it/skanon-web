import { lireRattachementsPiste } from "@ssk-it/canon-check/pistes";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { inject } from "../injection";
import { Scoping } from "../model/model";
import { signal } from "../signaux";

/**
 * Une piste : ce qu'on envisage pour le produit, porté par une issue du dépôt
 * de référentiel étiquetée `piste` (cadrage 2026-058, RG-piste-definition).
 *
 * Elle n'appartient pas au référentiel : elle n'a ni identifiant de cadrage,
 * ni statut, et ne se mêle jamais à ce que le dépôt contient.
 */
export interface RoadmapItemIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
  /** Le titre du jalon, qui porte l'horizon ; `null` sans jalon. */
  readonly milestone: string | null;
}

/** Une piste telle qu'une vue la montre : son état « en cours » déduit des cadrages. */
export interface RoadmapItemView extends RoadmapItemIssue {
  /** Les cadrages non livrés qui la citent par un lien `piste` — RG-piste-etat-deduit. */
  readonly scopingsInProgress: readonly string[];
}

export type Horizon = "maintenant" | "ensuite" | "plus-tard" | "non-classee";

export interface HorizonGroup {
  readonly horizon: Horizon;
  readonly roadmapItems: readonly RoadmapItemView[];
}

export type RoadmapItemsState =
  "inactif" | "chargement" | "pret" | "droit-manquant" | "erreur";

/** Les horizons dans leur ordre d'affichage — RG-piste-horizon. */
const HORIZON_ORDER: readonly Horizon[] = [
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
function horizonOfMilestone(milestone: string | null): Horizon {
  const key = (milestone ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return (HORIZON_ORDER as readonly string[]).includes(key) &&
    key !== "non-classee"
    ? (key as Horizon)
    : "non-classee";
}

/** Le numéro d'une issue de ce dépôt que désigne une adresse, ou `null`. */
function issueNumber(url: string, repoRef: RepoRef): number | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(
    url.trim(),
  );
  if (!m) return null;
  const sameRepo =
    m[1].toLowerCase() === repoRef.owner.toLowerCase() &&
    m[2].toLowerCase() === repoRef.repo.toLowerCase();
  return sameRepo ? Number(m[3]) : null;
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
export function linkedRoadmapItems(
  issues: readonly RoadmapItemIssue[],
  collection: "domains" | "features",
  id: string,
  scopings: readonly Scoping[],
  repoRef: RepoRef,
): RoadmapItemView[] {
  const inProgress = new Map<number, string[]>();
  for (const c of scopings) {
    if (c.status === "livree") continue;
    for (const link of c.links) {
      if (link.tag !== "piste") continue;
      const number = issueNumber(link.url, repoRef);
      if (number === null) continue;
      inProgress.set(number, [...(inProgress.get(number) ?? []), c.id]);
    }
  }

  return issues
    .filter((i) =>
      lireRattachementsPiste(i.labels).some(
        (r) => r.collection === collection && r.id === id,
      ),
    )
    .map((i) => ({ ...i, scopingsInProgress: inProgress.get(i.number) ?? [] }));
}

/** Range les pistes par horizon, sans groupe vide — RG-piste-horizon. */
export function groupByHorizon(
  roadmapItems: readonly RoadmapItemView[],
): HorizonGroup[] {
  return HORIZON_ORDER.map((horizon) => ({
    horizon,
    roadmapItems: roadmapItems.filter(
      (p) => horizonOfMilestone(p.milestone) === horizon,
    ),
  })).filter((g) => g.roadmapItems.length > 0);
}

/**
 * La roadmap d'un projet : ses pistes, lues une fois par projet.
 *
 * Une seule liste sert toutes les vues : un lecteur qui passe d'un domaine à
 * l'autre ne repaie pas l'appel (RG-pistes-a-part). Elle passe par la file
 * régulée du client, comme tout appel à l'API (INV-6).
 */
export class RoadmapItemsService {
  private readonly github = inject(GithubClient);

  readonly state = signal<RoadmapItemsState>("inactif");
  readonly issues = signal<readonly RoadmapItemIssue[]>([]);
  readonly error = signal<string | null>(null);

  private key: string | null = null;
  private inFlight: Promise<void> | null = null;

  load(repoRef: RepoRef): Promise<void> {
    const key = `${repoRef.owner}/${repoRef.repo}`.toLowerCase();
    if (key === this.key && this.inFlight) return this.inFlight;

    this.key = key;
    this.state.set("chargement");
    this.issues.set([]);
    this.error.set(null);
    this.inFlight = this.read(repoRef, key);
    return this.inFlight;
  }

  private async read(repoRef: RepoRef, key: string): Promise<void> {
    try {
      const raw = await this.github.listRoadmapItems(repoRef);
      if (key !== this.key) return;
      this.issues.set(
        raw.map((i) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          labels: i.labels
            .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
            .filter((l) => l !== ""),
          milestone: i.milestone?.title ?? null,
        })),
      );
      this.state.set("pret");
    } catch (e) {
      if (key !== this.key) return;
      // Un 403 qui n'est pas un quota épuisé : le jeton n'a pas le droit de
      // lire les issues. Le dire tel quel, plutôt qu'une section vide qui se
      // lirait « rien n'est envisagé » (RG-message-nomme-la-cause).
      if (e instanceof GithubError && e.status === 403 && !e.quotaExhausted) {
        this.state.set("droit-manquant");
        return;
      }
      this.error.set(
        e instanceof Error ? e.message : "Les pistes n'ont pas pu être lues.",
      );
      this.state.set("erreur");
      // Une erreur ne se garde pas : la vue suivante retentera.
      this.inFlight = null;
    }
  }
}
