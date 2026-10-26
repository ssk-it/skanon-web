import { inject } from "../injection";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import type { Language, Localized } from "../i18n/language";
import type { CodeRepo } from "../model/model";
import type { RepoNames } from "./repo-names";
import { SpecificationStore } from "./specification.store";

/**
 * What must be known about the project to bootstrap its repo.
 *
 * Only the name is required (RG-amorcage-depot): everything else is offered
 * and may be skipped, and what nobody entered is not written (RG-rien-inventer).
 */
export interface NewProject {
  readonly name: string;
  readonly description: string;
  /** The language of the folder names proposed, and of the texts written to the repo (RG-textes-traduits). */
  readonly language: Language;
  /** The names retained; those proposed in `language` when absent. */
  readonly names?: RepoNames;
  readonly codeRepos?: readonly CodeRepo[];
  readonly linkTags?: readonly string[];
}

/** What a repo offered for a new specification turned out to be. */
export type TargetCheck =
  "ready" | "notFound" | "notEmpty" | "cannotWrite" | "signInRequired";

/**
 * The folder and file names proposed at creation, in the interface's language
 * (scoping 2026-062). The format's own defaults mix English and French; a
 * project chooses its names once, and this is the only moment it is free to
 * (RG-noms-declares, INV-1).
 */
const PROPOSED_NAMES: Localized<RepoNames> = {
  fr: {
    dossiers: {
      domaines: "domaines",
      fonctionnalites: "fonctionnalites",
      regles: "regles",
      cadrages: "cadrages",
      decisions: "decisions",
      architecture: "architecture",
      identite: "identite",
      decisions_cadrage: "decisions",
    },
    fichiers: { cadrage: "cadrage.md", pieces_jointes: "pieces-jointes.md" },
  },
  en: {
    dossiers: {
      domaines: "domains",
      fonctionnalites: "features",
      regles: "rules",
      cadrages: "scopings",
      decisions: "decisions",
      architecture: "architecture",
      identite: "identity",
      decisions_cadrage: "decisions",
    },
    fichiers: { cadrage: "scoping.md", pieces_jointes: "attachments.md" },
  },
};

export function proposedNames(language: Language): RepoNames {
  return PROPOSED_NAMES[language];
}

/**
 * The texts the bootstrap writes to the repo, in the language of its folder
 * names: a repo whose folders are English, greeted by French notes, would read
 * in two languages from its first commit. Once written they belong to the repo,
 * and are never translated again (RG-textes-traduits).
 */
interface DepositedTexts {
  readonly configHeader: string;
  readonly missingDescription: string;
  readonly namesComment: string;
  readonly codeReposComment: string;
  readonly linkTagsComment: string;
  readonly domainsNote: (n: RepoNames) => string;
  readonly featuresNote: (n: RepoNames) => string;
  readonly rulesNote: (n: RepoNames) => string;
  readonly scopingsNote: (n: RepoNames) => string;
  readonly readme: (name: string, description: string, n: RepoNames) => string;
}

