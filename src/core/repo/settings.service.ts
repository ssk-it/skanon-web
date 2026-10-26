import { inject } from "../injection";
import { GithubClient, GithubError } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { EditableSettings, writeSettings } from "./config-writer";

export const CONFIG_NAME = "ssk-canon.yml";

/** Branch carrying a change to the settings, distinct from any scoping. */
const SETTINGS_BRANCH = "reglages";

export interface ProposedSettings {
  readonly branch: string;
  readonly pullRequest: number;
  readonly url: string;
}

/**
 * Reading and changing the project's settings.
 *
 * The settings live in the repo, so changing them follows the same path as
 * any other change: a branch, a pull request. Writing directly to the main
 * branch would bypass review — for a file that decides the tool's behaviour
 * for everyone.
 */
export class SettingsService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);

  /**
   * Proposes a change to the settings.
   *
   * The branch is reused if it already exists: two successive changes before
   * review belong to the same proposal, and opening a second pull request
   * would force one to close one.
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
        // A branch already there is not a failure — it carries a proposal in
        // progress. Anything else is, and keeping quiet about it would make the next
        // read fail on an absent branch, far from the cause.
        if (e instanceof GithubError && e.status !== 422) throw e;
      }
    }

    // Read from the settings branch, not from the main one: a proposal in
    // progress must be completed, not overwritten.
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
