import { inject } from "../injection";
import { GithubClient, GithubError } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { EditableSettings, writeSettings } from "./config-writer";

export const CONFIG_NAME = "ssk-canon.yml";

/** Branche portant une modification des réglages, distincte de tout cadrage. */
const SETTINGS_BRANCH = "reglages";

export interface ProposedSettings {
  readonly branch: string;
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
export class SettingsService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);

  /**
   * Propose une modification des réglages.
   *
   * La branche est réutilisée si elle existe déjà : deux modifications
   * successives avant relecture appartiennent à la même proposition, et ouvrir
   * une seconde demande obligerait à en fermer une.
   */
  async proposeSettings(settings: EditableSettings): Promise<ProposedSettings> {
    const repoRef = this.store.repoRef();
    const base = (await this.github.loadRepo(repoRef)).defaultBranch;

    const branch = SETTINGS_BRANCH;
    const alreadyOpen = (
      await this.github.listBranches(repoRef, branch)
    ).includes(branch);

    if (!alreadyOpen) {
      const from = await this.github.branchSha(repoRef, base);
      try {
        await this.github.createBranch(repoRef, branch, from);
      } catch (e) {
        // Une branche déjà là n'est pas un échec — elle porte une proposition en
        // cours. Tout le reste l'est, et le taire ferait échouer la lecture
        // suivante sur une branche absente, loin de la cause.
        if (e instanceof GithubError && e.status !== 422) throw e;
      }
    }

    // Lu depuis la branche des réglages, non depuis la principale : une
    // proposition en cours doit se compléter, pas s'écraser.
    const { content, sha } = await this.github.loadEditableFile(
      repoRef,
      CONFIG_NAME,
      branch,
    );

    await this.github.commitFile(
      repoRef,
      branch,
      CONFIG_NAME,
      writeSettings(content, settings),
      "Modifie les réglages du projet",
      sha,
    );

    const open = await this.github.findPullRequestForBranch(repoRef, branch);
    const pullRequest =
      open?.number ??
      (await this.github.createPullRequest(
        repoRef,
        branch,
        base,
        "Modifie les réglages du projet",
        "Mode d’accès, protection du jeton et dépôts de code du projet.\n\nCes réglages valent " +
          "pour tous ceux qui travaillent sur le projet.",
      ));

    return {
      branch,
      pullRequest,
      url: `https://github.com/${repoRef.owner}/${repoRef.repo}/pull/${pullRequest}`,
    };
  }
}
