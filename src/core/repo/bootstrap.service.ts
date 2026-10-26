import { inject } from "../injection";
import { GithubClient, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";

/** What must be known about the project to bootstrap its repo. */
export interface NewProject {
  readonly name: string;
  readonly description: string;
}

/**
 * Configuration of a new project.
 *
 * Link kinds are written rather than omitted: a project that wants to
 * restrict or extend them finds them in front of it, whereas a silent
 * file would suggest they cannot be configured.
 *
 * Neither statuses nor operations: the status is derived from the repo (RG-statuts-cadrage)
 * and impact operations are fixed. Writing them would pass off as configurable
 * what nothing reads any more.
 */
function configuration(project: NewProject): string {
  // A missing description stays missing: replacing it with a composed sentence
  // would pass off as an intention what is only a template.
  const description = project.description.trim()
    ? `  description: >\n    ${project.description.trim().split("\n").join("\n    ")}\n`
    : "  # description : ce que fait ce produit, en une phrase.\n";

  return `# Configuration du projet — lue par l'application et par l'automatisation
schema_version: 1

projet:
  nom: ${project.name}
${description}
tags_liens:
  - carte_trello
  - issue_github
  - piste
  - maquette
  - document
`;
}

/**
 * What each directory expects, stated in the directory itself.
 *
 * Git does not version an empty directory: it needs a file. It might as well
 * be useful — whoever opens the repo on the platform reads there what goes in it,
 * rather than an empty file they wonder the purpose of.
 */
const DIRECTORIES: ReadonlyArray<{ path: string; content: string }> = [
  {
    path: "domains/README.md",
    content: `# Domaines

Les grands découpages fonctionnels du produit. Un domaine par fichier, nommé par
son identifiant — \`acces.md\`, \`facturation.md\`.

Un domaine porte des fonctionnalités, qui portent elles-mêmes les règles de
gestion.
`,
  },
  {
    path: "features/README.md",
    content: `# Fonctionnalités

Ce que le produit sait faire, rattaché à un ou plusieurs domaines. Une
fonctionnalité par fichier, à plat.

À plat, et non sous leur domaine : un fichier déplacé perd tout son historique
visible depuis l'application.
`,
  },
  {
    path: "rules/README.md",
    content: `# Règles de gestion

Le comportement du produit, énoncé règle par règle. Identifiants \`RG-<slug>\`,
stables à vie.

Ces fichiers ne s'écrivent pas à la main : ils sont la projection des cadrages
livrés, et l'automatisation les met à jour à chaque livraison.
`,
  },
  {
    path: "cadrages/README.md",
    content: `# Cadrages

Les unités de changement, datées. Un répertoire par cadrage, nommé par son
identifiant seul — \`2026-001/\` — sans slug de titre, pour qu'un titre réécrit
ne déplace pas le répertoire.

Chacun porte son \`cadrage.md\`, et ses décisions dans \`decisions/\`.
`,
  },
];

function readme(project: NewProject): string {
  const description = project.description.trim();

  return `# ${project.name}
${description ? `\n${description}\n` : ""}
Ce dépôt est le référentiel de ${project.name} : il décrit ce que le produit fait
aujourd'hui, et les cadrages qui l'ont amené là.

## Comment il est organisé

| Répertoire | Ce qu'il porte |
|---|---|
| \`domains/\` | les grands découpages fonctionnels |
| \`features/\` | ce que le produit sait faire |
| \`rules/\` | le comportement, règle par règle |
| \`cadrages/\` | les changements, datés, qui l'ont produit |

Les règles ne s'écrivent pas à la main : elles sont la projection des cadrages
livrés.
`;
}

/**
 * Bootstrapping an empty repo.
 *
 * A repo created on the platform has nothing — not even a branch, its default
 * branch being announced without existing. The application can say so; being able
 * to remedy it spares the project from composing by hand a tree whose
 * conventions it does not know yet.
 */
export class BootstrapService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);

  /**
   * Drops the structure of a framing repo, directly on the default branch.
   *
   * Without a pull request, unlike any other write: there is nothing
   * to review in an empty repo, and a branch cannot diverge anyway
   * from what does not exist.
   */
  async bootstrapProject(project: NewProject): Promise<void> {
    const repoRef: RepoRef = this.store.repoRef();
    const branch = (await this.github.loadRepo(repoRef)).defaultBranch;

    const files = [
      { path: "ssk-canon.yml", content: configuration(project) },
      { path: "README.md", content: readme(project) },
      ...DIRECTORIES,
    ];

    // One file after another: the first write creates the branch, and the
    // next ones add to it. Grouping them in a single commit would require
    // composing a Git tree, for no gain at this scale.
    for (const f of files) {
      await this.github.commitFile(
        repoRef,
        branch,
        f.path,
        f.content,
        `Amorce le référentiel : ${f.path}`,
      );
    }

    await this.store.loadSpecification();
  }
}
