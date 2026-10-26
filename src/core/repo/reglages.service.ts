import { inject } from "../injection";
import { GithubClient, GithubError } from "../github/github-client";
import { ReferentielStore } from "./referentiel.store";
import { ReglagesEditables, ecrireReglages } from "./config-ecriture";

export const NOM_CONFIG = "ssk-canon.yml";

/** Branche portant une modification des réglages, distincte de tout cadrage. */
const BRANCHE_REGLAGES = "reglages";

export interface ReglagesProposes {
  readonly branche: string;
  readonly pullRequest: number;
  readonly url: string;
}

/**
 * Lecture et modification des réglages du projet.
 *
 * Les réglages vivent dans le dépôt, donc leur modification suit le même chemin
 * que toute autre : une branche, une demande de fusion. Écrire directement sur
 * la branche principale contournerait la relecture — pour un fichier qui décide
 * du comportement de l'outil pour tout le monde.
 */
export class ReglagesService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(ReferentielStore);

  /**
   * Propose une modification des réglages.
   *
   * La branche est réutilisée si elle existe déjà : deux modifications
   * successives avant relecture appartiennent à la même proposition, et ouvrir
   * une seconde demande obligerait à en fermer une.
   */
  async proposerReglages(
    reglages: ReglagesEditables,
  ): Promise<ReglagesProposes> {
    const depot = this.store.depot();
    const base = (await this.github.loadDepot(depot)).defaultBranch;

    const branche = BRANCHE_REGLAGES;
    const dejaOuverte = (
      await this.github.listBranches(depot, branche)
    ).includes(branche);

    if (!dejaOuverte) {
      const depuis = await this.github.shaDeBranche(depot, base);
      try {
        await this.github.createBranche(depot, branche, depuis);
      } catch (e) {
        // Une branche déjà là n'est pas un échec — elle porte une proposition en
        // cours. Tout le reste l'est, et le taire ferait échouer la lecture
        // suivante sur une branche absente, loin de la cause.
        if (e instanceof GithubError && e.statut !== 422) throw e;
      }
    }

    // Lu depuis la branche des réglages, non depuis la principale : une
    // proposition en cours doit se compléter, pas s'écraser.
    const { contenu, sha } = await this.github.loadFichierEditable(
      depot,
      NOM_CONFIG,
      branche,
    );

    await this.github.commitFichier(
      depot,
      branche,
      NOM_CONFIG,
      ecrireReglages(contenu, reglages),
      "Modifie les réglages du projet",
      sha,
    );

    const ouverte = await this.github.findPullRequestDeBranche(depot, branche);
    const pullRequest =
      ouverte?.numero ??
      (await this.github.createPullRequest(
        depot,
        branche,
        base,
        "Modifie les réglages du projet",
        "Mode d’accès, protection du jeton et dépôts de code du projet.\n\nCes réglages valent " +
          "pour tous ceux qui travaillent sur le projet.",
      ));

    return {
      branche,
      pullRequest,
      url: `https://github.com/${depot.owner}/${depot.repo}/pull/${pullRequest}`,
    };
  }
}
