import { inject } from "../injection";
import { GithubClient, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";

/** Ce qu'il faut savoir du projet pour amorcer son dépôt. */
export interface NewProject {
  readonly name: string;
  readonly description: string;
}

/**
 * Configuration d'un projet neuf.
 *
 * Les natures de lien sont écrites plutôt qu'omises : un projet qui voudra les
 * restreindre ou les étendre les trouve sous les yeux, alors qu'un fichier
 * silencieux laisserait croire qu'elles ne se règlent pas.
 *
 * Ni statuts ni opérations : le statut se déduit du dépôt (RG-statuts-cadrage)
 * et les opérations d'impact sont fixes. Les écrire ferait passer pour réglable
 * ce que plus rien ne lit.
 */
function configuration(project: NewProject): string {
  // Une description absente le reste : la remplacer par une phrase composée
  // ferait passer pour une intention ce qui n'est qu'un gabarit.
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
 * Ce que chaque répertoire attend, dit dans le répertoire lui-même.
 *
 * Git ne versionne pas un répertoire vide : il lui faut un fichier. Autant qu'il
 * serve — celui qui ouvre le dépôt sur la plateforme y lit ce qu'on y dépose,
 * plutôt qu'un fichier vide dont il se demande à quoi il sert.
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
 * Amorçage d'un dépôt vide.
 *
 * Un dépôt créé sur la plateforme n'a rien — pas même une branche, sa branche
 * par défaut étant annoncée sans exister. L'application sait le dire ; savoir y
 * remédier évite au projet de composer à la main une arborescence dont il ne
 * connaît pas encore les conventions.
 */
export class BootstrapService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);

  /**
   * Dépose la structure d'un dépôt cadré, directement sur la branche par défaut.
   *
   * Sans demande de fusion, contrairement à toute autre écriture : il n'y a rien
   * à relire dans un dépôt vide, et une branche ne peut de toute façon pas
   * diverger de ce qui n'existe pas.
   */
  async bootstrapProject(project: NewProject): Promise<void> {
    const repoRef: RepoRef = this.store.repoRef();
    const branch = (await this.github.loadRepo(repoRef)).defaultBranch;

    const files = [
      { path: "ssk-canon.yml", content: configuration(project) },
      { path: "README.md", content: readme(project) },
      ...DIRECTORIES,
    ];

    // Un fichier après l'autre : la première écriture crée la branche, et les
    // suivantes s'y ajoutent. Les grouper en un seul enregistrement demanderait
    // de composer un arbre Git, pour un gain nul à cette échelle.
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
