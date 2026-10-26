import { defineMessages } from "../../core/i18n/language";
import type { RichPart } from "./RichText.vue";

export const tokenDialogMessages = defineMessages({
  fr: {
    signIn: "Connexion",
    signInGithub: "Connexion à GitHub",
    whyToken:
      "Sans connexion, GitHub limite l’application à 60 requêtes par heure et par adresse. Un jeton personnel porte cette limite à 5 000, donne accès aux dépôts privés, et débloque l’historique des règles — dates, auteurs et pull requests, que GitHub refuse aux requêtes anonymes.",
    mode: (label: string): readonly RichPart[] => [
      "Ce projet emploie le mode ",
      { strong: label },
      ".",
    ],
    scopePath: [
      "L’autorisation descend jusqu’au ",
      { strong: "chemin" },
      " : un rédacteur n’écrit que là où le projet l’y autorise.",
    ] as readonly RichPart[],
    scopeRepo: [
      "L’autorisation s’arrête au ",
      { strong: "dépôt" },
      " : un rédacteur autorisé peut écrire partout dans ce projet.",
    ] as readonly RichPart[],
    authorVerified: [
      "L’auteur d’un enregistrement est ",
      { strong: "vérifié" },
      " depuis l’identité connectée.",
    ] as readonly RichPart[],
    authorDeclared: [
      "L’auteur d’un enregistrement est ",
      { strong: "déclaré" },
      " par l’application, non vérifié à la source.",
    ] as readonly RichPart[],
    privateInTab:
      "Les contenus d’un dépôt privé restent dans cet onglet le temps de la session, comme l’accès qui les a lus.",
    privateSealed: [
      "Les contenus d’un dépôt privé sont ",
      { strong: "scellés comme le jeton" },
      ", et effacés quand il est oublié.",
    ] as readonly RichPart[],
    privateClear: (onDesktop: boolean): readonly RichPart[] => [
      "Les contenus d’un dépôt privé sont ",
      { strong: "conservés en clair" },
      onDesktop
        ? " par l’application et effacés quand le jeton est oublié."
        : " par ce navigateur, comme le jeton, et effacés quand le jeton est oublié.",
    ],
    readOnlyAdvice: (whereKept: string): readonly RichPart[] => [
      "Un jeton en ",
      { strong: "lecture seule" },
      ` suffit pour consulter. Rédiger un cadrage demande l’écriture — voir le tableau des permissions. Le jeton est conservé ${whereKept}, et n’est envoyé qu’à GitHub.`,
    ],
    keptInKeychain: "dans le coffre du système",
    keptSealed: "dans ce navigateur, sous une passkey",
    keptForTab: "pour cet onglet seulement",
    keptInBrowser: "dans ce navigateur",
    signedInAs: "Connecté en tant que ",
    accessibleProjects: "Projets accessibles :",
    noProject: "aucun",
    signOut: "Se déconnecter",
    ownProvider:
      "Ce projet fait vérifier les identités auprès de son propre fournisseur. Aucun compte GitHub n’est nécessaire.",
    signingIn: "Connexion…",
    doSignIn: "Se connecter",
    locked:
      "Vos jetons sont protégés par une passkey. Déverrouillez-les pour vous en servir, en ajouter ou en retirer un.",
    passkeyUnreadable:
      "La passkey ne les ouvre plus : oubliez-les, puis saisissez de nouveau votre jeton.",
    unlock: "Déverrouiller",
    forgetTokens: "Oublier ces jetons",
    tokenLabel: "Jeton d’accès personnel",
    tokenHint: (whereKept: string) =>
      `Envoyé à GitHub seul, et conservé ${whereKept}.`,
    scopeLabel: "Ce jeton vaut pour",
    scopeOrganization: (organization: string) =>
      `l’organisation ${organization}`,
    scopeRepoOnly: (repo: string) => `ce dépôt seul — ${repo}`,
    scopeOthers: "tous les autres dépôts",
    scopeHint:
      "Un jeton par organisation : celui d’une autre ne s’en trouve pas écrasé.",
    protect: "Protéger ce jeton par une passkey",
    protectHelp:
      "Touch ID, ou le code de l’appareil, l’ouvrira dans chaque onglet. Seul son chiffré reste dans ce navigateur : un programme qui lit le profil ne le trouve pas. Un script sur la page, onglet déverrouillé, le lirait toujours.",
    protectionRequired:
      "Ce projet exige que le jeton soit protégé par une passkey : Touch ID, ou le code de l’appareil, vous sera demandé à l’enregistrement, puis dans chaque onglet.",
    protectionSealed:
      "Vos jetons sont protégés par une passkey : celui-ci le sera aussi.",
    protectionImpossibleRequired:
      "Ce projet exige une passkey, que ce navigateur ne sait pas créer : le jeton ne sera gardé que pour cet onglet. L’application de bureau, ou un navigateur récent, le garderont d’une ouverture à l’autre.",
    protectionImpossible:
      "Ce navigateur ne sait pas protéger le jeton par une passkey : il le gardera en clair.",
    coversOpen: (n: number) => `${n} dépôt(s), dont celui qui est ouvert.`,
    missesOpen: (n: number) => `${n} dépôt(s) — mais pas celui qui est ouvert.`,
    notAccepted: "Ce jeton n’a pas été accepté.",
    others: (n: number) => `… et ${n} autres`,
    verifying: "Vérification…",
    verify: "Vérifier ce que le jeton ouvre",
    howToCreate: "Comment créer un jeton ?",
    savedTokens: (n: number) => `Jetons enregistrés (${n})`,
    removeToken: "Retirer ce jeton",
    viaApi: "Charger les contenus par l’API",
    viaApiHelp:
      "Un appel compté par fichier, là où le canal par défaut n’en compte aucun. Les fichiers sont lus au commit dans les deux cas : ce qui vient d’être poussé apparaît au prochain chargement. Un dépôt privé passe par l’API de lui-même.",
    cancel: "Annuler",
    protecting: "Protection…",
    save: "Enregistrer",
  },
  en: {
    signIn: "Sign in",
    signInGithub: "Sign in to GitHub",
    whyToken:
      "Without signing in, GitHub limits the application to 60 requests per hour and per address. A personal token raises that limit to 5,000, gives access to private repos, and unlocks the history of rules — dates, authors and pull requests, which GitHub refuses to anonymous requests.",
    mode: (label) => ["This project uses the ", { strong: label }, " mode."],
    scopePath: [
      "Authorisation goes down to the ",
      { strong: "path" },
      ": an author writes only where the project allows them to.",
    ],
    scopeRepo: [
      "Authorisation stops at the ",
      { strong: "repo" },
      ": an authorised author can write anywhere in this project.",
    ],
    authorVerified: [
      "The author of a change is ",
      { strong: "verified" },
      " from the signed-in identity.",
    ],
    authorDeclared: [
      "The author of a change is ",
      { strong: "declared" },
      " by the application, not verified at the source.",
    ],
    privateInTab:
      "A private repo's contents stay in this tab for the session, like the access that read them.",
    privateSealed: [
      "A private repo's contents are ",
      { strong: "sealed like the token" },
      ", and erased when it is forgotten.",
    ],
    privateClear: (onDesktop) => [
      "A private repo's contents are ",
      { strong: "kept unencrypted" },
      onDesktop
        ? " by the application and erased when the token is forgotten."
        : " by this browser, like the token, and erased when the token is forgotten.",
    ],
    readOnlyAdvice: (whereKept) => [
      "A ",
      { strong: "read-only" },
      ` token is enough to read. Writing a scoping requires write access — see the permissions table. The token is kept ${whereKept}, and is sent to GitHub only.`,
    ],
    keptInKeychain: "in the system keychain",
    keptSealed: "in this browser, under a passkey",
    keptForTab: "for this tab only",
    keptInBrowser: "in this browser",
    signedInAs: "Signed in as ",
    accessibleProjects: "Accessible projects:",
    noProject: "none",
    signOut: "Sign out",
    ownProvider:
      "This project has identities verified by its own provider. No GitHub account is needed.",
    signingIn: "Signing in…",
    doSignIn: "Sign in",
    locked:
      "Your tokens are protected by a passkey. Unlock them to use them, add one or remove one.",
    passkeyUnreadable:
      "The passkey no longer opens them: forget them, then enter your token again.",
    unlock: "Unlock",
    forgetTokens: "Forget these tokens",
    tokenLabel: "Personal access token",
    tokenHint: (whereKept) => `Sent to GitHub only, and kept ${whereKept}.`,
    scopeLabel: "This token applies to",
    scopeOrganization: (organization) => `the ${organization} organisation`,
    scopeRepoOnly: (repo) => `this repo only — ${repo}`,
    scopeOthers: "all other repos",
    scopeHint: "One token per organisation: another one's is not overwritten.",
    protect: "Protect this token with a passkey",
    protectHelp:
      "Touch ID, or the device code, will open it in each tab. Only its ciphertext stays in this browser: a program reading the profile does not find it. A script on the page, with the tab unlocked, could still read it.",
    protectionRequired:
      "This project requires the token to be protected by a passkey: Touch ID, or the device code, will be asked for when saving, then in each tab.",
    protectionSealed:
      "Your tokens are protected by a passkey: this one will be too.",
    protectionImpossibleRequired:
      "This project requires a passkey, which this browser cannot create: the token will be kept for this tab only. The desktop application, or a recent browser, will keep it from one opening to the next.",
    protectionImpossible:
      "This browser cannot protect the token with a passkey: it will keep it unencrypted.",
    coversOpen: (n) =>
      `${n} repo${n === 1 ? "" : "s"}, including the one that is open.`,
    missesOpen: (n) =>
      `${n} repo${n === 1 ? "" : "s"} — but not the one that is open.`,
    notAccepted: "This token was not accepted.",
    others: (n) => `… and ${n} more`,
    verifying: "Checking…",
    verify: "Check what the token opens",
    howToCreate: "How to create a token?",
    savedTokens: (n) => `Saved tokens (${n})`,
    removeToken: "Remove this token",
    viaApi: "Load contents through the API",
    viaApiHelp:
      "One counted call per file, where the default channel counts none. Files are read at the commit in both cases: what has just been pushed appears at the next load. A private repo goes through the API by itself.",
    cancel: "Cancel",
    protecting: "Protecting…",
    save: "Save",
  },
});
