import { defineMessages } from "../../core/i18n/language";
import type { AccessGuarantees } from "../../core/model/model";

/**
 * What the settings page says. What it writes into the repo — the `ssk-canon.yml` lines, the skill's sample configuration — is not here: it stays in French in every language (RG-textes-traduits).
 */
export const settingsMessages = defineMessages({
  fr: {
    title: "Réglages du projet",
    subtitle:
      "Ce que l’application s’autorise à faire sur ce projet. Ces réglages vivent dans le dépôt et valent pour tous ceux qui y travaillent.",
    accessMode: "Mode d’accès",
    accessModeHelp:
      "Comment les rédacteurs obtiennent l’accès au dépôt. Les modes s’empilent : chacun lève un obstacle que le précédent laissait. Changer de mode ne demande de reprendre ni le référentiel ni les cadrages.",
    notYetAvailable: "pas encore réalisé",
    guarantees: (g: AccessGuarantees) =>
      `Autorisation jusqu’au ${g.scope === "chemin" ? "chemin" : "dépôt"} · auteur ${g.authorVerified ? "vérifié" : "déclaré"} · ${g.accountRequired ? "compte GitHub requis" : "aucun compte GitHub requis"}`,
    tokenProtection: "Protection du jeton dans la version web",
    tokenProtectionHelp:
      "Sur le bureau, le jeton est toujours gardé dans le coffre du système. Dans la version web, ce projet peut exiger qu’il soit protégé par une passkey : Touch ID, ou le code de l’appareil, l’ouvre alors une fois, tant qu’un onglet de Skanon reste ouvert.",
    offered: "Proposée",
    offeredHelp:
      "Chaque rédacteur choisit, à la saisie de son jeton ou une fois pour toutes dans son navigateur. Sans passkey, son jeton reste en clair dans son navigateur.",
    required: "Exigée",
    requiredHelp:
      "Un jeton qui ouvre ce projet n’est jamais gardé en clair, même pour un rédacteur qui s’est passé de la passkey dans son navigateur : sans passkey, il ne vaut que pour l’onglet.",
    forms: [
      {
        term: "En clair, dans le navigateur",
        description:
          "Un programme qui lit le profil du navigateur, une sauvegarde du disque ou quelqu’un devant la session ouverte lisent le jeton.",
      },
      {
        term: "Sous passkey, dans le navigateur",
        description:
          "Ils ne trouvent qu’un chiffré, que seuls Touch ID ou le code de l’appareil ouvrent. Un script ou une extension sur la page lit toujours le jeton tant qu’un onglet déverrouillé reste ouvert.",
      },
      {
        term: "Dans le coffre du système, sur le bureau",
        description:
          "Le jeton est hors du profil du navigateur, et le coffre ne le remet qu’à Skanon.",
      },
      {
        term: "Pour la session seulement",
        description:
          "Avec une identité tierce, ou sans passkey sur un projet qui l’exige : rien ne reste sur le poste, et il faut se reconnecter, ou ressaisir le jeton, à chaque ouverture.",
      },
    ] as readonly { readonly term: string; readonly description: string }[],
    tokenInClear:
      "Dans tous les cas, le jeton passe en clair dans l’application à chaque requête vers GitHub. Ce qui le protège vraiment, c’est sa portée — les dépôts et les droits qu’il ouvre —, sa durée de vie, et sa révocation le jour où il n’a plus lieu d’être.",
    skanonRequirement:
      "L’exigence est celle de Skanon, non de GitHub : un rédacteur peut se servir du même jeton dans un autre outil. Ce que GitHub sait imposer, c’est l’approbation des jetons par l’organisation, leur portée et leur durée de vie maximale.",
    identityHelp:
      "Où les identités sont vérifiées. Rien de secret ici : ce sont les valeurs que porte toute application s’exécutant dans un navigateur.",
    issuer: "Émetteur d’identité",
    issuerPlaceholder: "https://identite.exemple.fr/realms/mon-projet",
    issuerHint: "Racine du domaine, jusqu’au projet inclus.",
    client: "Identifiant du client",
    clientPlaceholder: "mon-application",
    clientHint: "Client public déclaré chez cet émetteur, sans secret.",
    exchange: "Adresse de l’échange",
    exchangePlaceholder: "https://echange.exemple.fr",
    exchangeHint: "Composant qui échange une identité contre un accès.",
    incompleteIdentity:
      "Ce mode demande les trois valeurs. Sans elles, personne ne pourra se connecter.",
    automation: "Automatisation",
    automationHelp:
      "Ce dépôt n’a pas ses workflows. Rien ne vérifie donc qu’un cadrage est cohérent avant sa livraison, et les règles ne sont pas mises à jour quand il est livré — le référentiel cesse d’être la projection des cadrages livrés.",
    automationFailed: "L’automatisation n’a pas pu être installée.",
    installing: "Installation…",
    installAutomation: "Installer l’automatisation",
    codeRepos: "Dépôts de code",
    whatThisWrites: "Ce que ce réglage écrit",
    codeReposHelp:
      "Les dépôts que ce projet réalise. Le lien est déclaré ici, du côté qui a autorité : c’est ce qui permet de rédiger un cadrage depuis un dépôt de code sans rien y configurer.",
    writesTo: { before: "Ce réglage écrit dans", after: " :" },
    noCodeRepo:
      "Aucun dépôt déclaré. Un dépôt de code qui invoque le skill de cadrage ne se rattache alors à rien.",
    repo: "Dépôt",
    repoPlaceholder: "organisation/depot",
    repoExpected: "Attendu : organisation/depot",
    role: "Ce qu’il porte",
    rolePlaceholder: "Application web",
    removeRepo: "Retirer ce dépôt",
    addRepo: "Ajouter un dépôt",
    fromCodeRepo: "Rédiger depuis un dépôt de code",
    fromCodeRepoHelp:
      "Un skill permet de rédiger un cadrage sans quitter le dépôt de code sur lequel on travaille. Il trouve seul le référentiel du projet, à condition que celui-ci déclare ses dépôts de code — voir plus bas.",
    installStep: "1. L’installer, une fois par machine :",
    configStep: {
      before: "2. Dire où les référentiels sont clonés, dans",
      after: " :",
    },
    copied: "Copié",
    copy: "Copier",
    nothingInCodeRepos:
      "Rien n’est à configurer dans les dépôts de code : le skill reconnaît celui d’où on l’invoque, et cherche le projet qui le déclare — d’où le réglage ci-dessus.",
    settingsFailed: "Les réglages n’ont pas pu être proposés.",
    proposed: {
      before: "Réglages proposés dans la",
      link: (n: number) => `demande #${n}`,
      after: ". Ils prendront effet à sa fusion.",
    },
    sending: "Envoi…",
    propose: "Proposer ces réglages",
    note: "Les réglages sont modifiés par une demande de fusion, comme tout ce qui vit dans le dépôt. Rien ne change tant qu’elle n’est pas fusionnée.",
  },
  en: {
    title: "Project settings",
    subtitle:
      "What the application allows itself to do on this project. These settings live in the repo and hold for everyone working on it.",
    accessMode: "Access mode",
    accessModeHelp:
      "How authors get access to the repo. The modes stack up: each removes an obstacle the previous one left. Changing mode requires reworking neither the specification nor the scopings.",
    notYetAvailable: "not yet available",
    guarantees: (g: AccessGuarantees) =>
      `Authorisation down to the ${g.scope === "chemin" ? "path" : "repo"} · author ${g.authorVerified ? "verified" : "declared"} · ${g.accountRequired ? "GitHub account required" : "no GitHub account required"}`,
    tokenProtection: "Token protection in the web version",
    tokenProtectionHelp:
      "On the desktop, the token is always kept in the system vault. In the web version, this project can require it to be protected by a passkey: Touch ID, or the device passcode, then unlocks it once, while a Skanon tab stays open.",
    offered: "Offered",
    offeredHelp:
      "Each author chooses, when entering their token or once and for all in their browser. Without a passkey, their token stays in clear in their browser.",
    required: "Required",
    requiredHelp:
      "A token that opens this project is never kept in clear, even for an author who opted out of the passkey in their browser: without a passkey, it holds only for the tab.",
    forms: [
      {
        term: "In clear, in the browser",
        description:
          "A program reading the browser profile, a disk backup or someone in front of the open session can read the token.",
      },
      {
        term: "Under a passkey, in the browser",
        description:
          "They find only ciphertext, which only Touch ID or the device passcode opens. A script or an extension on the page still reads the token while an unlocked tab stays open.",
      },
      {
        term: "In the system vault, on the desktop",
        description:
          "The token is outside the browser profile, and the vault hands it only to Skanon.",
      },
      {
        term: "For the session only",
        description:
          "With a third-party identity, or without a passkey on a project that requires one: nothing stays on the machine, and one must sign in again, or re-enter the token, each time.",
      },
    ],
    tokenInClear:
      "In every case, the token passes in clear through the application with each request to GitHub. What really protects it is its scope — the repos and permissions it opens —, its lifetime, and its revocation the day it is no longer needed.",
    skanonRequirement:
      "The requirement is Skanon’s, not GitHub’s: an author can use the same token in another tool. What GitHub can enforce is the approval of tokens by the organisation, their scope and their maximum lifetime.",
    identityHelp:
      "Where identities are verified. Nothing secret here: these are the values any application running in a browser carries.",
    issuer: "Identity issuer",
    issuerPlaceholder: "https://identity.example.com/realms/my-project",
    issuerHint: "Root of the domain, up to and including the project.",
    client: "Client identifier",
    clientPlaceholder: "my-application",
    clientHint: "Public client declared with this issuer, without a secret.",
    exchange: "Exchange address",
    exchangePlaceholder: "https://exchange.example.com",
    exchangeHint: "Component that trades an identity for access.",
    incompleteIdentity:
      "This mode needs all three values. Without them, no one will be able to sign in.",
    automation: "Automation",
    automationHelp:
      "This repo does not have its workflows. Nothing checks that a scoping is consistent before it is delivered, and rules are not updated when it is — the specification stops being the projection of delivered scopings.",
    automationFailed: "The automation could not be installed.",
    installing: "Installing…",
    installAutomation: "Install the automation",
    codeRepos: "Code repos",
    whatThisWrites: "What this setting writes",
    codeReposHelp:
      "The repos this project builds. The link is declared here, on the side that has authority: this is what lets a scoping be written from a code repo without configuring anything there.",
    writesTo: { before: "This setting writes to", after: ":" },
    noCodeRepo:
      "No repo declared. A code repo invoking the scoping skill then attaches to nothing.",
    repo: "Repo",
    repoPlaceholder: "owner/repo",
    repoExpected: "Expected: owner/repo",
    role: "What it holds",
    rolePlaceholder: "Web application",
    removeRepo: "Remove this repo",
    addRepo: "Add a repo",
    fromCodeRepo: "Write from a code repo",
    fromCodeRepoHelp:
      "A skill lets you write a scoping without leaving the code repo you are working on. It finds the project’s specification on its own, provided the latter declares its code repos — see below.",
    installStep: "1. Install it, once per machine:",
    configStep: {
      before: "2. Say where specifications are cloned, in",
      after: ":",
    },
    copied: "Copied",
    copy: "Copy",
    nothingInCodeRepos:
      "Nothing needs configuring in the code repos: the skill recognises the one it is invoked from, and looks for the project that declares it — hence the setting above.",
    settingsFailed: "The settings could not be proposed.",
    proposed: {
      before: "Settings proposed in",
      link: (n: number) => `pull request #${n}`,
      after: ". They will take effect once it is merged.",
    },
    sending: "Sending…",
    propose: "Propose these settings",
    note: "Settings are changed through a pull request, like everything that lives in the repo. Nothing changes until it is merged.",
  },
});
