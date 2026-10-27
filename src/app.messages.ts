import { defineMessages } from "./core/i18n/language";

/** The shell's texts: the bars, the status banners. */
export const appMessages = defineMessages({
  fr: {
    theme: {
      light: "Thème clair — cliquer pour le thème sombre",
      dark: "Thème sombre — cliquer pour suivre le système",
      system: "Thème du système — cliquer pour le thème clair",
    },
    tabs: {
      functional: "Fonctionnel",
      architecture: "Architecture",
      scopings: "Cadrages",
      evolution: "Évolution",
    },
    search: (shortcut: string) => `Rechercher (${shortcut})`,
    searchSpecification: "Rechercher dans le référentiel",
    changeRepo: "Changer de dépôt",
    openOnGithub: (repo: string) => `Ouvrir ${repo} sur GitHub`,
    reloadFromGithub: "Recharger depuis GitHub",
    signedIn: "Connecté à GitHub",
    signedInAs: (fingerprint: string) => `Connecté à GitHub ${fingerprint}`,
    signIn: "Se connecter à GitHub",
    quotaLowSignIn: "Quota bientôt épuisé — se connecter",
    help: "Fonctionnement de Skanon",
    settings: "Réglages du projet",
    quota: {
      exhausted: "Plus aucune requête GitHub disponible pour cette heure.",
      remaining: (n: number) =>
        `Il reste ${n} requêtes GitHub pour cette heure.`,
      signIn: "Se connecter",
      toLift: "pour lever la limite.",
    },
    version: {
      lost: "Cette version de Skanon n’est plus entièrement disponible : certaines pages pourraient ne plus s’ouvrir.",
      reload: "Recharger",
      relaunch: "Relancer",
      toPublished: "pour passer à la version publiée.",
      ready: "Une nouvelle version de Skanon est prête.",
      toUse: "pour l’utiliser.",
      retry: "Réessayez, ou relancez Skanon vous-même.",
      saveFirst:
        "Enregistrez d’abord : une saisie non enregistrée serait perdue.",
    },
    vault: {
      eraseRefused: (onDesktop: boolean) =>
        `${onDesktop ? "Le coffre du système a refusé d’effacer votre jeton" : "Le navigateur a refusé d’effacer votre jeton"} : il ne vaut plus pour cette session, mais sera retrouvé au lancement suivant.`,
      writeRefused: (onDesktop: boolean) =>
        `${onDesktop ? "Le coffre du système n’a pas gardé votre jeton" : "Le navigateur n’a pas gardé votre jeton"} : il vaut pour cette session, et ne sera pas retrouvé au lancement suivant.`,
    },
    passkey: {
      locked: "Vos jetons sont protégés par une passkey.",
      unreadable: "La passkey ne les ouvre plus :",
      forget: "Oublier ces jetons",
      typeAgain: "puis saisissez de nouveau votre jeton.",
      unlockCancelled:
        "Le déverrouillage n’a pas abouti. Si la passkey a été supprimée de votre trousseau, ces jetons ne s’ouvriront plus :",
      required:
        "Ce projet exige que votre jeton soit protégé par une passkey : il n’est gardé que pour cet onglet.",
      protect: "Protéger par une passkey",
      impossible:
        "Ce navigateur ne sait pas créer une passkey qui protège le jeton : l’application de bureau, ou un navigateur récent, le garderont d’une ouverture à l’autre.",
      notCreated: "La passkey n’a pas été créée.",
      inClear:
        "La passkey n’a pas été créée : votre jeton est gardé en clair dans ce navigateur.",
      retry: "Réessayer",
      leaveInClear: "Le laisser en clair",
    },
    unconfirmed: (readAt: string, cause: string) =>
      `État lu le ${readAt}, non confirmé : ${cause} Les enregistrements sont indisponibles jusqu’à ce qu’il ait été relu.`,
    retry: "Réessayer",
    legalNotice: "Mentions légales",
    language: {
      label: "Langue",
      browser: (current: string) => `Langue du navigateur (${current})`,
    },
  },
  en: {
    theme: {
      light: "Light theme — click for the dark theme",
      dark: "Dark theme — click to follow the system",
      system: "System theme — click for the light theme",
    },
    tabs: {
      functional: "Functional",
      architecture: "Architecture",
      scopings: "Scopings",
      evolution: "Evolution",
    },
    search: (shortcut: string) => `Search (${shortcut})`,
    searchSpecification: "Search the specification",
    changeRepo: "Change repo",
    openOnGithub: (repo: string) => `Open ${repo} on GitHub`,
    reloadFromGithub: "Reload from GitHub",
    signedIn: "Signed in to GitHub",
    signedInAs: (fingerprint: string) => `Signed in to GitHub ${fingerprint}`,
    signIn: "Sign in to GitHub",
    quotaLowSignIn: "Quota almost used up — sign in",
    help: "How Skanon works",
    settings: "Project settings",
    quota: {
      exhausted: "No GitHub requests left for this hour.",
      remaining: (n: number) =>
        `${n} GitHub request${n === 1 ? "" : "s"} left for this hour.`,
      signIn: "Sign in",
      toLift: "to lift the limit.",
    },
    version: {
      lost: "This version of Skanon is no longer fully available: some pages might no longer open.",
      reload: "Reload",
      relaunch: "Relaunch",
      toPublished: "to move to the published version.",
      ready: "A new version of Skanon is ready.",
      toUse: "to use it.",
      retry: "Try again, or relaunch Skanon yourself.",
      saveFirst: "Save first: unsaved input would be lost.",
    },
    vault: {
      eraseRefused: (onDesktop: boolean) =>
        `${onDesktop ? "The system vault refused to erase your token" : "The browser refused to erase your token"}: it no longer holds for this session, but will be found again at the next launch.`,
      writeRefused: (onDesktop: boolean) =>
        `${onDesktop ? "The system vault did not keep your token" : "The browser did not keep your token"}: it holds for this session, and will not be found again at the next launch.`,
    },
    passkey: {
      locked: "Your tokens are protected by a passkey.",
      unreadable: "The passkey no longer opens them:",
      forget: "Forget these tokens",
      typeAgain: "then enter your token again.",
      unlockCancelled:
        "Unlocking did not succeed. If the passkey was removed from your keychain, these tokens will no longer open:",
      required:
        "This project requires your token to be protected by a passkey: it is only kept for this tab.",
      protect: "Protect with a passkey",
      impossible:
        "This browser cannot create a passkey that protects the token: the desktop application, or a recent browser, will keep it from one opening to the next.",
      notCreated: "The passkey was not created.",
      inClear:
        "The passkey was not created: your token is kept in clear in this browser.",
      retry: "Try again",
      leaveInClear: "Leave it in clear",
    },
    unconfirmed: (readAt: string, cause: string) =>
      `State read on ${readAt}, not confirmed: ${cause} Saving is unavailable until it has been read again.`,
    retry: "Try again",
    legalNotice: "Legal notice",
    language: {
      label: "Language",
      browser: (current: string) => `Browser language (${current})`,
    },
  },
});

/** Each language named in itself, as language pickers do: whoever cannot read the current one still finds theirs. */
export const LANGUAGE_NAMES = { fr: "Français", en: "English" } as const;
