import { inject } from "../injection";
import { defineMessages } from "../i18n/language";
import { LocaleService } from "../i18n/locale.service";

/**
 * What the access to GitHub reports to the user: errors, sign-in refusals, the token's shape. Commit messages and pull requests are written into the repo, and never come from here (RG-textes-traduits).
 */
export const githubMessages = defineMessages({
  fr: {
    graphqlNotFound:
      "Dépôt introuvable, ou hors de portée du jeton. Vérifier son nom, et " +
      "que le jeton donne accès à ce dépôt — GitHub ne distingue pas les deux cas.",
    graphqlRateLimited:
      "Le budget de requêtes d’historique est épuisé pour cette heure. " +
      "Il se réinitialise automatiquement.",
    graphqlForbidden:
      "Le jeton n’autorise pas cette lecture. Vérifier qu’il couvre ce dépôt.",
    graphqlNoData: "GitHub a répondu sans donnée.",
    unexpected: "Erreur inattendue lors de l’appel à GitHub.",
    quotaWithToken:
      "Le quota d’appels GitHub est épuisé pour cette heure. " +
      "Il se réinitialise automatiquement.",
    quotaWithoutToken:
      "Le quota d’appels GitHub est épuisé. Sans connexion, il est de 60 " +
      "requêtes par heure et par adresse.",
    tokenRefused:
      "GitHub a refusé le jeton. Il est peut-être expiré, révoqué, ou saisi " +
      "incomplètement. Se reconnecter avec un jeton valide.",
    signInRequired:
      "Cette opération demande une connexion. Se connecter, puis réessayer.",
    writePermissionMissing:
      "Le jeton n’autorise pas cette opération. Écrire dans le dépôt demande " +
      "un jeton avec la permission Contents en lecture et écriture, ainsi " +
      "que Pull requests pour ouvrir une demande de fusion.",
    writeSignInRequired:
      "Écrire dans le dépôt demande une connexion. Se connecter, puis réessayer.",
    notFoundWithToken:
      "Dépôt ou fichier introuvable. Vérifier le nom du dépôt, et que le " +
      "jeton donne accès à ce dépôt.",
    notFoundWithoutToken:
      "Dépôt ou fichier introuvable. Vérifier le nom du dépôt, et qu’il " +
      "est public — un dépôt privé demande de se connecter.",
    writeConflict:
      "Le fichier a été modifié entre-temps, par une autre personne ou un " +
      "autre onglet. Recharger la page pour repartir de sa dernière " +
      "version, puis reprendre la modification.",
    emptyRepo:
      "Ce dépôt est vide. Y déposer un premier fichier — un README suffit — " +
      "pour que l’application puisse le lire.",
    unreachable: "GitHub est injoignable. Vérifier la connexion réseau.",
    status: (status: number) => `GitHub a répondu ${status}.`,
    historyRequiresSignIn:
      "Cette vue interroge l’historique, ce que GitHub ne permet qu’aux " +
      "requêtes authentifiées. Se connecter avec un jeton pour y accéder.",
    pullRequestNotFound: (number: number) =>
      `Demande de fusion ${number} introuvable.`,
    triedTokenRefused:
      "Ce jeton est refusé par GitHub — expiré, ou mal recopié.",
    triedTokenStatus: (status: number) =>
      `GitHub a répondu ${status} à ce jeton.`,

    identityNotDeclared:
      "Ce projet ne déclare pas où vérifier les identités. Voir ses réglages.",
    signInStateMismatch: "La réponse ne correspond pas à la demande.",
    signInFailed: "La connexion n’a pas abouti.",
    issuerRefused: "L’émetteur d’identité a refusé la connexion.",
    issuerNoIdentity: "L’émetteur n’a rendu aucune identité.",
    accessRefused: "L’accès au dépôt a été refusé.",

    tokenEmpty: "Saisir un jeton.",
    tokenWithSpace: "Un jeton ne contient pas d’espace.",
    tokenPrefix: "Un jeton GitHub commence par ghp_ ou github_pat_.",
    tokenTooShort: "Ce jeton semble incomplet.",
  },
  en: {
    graphqlNotFound:
      "Repo not found, or out of the token’s reach. Check its name, and " +
      "that the token gives access to this repo — GitHub does not tell the two cases apart.",
    graphqlRateLimited:
      "The budget of history requests is used up for this hour. " +
      "It resets automatically.",
    graphqlForbidden:
      "The token does not allow this read. Check that it covers this repo.",
    graphqlNoData: "GitHub answered without data.",
    unexpected: "Unexpected error while calling GitHub.",
    quotaWithToken:
      "The GitHub call quota is used up for this hour. " +
      "It resets automatically.",
    quotaWithoutToken:
      "The GitHub call quota is used up. Without signing in, it is 60 " +
      "requests per hour and per address.",
    tokenRefused:
      "GitHub refused the token. It may be expired, revoked, or entered " +
      "incompletely. Sign in again with a valid token.",
    signInRequired: "This operation requires signing in. Sign in, then retry.",
    writePermissionMissing:
      "The token does not allow this operation. Writing to the repo requires " +
      "a token with the Contents permission in read and write, as well " +
      "as Pull requests to open a pull request.",
    writeSignInRequired:
      "Writing to the repo requires signing in. Sign in, then retry.",
    notFoundWithToken:
      "Repo or file not found. Check the repo’s name, and that the " +
      "token gives access to this repo.",
    notFoundWithoutToken:
      "Repo or file not found. Check the repo’s name, and that it " +
      "is public — a private repo requires signing in.",
    writeConflict:
      "The file was modified in the meantime, by someone else or another " +
      "tab. Reload the page to start again from its latest " +
      "version, then redo the change.",
    emptyRepo:
      "This repo is empty. Add a first file to it — a README is enough — " +
      "so that the application can read it.",
    unreachable: "GitHub is unreachable. Check the network connection.",
    status: (status: number) => `GitHub answered ${status}.`,
    historyRequiresSignIn:
      "This view queries the history, which GitHub only allows to " +
      "authenticated requests. Sign in with a token to access it.",
    pullRequestNotFound: (number: number) =>
      `Pull request ${number} not found.`,
    triedTokenRefused: "GitHub refuses this token — expired, or miscopied.",
    triedTokenStatus: (status: number) =>
      `GitHub answered ${status} to this token.`,

    identityNotDeclared:
      "This project does not declare where to verify identities. See its settings.",
    signInStateMismatch: "The response does not match the request.",
    signInFailed: "Signing in did not succeed.",
    issuerRefused: "The identity issuer refused the sign-in.",
    issuerNoIdentity: "The issuer returned no identity.",
    accessRefused: "Access to the repo was refused.",

    tokenEmpty: "Enter a token.",
    tokenWithSpace: "A token contains no space.",
    tokenPrefix: "A GitHub token starts with ghp_ or github_pat_.",
    tokenTooShort: "This token looks incomplete.",
  },
});

/** The messages in the language displayed now: an error carries the language it was raised in. */
export function githubText(): (typeof githubMessages)["fr"] {
  return inject(LocaleService).messages(githubMessages)();
}
