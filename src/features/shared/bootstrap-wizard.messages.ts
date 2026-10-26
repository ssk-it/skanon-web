import { defineMessages } from "../../core/i18n/language";

/**
 * The bootstrap assistant (RG-amorcage-explique): each step explains the notion its question bears on, and only that one. What it says of access and permissions stays in line with the help page (RG-aide-fidele).
 */
export const bootstrapWizardMessages = defineMessages({
  fr: {
    title: "Créer le référentiel",
    steps: {
      repo: "Dépôt",
      project: "Projet",
      structure: "Découpage",
      change: "Évolution",
      links: "Liens",
      summary: "Récapitulatif",
    },
    previous: "Précédent",
    next: "Suivant",
    skip: "Passer",
    projectIntro:
      "Un référentiel décrit ce que fait le produit aujourd’hui, et pourquoi. Il vit dans un dépôt à part du code, que l’équipe relit comme une documentation.",
    projectName: "Nom du projet",
    projectDescription: "Ce que fait le produit, en une phrase",
    descriptionHint: "Facultatif. Laissé vide, il reste vide.",
    structureIntro:
      "Un domaine est un grand découpage fonctionnel du produit — l’accès, la facturation. Il porte des fonctionnalités, ce que le produit sait faire, qui portent à leur tour des règles de gestion : le comportement, énoncé règle par règle.",
    structureRules:
      "Les règles ne s’écrivent pas à la main : elles naissent des cadrages livrés. Le référentiel part donc vide, et se remplit à chaque livraison.",
    nameFolders: "Nommer les dossiers",
    nameFoldersIntro:
      "Les noms sont proposés dans votre langue. Choisis maintenant, ils ne changeront plus : un fichier déplacé perd son historique.",
    folders: {
      domaines: "Domaines",
      fonctionnalites: "Fonctionnalités",
      regles: "Règles",
      cadrages: "Cadrages",
      decisions: "Décisions d’architecture",
      architecture: "Architecture",
      identite: "Identité du projet",
      decisions_cadrage: "Décisions, dans un cadrage",
    },
    files: {
      cadrage: "Fichier d’un cadrage",
      pieces_jointes: "Pièces jointes d’un cadrage",
    },
    changeIntro:
      "Un cadrage est une unité de changement, datée : ce qu’on veut faire, pourquoi, les décisions prises et les règles qu’il crée ou modifie. Il se rédige sur une branche, se relit dans une demande de fusion, et sa fusion le livre.",
    changePropagation:
      "À la livraison, la propagation recopie ses énoncés dans les règles. C’est l’automatisation qui la fait, et qui vérifie chaque cadrage avant qu’il ne soit livré.",
    installAutomation: "Installer l’automatisation",
    automationDetail:
      "Écrit deux workflows sous .github/workflows/. Demande un accès autorisé à écrire les workflows : « Workflows » sur un jeton à portée fine, la portée « workflow » sur un jeton classique.",
    linksIntro:
      "Un cadrage instruit un besoin ; le travail se fait dans les dépôts de code. Les déclarer ici permet d’y ouvrir le chantier de chaque cadrage, et d’y relier ses demandes de fusion.",
    codeRepos: "Dépôts de code",
    codeReposHint:
      "Un par ligne : organisation/dépôt, suivi de son rôle si vous voulez.",
    codeRepoInvalid: (line: string) =>
      `« ${line} » n’est pas de la forme organisation/dépôt.`,
    linkKindsIntro:
      "Un cadrage porte aussi des liens — une carte, une issue, une maquette. Sans rien déclarer, le format en propose cinq : carte Trello, issue GitHub, piste, maquette, document.",
    linkKinds: "Natures de lien",
    linkKindsHint: "Facultatif, séparées par des virgules.",
    summaryIntro:
      "Voici ce qui sera écrit, directement sur la branche principale : il n’y a rien à relire dans un dépôt vide.",
    structureCommit: "En un seul commit :",
    automationCommit: "Puis l’automatisation :",
    create: "Créer le référentiel",
    creating: "Création en cours…",
    failed: "Le référentiel n’a pas pu être créé.",
    automationLater:
      "Le référentiel est créé. L’automatisation se réinstalle depuis les réglages.",
    open: "Ouvrir le référentiel",
  },
  en: {
    title: "Create the specification",
    steps: {
      repo: "Repository",
      project: "Project",
      structure: "Structure",
      change: "Change",
      links: "Links",
      summary: "Summary",
    },
    previous: "Back",
    next: "Next",
    skip: "Skip",
    projectIntro:
      "A specification describes what the product does today, and why. It lives in a repository apart from the code, which the team reads as documentation.",
    projectName: "Project name",
    projectDescription: "What the product does, in one sentence",
    descriptionHint: "Optional. Left empty, it stays empty.",
    structureIntro:
      "A domain is a main functional division of the product — access, billing. It carries features, what the product can do, which in turn carry business rules: the behaviour, stated rule by rule.",
    structureRules:
      "Rules are not written by hand: they come from delivered scopings. The specification therefore starts empty, and fills up with each delivery.",
    nameFolders: "Name the folders",
    nameFoldersIntro:
      "The names are proposed in your language. Chosen now, they will never change: a moved file loses its history.",
    folders: {
      domaines: "Domains",
      fonctionnalites: "Features",
      regles: "Rules",
      cadrages: "Scopings",
      decisions: "Architecture decisions",
      architecture: "Architecture",
      identite: "Project identity",
      decisions_cadrage: "Decisions, in a scoping",
    },
    files: {
      cadrage: "A scoping's file",
      pieces_jointes: "A scoping's attachments",
    },
    changeIntro:
      "A scoping is a dated unit of change: what is to be done, why, the decisions taken and the rules it creates or modifies. It is written on a branch, reviewed in a pull request, and merging it delivers it.",
    changePropagation:
      "On delivery, propagation copies its statements into the rules. The automation does it, and checks each scoping before it is delivered.",
    installAutomation: "Install the automation",
    automationDetail:
      "Writes two workflows under .github/workflows/. Requires access allowed to write workflows: “Workflows” on a fine-grained token, the “workflow” scope on a classic token.",
    linksIntro:
      "A scoping instructs a need; the work happens in the code repositories. Declaring them here lets each scoping open its work there, and link its pull requests.",
    codeRepos: "Code repositories",
    codeReposHint:
      "One per line: owner/repo, followed by its role if you wish.",
    codeRepoInvalid: (line) => `“${line}” is not of the form owner/repo.`,
    linkKindsIntro:
      "A scoping also carries links — a card, an issue, a mock-up. Without any declaration, the format offers five: Trello card, GitHub issue, roadmap item, mock-up, document.",
    linkKinds: "Link kinds",
    linkKindsHint: "Optional, separated by commas.",
    summaryIntro:
      "This is what will be written, directly on the main branch: there is nothing to review in an empty repository.",
    structureCommit: "In a single commit:",
    automationCommit: "Then the automation:",
    create: "Create the specification",
    creating: "Creating…",
    failed: "The specification could not be created.",
    automationLater:
      "The specification is created. The automation can be installed again from the settings.",
    open: "Open the specification",
  },
});
