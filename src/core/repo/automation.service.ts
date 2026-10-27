import { inject } from "../injection";
import { signal } from "../signals";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";

/** The files the installation writes, which the bootstrap lists before writing. */
export const WORKFLOW_PATHS: readonly string[] = [
  ".github/workflows/verification-depot-cadre.yml",
  ".github/workflows/propagation-depot-cadre.yml",
];

/** What marks an equipped repo, whatever name the files are given. */
const ACTION = "ssk-it/ssk-canon-action";

/**
 * Where the workflows live, and what each one brings: the templates of
 * ssk-it/ssk-canon-action (`modeles/`), copied as they are. Kept in step with
 * them by hand — a template the action has moved past runs the propagation
 * without committing, or on GitHub's paid runners for a private repo.
 */
const WORKFLOWS: ReadonlyArray<{ path: string; content: string }> = [
  {
    path: WORKFLOW_PATHS[0],
    content: `# Vérifie qu'un cadrage en cours de relecture est cohérent avant de pouvoir
# être livré. À configurer comme contrôle requis dans les règles de protection
# de la branche principale, faute de quoi il signale sans bloquer.
#
# Ce qu'il attrape, que le format seul ne garantit pas : un impact vers une
# règle inexistante, un énoncé manquant pour une création ou une modification,
# un rattachement vers une entité inconnue, une règle abrogée par un cadrage non
# livré. Dès que la demande est proposée à la relecture, il contrôle en outre
# l'état qu'aura le référentiel une fois fusionné — ce que la livraison exigera
# est ainsi réclamé tant qu'il est encore temps de l'écrire.
name: Vérification du référentiel

on:
  # \`ready_for_review\` ne fait pas partie des types par défaut : sans lui, un
  # brouillon proposé à la relecture ne serait recontrôlé qu'à sa poussée
  # suivante, et le contrôle de livraison manquerait le moment qui le déclenche.
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  # La propagation la lance sur la demande de fusion qu'elle ouvre : le jeton
  # de l'automatisation ne déclenche aucun autre événement. Elle se lance aussi
  # à la main, sur une branche, et la juge alors telle qu'elle serait fusionnée.
  workflow_dispatch:

# Rien sur la branche principale : la propagation s'y déclenche déjà et vérifie
# ce qu'elle vient d'écrire. Deux contrôles sur la même poussée se liraient à
# contretemps — celui qui n'écrit pas rapporterait l'état d'avant l'autre, et
# échouerait à chaque livraison d'un cadrage créant une règle.

permissions:
  contents: read

jobs:
  verifier:
    # Les Mac auto-hébergés pour un dépôt privé, que la variable d'organisation
    # SSK_RUNNER_PRIVE désigne (outillage/runner-prive-organisation.sh) : sur les
    # runners de GitHub, chaque exécution d'un dépôt privé — une par heure pour la
    # propagation planifiée — se décompte du forfait. Un dépôt public, que le
    # groupe de runners refuse, et une organisation sans la variable restent sur
    # ubuntu-latest, gratuit pour eux.
    runs-on: \${{ vars.SSK_RUNNER_PRIVE && fromJSON(vars.SSK_RUNNER_PRIVE) || 'ubuntu-latest' }}
    steps:
      - uses: actions/checkout@v4
        with:
          # Sans l'historique, \`origin/main\` est hors d'atteinte et le contrôle
          # d'immuabilité ne peut pas avoir lieu — il le dit, plutôt que de
          # laisser croire qu'il a eu lieu. Le statut se déduit de la même
          # comparaison, si bien qu'aucun cadrage ne serait tenu pour livré.
          fetch-depth: 0

      # \`appliquer: false\` — la vérification ne modifie jamais le référentiel.
      # Elle échoue si le cadrage est incohérent, ou si le référentiel a dérivé
      # de ses cadrages.
      - uses: ssk-it/ssk-canon-action@main
        with:
          referentiel: '.'
          appliquer: 'false'
`,
  },
  {
    path: WORKFLOW_PATHS[1],
    content: `# Il applique au référentiel les impacts des cadrages livrés, à chaque arrivée
# sur la branche principale — donc à chaque merge de cadrage.
#
# Deux propriétés du propagateur rendent ce déclenchement systématique sûr :
# il est idempotent, donc une exécution sans changement n'écrit rien ; et il est
# tout-ou-rien, donc une incohérence l'arrête avant la première écriture.
#
# C'est aussi lui qui répond de la branche principale : il vérifie le référentiel
# qu'il vient d'écrire, seul moment où l'état final peut l'être — l'enregistrement
# qu'il pousse, fait par le jeton de l'automatisation, ne déclenche aucun workflow.
name: Propagation des impacts

on:
  push:
    branches: [main]
  # permet de rejouer une propagation manquée sans attendre un merge
  workflow_dispatch:
  # GitHub ne transmet pas toujours la poussée d'un merge : aucune exécution
  # n'est alors créée, et le cadrage livré reste sans propagation jusqu'au
  # suivant. À heure fixe, une propagation perdue se rattrape seule ; sans rien
  # à propager, l'exécution n'écrit rien.
  schedule:
    - cron: '17 * * * *'

# L'action commite sur la branche principale : sans cette permission, le
# GITHUB_TOKEN est en lecture seule et le push échoue.
permissions:
  contents: write
  # Une branche protégée refuse le push direct de la propagation : elle ouvre
  # alors une demande de fusion.
  pull-requests: write
  # Cette demande, ouverte par le jeton de l'automatisation, ne déclenche aucun
  # workflow : la propagation y lance elle-même la vérification requise.
  actions: write

# Deux merges rapprochés ne doivent pas propager en parallèle : le second
# écraserait le premier. On sérialise, sans annuler ce qui est en cours.
concurrency:
  group: propagation
  cancel-in-progress: false

jobs:
  propager:
    # Les Mac auto-hébergés pour un dépôt privé, que la variable d'organisation
    # SSK_RUNNER_PRIVE désigne (outillage/runner-prive-organisation.sh) : sur les
    # runners de GitHub, chaque exécution d'un dépôt privé — une par heure pour la
    # propagation planifiée — se décompte du forfait. Un dépôt public, que le
    # groupe de runners refuse, et une organisation sans la variable restent sur
    # ubuntu-latest, gratuit pour eux.
    runs-on: \${{ vars.SSK_RUNNER_PRIVE && fromJSON(vars.SSK_RUNNER_PRIVE) || 'ubuntu-latest' }}
    steps:
      - uses: actions/checkout@v4
        with:
          # l'action a besoin de l'historique pour committer par-dessus
          fetch-depth: 0

      - uses: ssk-it/ssk-canon-action@main
        with:
          referentiel: '.'
          appliquer: 'true'
          commiter: 'true'
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