const DEPOSITED: Localized<DepositedTexts> = {
  fr: {
    configHeader:
      "# Configuration du projet — lue par l'application et par l'automatisation",
    missingDescription:
      "# description : ce que fait ce produit, en une phrase.",
    namesComment:
      "# Les noms des dossiers et des fichiers convenus. Choisis à la création,\n# ils ne changent plus : un fichier déplacé perd son historique.",
    codeReposComment: "# Les dépôts de code qui réalisent ce produit.",
    linkTagsComment: "# Les natures de lien qu'un cadrage peut porter.",
    domainsNote: (n) => `# Domaines

Les grands découpages fonctionnels du produit, dans \`${n.dossiers.domaines}/\`.
Un domaine par fichier, nommé par son identifiant — \`acces.md\`,
\`facturation.md\`.

Un domaine porte des fonctionnalités, qui portent elles-mêmes les règles de
gestion.
`,
    featuresNote: (n) => `# Fonctionnalités

Ce que le produit sait faire, rattaché à un ou plusieurs domaines. Une
fonctionnalité par fichier, à plat dans \`${n.dossiers.fonctionnalites}/\`.

À plat, et non sous leur domaine : un fichier déplacé perd tout son historique
visible depuis l'application.
`,
    rulesNote: (n) => `# Règles de gestion

Le comportement du produit, énoncé règle par règle, dans \`${n.dossiers.regles}/\`.
Identifiants \`RG-<slug>\`, stables à vie.

Ces fichiers ne s'écrivent pas à la main : ils sont la projection des cadrages
livrés, et l'automatisation les met à jour à chaque livraison.
`,
    scopingsNote: (n) => `# Cadrages

Les unités de changement, datées. Un répertoire par cadrage dans
\`${n.dossiers.cadrages}/\`, nommé par son identifiant seul — \`2026-001/\` — sans
slug de titre, pour qu'un titre réécrit ne déplace pas le répertoire.

Chacun porte son \`${n.fichiers.cadrage}\`, et ses décisions dans
\`${n.dossiers.decisions_cadrage}/\`.
`,
    readme: (name, description, n) => `# ${name}
${description ? `\n${description}\n` : ""}
Ce dépôt est le référentiel de ${name} : il décrit ce que le produit fait
aujourd'hui, et les cadrages qui l'ont amené là.

## Comment il est organisé

| Répertoire | Ce qu'il porte |
|---|---|
| \`${n.dossiers.domaines}/\` | les grands découpages fonctionnels |
| \`${n.dossiers.fonctionnalites}/\` | ce que le produit sait faire |
| \`${n.dossiers.regles}/\` | le comportement, règle par règle |
| \`${n.dossiers.cadrages}/\` | les changements, datés, qui l'ont produit |

Les règles ne s'écrivent pas à la main : elles sont la projection des cadrages
livrés.
`,
  },
  en: {
    configHeader:
      "# Project configuration — read by the application and by the automation",
    missingDescription:
      "# description: what this product does, in one sentence.",
    namesComment:
      "# The names of the folders and conventional files. Chosen at creation,\n# they never change: a moved file loses its history.",
    codeReposComment: "# The code repositories that implement this product.",
    linkTagsComment: "# The kinds of link a scoping may carry.",
    domainsNote: (n) => `# Domains

The product's main functional divisions, in \`${n.dossiers.domaines}/\`. One
domain per file, named by its identifier — \`access.md\`, \`billing.md\`.

A domain carries features, which themselves carry the business rules.
`,
    featuresNote: (n) => `# Features

What the product can do, attached to one or more domains. One feature per
file, flat in \`${n.dossiers.fonctionnalites}/\`.

Flat, not under their domain: a moved file loses all its history as seen from
the application.
`,
    rulesNote: (n) => `# Business rules

The product's behaviour, stated rule by rule, in \`${n.dossiers.regles}/\`.
Identifiers \`RG-<slug>\`, stable for life.

These files are not written by hand: they are the projection of the delivered
scopings, and the automation updates them at each delivery.
`,
    scopingsNote: (n) => `# Scopings

The units of change, dated. One folder per scoping in
\`${n.dossiers.cadrages}/\`, named by its identifier alone — \`2026-001/\` —
without a title slug, so that a rewritten title does not move the folder.

Each carries its \`${n.fichiers.cadrage}\`, and its decisions in
\`${n.dossiers.decisions_cadrage}/\`.
`,
    readme: (name, description, n) => `# ${name}
${description ? `\n${description}\n` : ""}
This repository is the specification of ${name}: it describes what the
product does today, and the scopings that brought it there.

## How it is organised

| Folder | What it holds |
|---|---|
| \`${n.dossiers.domaines}/\` | the main functional divisions |
| \`${n.dossiers.fonctionnalites}/\` | what the product can do |
| \`${n.dossiers.regles}/\` | the behaviour, rule by rule |
| \`${n.dossiers.cadrages}/\` | the dated changes that produced it |

Rules are not written by hand: they are the projection of the delivered
scopings.
`,
  },
};

/** A YAML scalar, quoted when it could be read as something else. */
function scalar(value: string): string {
  return /^[\p{L}\p{N}_./ -]+$/u.test(value) && !/^[\d.]+$/.test(value)
    ? value
    : JSON.stringify(value);
}

/**
 * Configuration of a new project.
 *
 * Neither statuses nor operations: the status is derived from the repo (RG-statuts-cadrage)
 * and impact operations are fixed. Nor link kinds nobody declared: the format
 * offers its own, and writing them would pass off as the project's choice what
 * nobody chose (RG-rien-inventer, scoping 2026-062).
 */
