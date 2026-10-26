import { defineMessages } from "../../core/i18n/language";

/**
 * The « Fonctionnement » page, a statement in each language (RG-aide-fidele): a sentence changed in one is changed in the other. Sentences around a host in `<code>` are split into `before` / `after`, the host itself staying in the template, untranslated.
 */
export const helpMessages = defineMessages({
  fr: {
    title: "Fonctionnement de Skanon",
    subtitle:
      "Skanon lit et écrit le référentiel d’un projet directement dans son dépôt GitHub. Il n’a pas de serveur qui garde vos données : ce qu’il sait, il le tient de GitHub, et le garde sur ce poste.",
    tokens: {
      title: "Jetons",
      publicRead:
        "Un dépôt public se lit sans connexion. Se connecter lève la limite d’appels de GitHub (60 par heure sans jeton, 5 000 avec), ouvre les dépôts privés, et permet d’écrire.",
      desktopVault:
        "Le jeton est rangé dans le coffre du système — le Trousseau sur macOS, le gestionnaire d’identifiants sur Windows. Si le coffre refuse de le garder, il ne vaut que pour la session, et un bandeau le dit.",
      sealed:
        "Vos jetons sont protégés par une passkey : ce navigateur n’en garde que le chiffré, que Touch ID ou le code de l’appareil ouvrent dans chaque onglet. Un programme qui lit le profil du navigateur ne les trouve pas. Une extension ou un script qui s’exécute sur cette page, onglet déverrouillé, pourrait toujours les lire.",
      passkeyLost:
        "Si la passkey disparaît de votre trousseau, les jetons ne s’ouvrent plus : on les oublie, et on saisit de nouveau son jeton.",
      inClear:
        "Le jeton est gardé dans ce navigateur, en clair : une extension ou un script qui s’exécute sur cette page pourrait le lire, comme un programme qui lit le profil du navigateur.",
      canSeal:
        "Il peut être protégé par une passkey, à sa saisie : ce navigateur n’en garde alors que le chiffré, que Touch ID ou le code de l’appareil ouvrent dans chaque onglet. Un script sur la page, onglet déverrouillé, le lirait toujours.",
      projectRequires:
        "Un projet peut exiger cette protection : sans passkey, le jeton ne vaut alors que pour l’onglet.",
      preferLimited:
        "Dans tous les cas, préférez un jeton limité aux dépôts utiles, en lecture seule si vous ne faites que lire, et qui expire.",
      sentOnlyTo: {
        before: "Il n’est envoyé qu’à ",
        after: ". Seuls ses quatre derniers caractères s’affichent.",
      },
      scope:
        "Un jeton peut valoir pour une organisation ou pour un seul dépôt : le plus précis l’emporte, puis le jeton général.",
      verifiedIdentity:
        "Quand un projet le prévoit, on peut aussi entrer par son identité vérifiée. L’accès obtenu ne vit qu’en mémoire, pour une heure environ, et prend fin au rechargement.",
      signOut:
        "Se déconnecter efface les jetons, l’accès temporaire, et les contenus privés gardés en cache.",
    },
    cache: {
      title: "Mise en cache",
      byHash:
        "Les fichiers lus sont gardés sur ce poste, sous leur empreinte : un fichier inchangé n’est jamais redemandé, quelle que soit la branche. Ce cache est une copie, jamais une source.",
      tree: "Chaque ouverture relit l’arborescence du dépôt — un seul appel compté — pour savoir ce qui a changé. Les fichiers sont lus au commit, donc tels qu’ils sont à cet instant.",
      publicFiles: {
        before: "Les fichiers publics passent par ",
        after:
          ", qui ne compte pas dans la limite d’appels. Ceux d’un dépôt privé passent par l’API, un appel par fichier manquant.",
      },
      offline:
        "Quand GitHub ne répond pas — hors ligne, limite atteinte, panne —, le dernier état lu s’affiche, avec sa date et la cause. Rien ne s’enregistre tant qu’il n’a pas été relu.",
      eviction:
        "Ce qu’aucune branche ne cite plus est retiré. Les contenus privés durent autant que l’accès qui les a lus ; ceux qu’une identité vérifiée a lus ne sont pas gardés du tout.",
      sealedContents:
        "Les contenus privés sont gardés sous la même clé que les jetons, et ne se lisent qu’une fois l’onglet déverrouillé.",
      recent:
        "Les douze derniers projets ouverts sont retenus, pour l’accueil.",
    },
    discovery: {
      title: "Découverte des projets",
      knownFirst:
        "L’accueil montre d’abord les projets déjà ouverts sur ce poste, sans attendre le réseau.",
      probed: {
        before:
          "Chaque jeton connu demande ensuite à GitHub les dépôts qu’il autorise (jusqu’à 500 par jeton). Chacun est éprouvé par la lecture de son ",
        after: " : un dépôt qui en a un porte un référentiel.",
      },
      order:
        "Les projets qui portent un référentiel viennent en premier, par organisation. Les autres restent sous « Autres dépôts autorisés ».",
      withoutToken:
        "Sans jeton, rien n’est découvert : on ouvre un projet par son adresse, et il est retenu ensuite.",
    },
    communications: {
      title: "Communications extérieures",
      api: " — lecture, écriture et découverte, avec votre jeton.",
      raw: " — les fichiers publics, sans jeton.",
      avatars: " — l’avatar des organisations, sans jeton.",
      identity:
        "L’émetteur d’identité et le service d’échange qu’un projet déclare — seulement pour ce projet, et seulement si l’on entre par son identité vérifiée.",
      nothingElse:
        "Aucune mesure d’audience, aucun rapport d’erreur. Les polices sont embarquées. Un lien externe s’ouvre dans votre navigateur.",
    },
  },
  en: {
    title: "How Skanon works",
    subtitle:
      "Skanon reads and writes a project’s specification directly in its GitHub repository. It has no server that keeps your data: what it knows, it gets from GitHub, and keeps on this device.",
    tokens: {
      title: "Tokens",
      publicRead:
        "A public repository can be read without signing in. Signing in lifts GitHub’s call limit (60 per hour without a token, 5,000 with one), opens private repositories, and allows writing.",
      desktopVault:
        "The token is stored in the system vault — the Keychain on macOS, the Credential Manager on Windows. If the vault refuses to keep it, it holds only for the session, and a banner says so.",
      sealed:
        "Your tokens are protected by a passkey: this browser keeps only their ciphertext, which Touch ID or the device code opens in each tab. A program that reads the browser profile does not find them. An extension or a script running on this page, with the tab unlocked, could still read them.",
      passkeyLost:
        "If the passkey disappears from your keychain, the tokens no longer open: you forget them, and enter your token again.",
      inClear:
        "The token is kept in this browser, in clear: an extension or a script running on this page could read it, as could a program that reads the browser profile.",
      canSeal:
        "It can be protected by a passkey when you enter it: this browser then keeps only its ciphertext, which Touch ID or the device code opens in each tab. A script on the page, with the tab unlocked, would still read it.",
      projectRequires:
        "A project may require this protection: without a passkey, the token then holds only for the tab.",
      preferLimited:
        "In any case, prefer a token limited to the repositories you need, read-only if you only read, and that expires.",
      sentOnlyTo: {
        before: "It is sent only to ",
        after: ". Only its last four characters are displayed.",
      },
      scope:
        "A token can apply to an organisation or to a single repository: the most specific one wins, then the general token.",
      verifiedIdentity:
        "When a project provides for it, you can also sign in with your verified identity. The access obtained lives only in memory, for about an hour, and ends on reload.",
      signOut:
        "Signing out erases the tokens, the temporary access, and the private contents kept in cache.",
    },
    cache: {
      title: "Caching",
      byHash:
        "Files read are kept on this device, under their hash: an unchanged file is never requested again, whatever the branch. This cache is a copy, never a source.",
      tree: "Each opening reads the repository tree again — a single counted call — to know what changed. Files are read at the commit, so as they are at that moment.",
      publicFiles: {
        before: "Public files go through ",
        after:
          ", which does not count against the call limit. Those of a private repository go through the API, one call per missing file.",
      },
      offline:
        "When GitHub does not respond — offline, limit reached, outage —, the last state read is displayed, with its date and the cause. Nothing is saved until it has been read again.",
      eviction:
        "What no branch refers to any more is removed. Private contents last as long as the access that read them; those read through a verified identity are not kept at all.",
      sealedContents:
        "Private contents are kept under the same key as the tokens, and can be read only once the tab is unlocked.",
      recent:
        "The last twelve projects opened are remembered, for the home page.",
    },
    discovery: {
      title: "Project discovery",
      knownFirst:
        "The home page first shows the projects already opened on this device, without waiting for the network.",
      probed: {
        before:
          "Each known token then asks GitHub for the repositories it grants (up to 500 per token). Each one is tested by reading its ",
        after: ": a repository that has one holds a specification.",
      },
      order:
        "Projects that hold a specification come first, by organisation. The others remain under “Other authorised repos”.",
      withoutToken:
        "Without a token, nothing is discovered: you open a project by its address, and it is remembered afterwards.",
    },
    communications: {
      title: "External communications",
      api: " — reading, writing and discovery, with your token.",
      raw: " — public files, without a token.",
      avatars: " — organisations’ avatars, without a token.",
      identity:
        "The identity issuer and the exchange service a project declares — only for that project, and only if you sign in with your verified identity.",
      nothingElse:
        "No audience measurement, no error reporting. Fonts are embedded. An external link opens in your browser.",
    },
  },
});
