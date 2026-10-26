import { inject } from "../injection";
import { signal } from "../signaux";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./referentiel.store";

/** Ce qui signe un dépôt outillé, quel que soit le nom donné aux fichiers. */
const ACTION = "ssk-it/ssk-canon-action";

/** Où vivent les workflows, et ce que chacun apporte. */
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
 * Droit d'écrire sous `.github/workflows/`, que la plateforme traite à part.
 *
 * Un accès qui écrit partout ailleurs peut être refusé ici seul : c'est une
 * permission distincte, parce qu'un workflow s'exécute avec les droits du dépôt.
 * Le refus doit donc nommer cette cause, sous peine d'être lu comme une panne.
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
 * Installation de l'automatisation dans un dépôt cadré.
 *
 * Sans elle, rien n'empêche de livrer un cadrage incohérent, et les règles ne
 * sont jamais mises à jour : le référentiel cesse d'être la projection des
 * cadrages livrés, ce dont dépend tout le reste. C'est deux fichiers à copier —
 * assez peu pour qu'on le remette à plus tard, assez conséquent pour que
 * l'oubli se paie.
 */
export class AutomationService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);

  /**
   * Dit si le dépôt porte déjà les deux workflows.
   *
   * `null` tant que la question n'a pas été posée : l'absence d'automatisation
   * et l'ignorance ne se présentent pas de la même façon à l'écran.
   */
  readonly installed = signal<boolean | null>(null);

  /**
   * Regarde si l'automatisation est en place.
   *
   * Sur l'appel à l'action, non sur le nom des fichiers : un dépôt outillé avant
   * que l'application ne sache le faire les a nommés autrement, et chercher les
   * noms que nous déposons lui proposerait d'installer ce qu'il a déjà — puis
   * de le doubler. C'est ce qu'a fait la première version, sur notre propre
   * dépôt de référence.
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
      // Ne rien affirmer si la question n'a pas pu être posée : proposer
      // d'installer ce qui est peut-être déjà là serait pire que se taire.
      this.installed.set(null);
    }
  }

  /**
   * Dépose les workflows sur la branche principale.
   *
   * Directement, comme l'amorçage : une automatisation qui attend une relecture
   * ne protège rien pendant qu'elle attend, et c'est justement la période où le
   * dépôt est le plus exposé.
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
        // La plateforme refuse par un 403 dépourvu de motif lisible. Le
        // traduire ici évite de le présenter comme une panne, alors que c'est
        // un droit manquant que le rédacteur peut lui-même s'accorder.
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
