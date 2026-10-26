import { defineMessages } from "../../core/i18n/language";

/**
 * Creating a specification from the home page (RG-amorcage-depot). Each refusal names its own cause (RG-message-nomme-la-cause); what is said of permissions stays in line with the help page (RG-aide-fidele).
 */
export const createSpecificationMessages = defineMessages({
  fr: {
    create: "Créer un référentiel",
    intro:
      "Un référentiel décrit ce que fait votre produit, et les cadrages qui l’y ont amené. Il vit dans un dépôt à part du code : créez-le d’abord sur GitHub, puis donnez-le ici.",
    createRepo: "Créer le dépôt sur GitHub",
    createEmpty:
      "Créez-le vide, sans README, sans licence ni .gitignore : l’application n’écrit directement que dans un dépôt où il n’y a rien à relire.",
    repoField: "Dépôt du référentiel",
    repoPlaceholder: "organisation/depot",
    invalidRepo: "Format attendu : organisation/depot",
    checking: "Vérification…",
    next: "Continuer",
    cancel: "Annuler",
    causes: {
      notFound:
        "Ce dépôt est introuvable. Créez-le d’abord, ou vérifiez que votre accès le couvre.",
      notEmpty:
        "Ce dépôt n’est pas vide : un référentiel ne s’amorce que dans un dépôt sans aucun fichier. Créez-en un nouveau, sans README ni licence.",
      cannotWrite:
        "Votre accès ne permet pas d’écrire dans ce dépôt. Il lui faut la permission Contents en lecture et écriture.",
      signInRequired:
        "Créer un référentiel demande une connexion : l’application doit écrire dans le dépôt. Connectez-vous, puis réessayez.",
    },
  },
  en: {
    create: "Create a specification",
    intro:
      "A specification describes what your product does, and the scopings that brought it there. It lives in a repository apart from the code: create it on GitHub first, then enter it here.",
    createRepo: "Create the repository on GitHub",
    createEmpty:
      "Create it empty, without a README, a licence or a .gitignore: the application only writes directly where there is nothing to review.",
    repoField: "Specification repository",
    repoPlaceholder: "owner/repo",
    invalidRepo: "Expected format: owner/repo",
    checking: "Checking…",
    next: "Continue",
    cancel: "Cancel",
    causes: {
      notFound:
        "This repository cannot be found. Create it first, or check that your access covers it.",
      notEmpty:
        "This repository is not empty: a specification is only set up in a repository without any file. Create a new one, without a README or a licence.",
      cannotWrite:
        "Your access does not allow writing to this repository. It needs the Contents permission in read and write.",
      signInRequired:
        "Creating a specification requires signing in: the application must write to the repository. Sign in, then retry.",
    },
  },
});