function configuration(project: NewProject, names: RepoNames): string {
  const t = DEPOSITED[project.language];
  const description = project.description.trim();
  const lines = [
    t.configHeader,
    "schema_version: 1",
    "",
    "projet:",
    `  nom: ${scalar(project.name.trim())}`,
    description
      ? `  description: >\n    ${description.split("\n").join("\n    ")}`
      : `  ${t.missingDescription}`,
    "",
    t.namesComment,
    "dossiers:",
    ...Object.entries(names.dossiers).map(([k, v]) => `  ${k}: ${scalar(v)}`),
    "fichiers:",
    ...Object.entries(names.fichiers).map(([k, v]) => `  ${k}: ${scalar(v)}`),
  ];
  if (project.codeRepos?.length) {
    lines.push(
      "",
      t.codeReposComment,
      "depots_code:",
      ...project.codeRepos.map(
        (d) =>
          `  - { repo: ${d.repo}${d.role.trim() ? `, role: ${scalar(d.role.trim())}` : ""} }`,
      ),
    );
  }
  if (project.linkTags?.length) {
    lines.push(
      "",
      t.linkTagsComment,
      "tags_liens:",
      ...project.linkTags.map((tag) => `  - ${scalar(tag)}`),
    );
  }
  return `${lines.join("\n")}\n`;
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
   * What a repo offered for a new specification is: only an existing, empty
   * repo the access may write to is bootstrapped (RG-amorcage-depot). Each
   * other case has its own cause (RG-message-nomme-la-cause); any other
   * failure — quota, network — is let through as the platform reported it.
   */
  async checkTarget(repoRef: RepoRef): Promise<TargetCheck> {
    let canWrite: boolean | null;
    try {
      ({ canWrite } = await this.github.loadRepo(repoRef));
    } catch (e) {
      if (e instanceof GithubError && e.status === 404) return "notFound";
      throw e;
    }
    // The platform states the right only to an authenticated call: without
    // it, nothing tells whether the write would pass.
    if (canWrite === null) return "signInRequired";
    if (!canWrite) return "cannotWrite";
    return (await this.github.isEmptyRepo(repoRef)) ? "ready" : "notEmpty";
  }

  /** The files the bootstrap writes, the configuration first. */
  plannedFiles(project: NewProject): { path: string; content: string }[] {
    const names = project.names ?? proposedNames(project.language);
    const t = DEPOSITED[project.language];
    const d = names.dossiers;
    return [
      { path: "ssk-canon.yml", content: configuration(project, names) },
      {
        path: "README.md",
        content: t.readme(
          project.name.trim(),
          project.description.trim(),
          names,
        ),
      },
      // Git does not version an empty directory: it needs a file. It might as
      // well say what goes in it, to whoever opens the repo on the platform.
      { path: `${d.domaines}/README.md`, content: t.domainsNote(names) },
      {
        path: `${d.fonctionnalites}/README.md`,
        content: t.featuresNote(names),
      },
      { path: `${d.regles}/README.md`, content: t.rulesNote(names) },
      { path: `${d.cadrages}/README.md`, content: t.scopingsNote(names) },
    ];
  }

  /**
   * Drops the structure of a specification, directly on the default branch,
   * in a single commit.
   *
   * Without a pull request, unlike any other write: there is nothing
   * to review in an empty repo, and a branch cannot diverge anyway
   * from what does not exist. In one commit: a bootstrap interrupted halfway
   * would leave a repo that is no longer empty, which can then no longer be
   * bootstrapped (scoping 2026-062).
   *
   * The specification is not reloaded here: the caller first installs the
   * automation, whose refusal must stay on screen, and reloads afterwards.
   */
  async bootstrapProject(project: NewProject): Promise<void> {
    const repoRef: RepoRef = this.store.repoRef();
    const branch = (await this.github.loadRepo(repoRef)).defaultBranch;

    await this.github.commitInitialTree(
      repoRef,
      branch,
      this.plannedFiles(project),
      project.language === "fr"
        ? "Amorce le référentiel"
        : "Set up the specification",
    );
  }
}
