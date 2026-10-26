import { inject } from "../injection";
import { signal } from "../signals";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";

/** What marks an equipped repo, whatever name the files are given. */
const ACTION = "ssk-it/ssk-canon-action";

/** Where the workflows live, and what each one brings. */
const WORKFLOWS: ReadonlyArray<{ path: string; content: string }> = [
  {
    path: ".github/workflows/verification-depot-cadre.yml",
    content: `# Vérifie qu'un cadrage est cohérent avant de pouvoir être livré.
#
# À configurer comme contrôle requis dans les règles de protection de la branche
# principale, faute de quoi il signale sans bloquer.
#
# Ce qu'il attrape, que le format seul ne garantit pas : un impact vers une
# règle inexistante, un énoncé manquant pour une création ou une modification,
# un rattachement vers une entité inconnue.
name: Vérification du référentiel

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verifier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # \`appliquer: false\` — la vérification ne modifie jamais le référentiel.
      #
      # \`@main\` et non un tag : l'action ne publie plus d'alias de version, et
      # nommer une release précise figerait le dépôt sur elle, corrections
      # comprises.
      - uses: ssk-it/ssk-canon-action@main
        with:
          appliquer: false
`,
  },
  {
    path: ".github/workflows/propagation-depot-cadre.yml",
    content: `# Applique au référentiel les impacts des cadrages livrés, à chaque
# arrivée sur la branche principale — donc à chaque merge de cadrage.
#
# Deux propriétés du propagateur rendent ce déclenchement systématique sûr :
# il est idempotent, donc une exécution sans changement n'écrit rien ; et il est
# tout-ou-rien, donc une incohérence l'arrête avant la première écriture.
name: Propagation des impacts

on:
  push:
    branches: [main]
  # permet de rejouer une propagation manquée sans attendre un merge
  workflow_dispatch:

# L'action commite sur la branche principale : sans cette permission, le
# GITHUB_TOKEN est en lecture seule et le push échoue.
permissions:
  contents: write

# Deux merges rapprochés ne doivent pas propager en parallèle : le second
# écraserait le premier. On sérialise, sans annuler ce qui est en cours.
concurrency:
  group: propagation
  cancel-in-progress: false

jobs:
  propager:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Voir la vérification : l'action se consomme sur sa branche.
      - uses: ssk-it/ssk-canon-action@main
        with:
          appliquer: true
`,
  },
];

/**
 * Permission to write under `.github/workflows/`, which the platform treats apart.
 *
 * An access that writes everywhere else can be refused here alone: it is a
 * distinct permission, because a workflow runs with the repo's rights.
 * The refusal must therefore name that cause, or it will be read as an outage.
 */
export class AutomationRefused extends Error {
  constructor() {
    super(
      "Cet accès ne permet pas d’écrire les workflows. Écrire sous " +
        "`.github/workflows/` demande une permission distincte : " +
        "« Workflows » sur un jeton à portée fine, la portée `workflow` sur un " +
        "jeton classique.",
    );
  }
}

/**
 * Installing automation in a framing repo.
 *
 * Without it, nothing prevents delivering an inconsistent scoping, and rules are
 * never updated: the specification stops being the projection of the
 * delivered scopings, which everything else depends on. It is two files to copy —
 * few enough to be put off, consequential enough for
 * forgetting it to cost.
 */
export class AutomationService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);

  /**
   * Says whether the repo already carries both workflows.
   *
   * `null` until the question has been asked: missing automation
   * and not knowing are not presented the same way on screen.
   */
  readonly installed = signal<boolean | null>(null);

  /**
   * Checks whether automation is in place.
   *
   * By the call to the action, not by file names: a repo equipped before
   * the application could do it named them otherwise, and looking for the
   * names we drop would offer to install what it already has — then
   * to duplicate it. That is what the first version did, on our own
   * reference repo.
   */
  async check(): Promise<void> {
    try {
      const tree = await this.github.loadTree(this.store.repoRef());
      const workflows = tree.entries.filter(
        (e) =>
          e.type === "blob" &&
          e.path.startsWith(".github/workflows/") &&
          /\.ya?ml$/.test(e.path),
      );

      const contents = await Promise.all(
        workflows.map((w) => this.github.loadBlob(this.store.repoRef(), w.sha)),
      );
      this.installed.set(contents.some((c) => c.includes(ACTION)));
    } catch {
      // Assert nothing if the question could not be asked: offering
      // to install what may already be there would be worse than keeping quiet.
      this.installed.set(null);
    }
  }

  /**
   * Drops the workflows on the default branch.
   *
   * Directly, like bootstrapping: an automation waiting for a review
   * protects nothing while it waits, and that is precisely the period when the
   * repo is most exposed.
   */
  async install(): Promise<void> {
    const repoRef: RepoRef = this.store.repoRef();
    const branch = (await this.github.loadRepo(repoRef)).defaultBranch;

    for (const w of WORKFLOWS) {
      try {
        await this.github.commitFile(
          repoRef,
          branch,
          w.path,
          w.content,
          `Installe l'automatisation : ${w.path.split("/").pop()}`,
        );
      } catch (e) {
        // The platform refuses with a 403 lacking a readable reason. Translating
        // it here avoids presenting it as an outage, whereas it is
        // a missing permission the author can grant themselves.
        if (e instanceof GithubError && e.status === 403) {
          throw new AutomationRefused();
        }
        throw e;
      }
    }

    this.installed.set(true);
    await this.store.loadSpecification();
  }
}
