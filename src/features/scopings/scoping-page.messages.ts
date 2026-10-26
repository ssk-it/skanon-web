import { defineMessages } from "../../core/i18n/language";
import type { ImpactOperation } from "../../core/model/model";

/**
 * The scoping page. The section headings are the interface's: the format reads its own (`## Objectif`…) elsewhere, untranslated (RG-textes-traduits).
 */
// Feminine, to agree with « règle » and « cible » alike.
const FR_PARTICIPLES: Record<ImpactOperation, readonly [string, string]> = {
  cree: ["créée", "créées"],
  modifie: ["modifiée", "modifiées"],
  abroge: ["abrogée", "abrogées"],
  touche: ["touchée", "touchées"],
};

const EN_PARTICIPLES: Record<ImpactOperation, string> = {
  cree: "created",
  modifie: "modified",
  abroge: "repealed",
  touche: "touched",
};

export const scopingPageMessages = defineMessages({
  fr: {
    participle: (operation: ImpactOperation, n: number) =>
      FR_PARTICIPLES[operation][n > 1 ? 1 : 0],
    rules: (n: number): string => (n > 1 ? "règles" : "règle"),
    targets: (n: number): string => (n > 1 ? "cibles" : "cible"),
    linkAddFailed: "Le lien n’a pas pu être ajouté.",
    linkEditFailed: "Le lien n’a pas pu être modifié.",
    linkDeleteFailed: "Le lien n’a pas pu être supprimé.",
    deleteLinkTitle: "Supprimer ce lien ?",
    deleteLinkMessage: (label: string) =>
      `« ${label} » ne sera plus rattaché à ce cadrage. La ressource, elle, n’est pas touchée.`,
    delete: "Supprimer",
    edit: "Modifier",
    goal: "Objectif",
    journey: "Parcours utilisateur",
    decisions: "Décisions",
    impacts: "Impacts",
    misc: "Divers",
    attachments: "Pièces jointes",
    cancelled: "annulée",
    missingRule: "Cette règle n’existe pas dans le référentiel courant.",
    size: (bytes: number) =>
      bytes < 1024
        ? `${bytes} o`
        : bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} ko`
          : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`,
    back: "Cadrages",
    scoping: "Cadrage",
    resume: "Reprendre",
    domains: "Domaines",
    resources: "Ressources",
    pullRequest: (n: number) => `Demande de fusion #${n}`,
    branch: (name: string) => `Branche ${name}`,
    linkActions: (label: string) => `Actions sur le lien ${label}`,
    adding: "Ajout…",
    addLink: "Ajouter un lien",
    staleOneBefore: "La branche",
    staleOneAfter:
      "porte encore ce cadrage, déjà livré. Elle est sans effet — la branche principale l’emporte — et n’a sans doute pas été supprimée après la fusion.",
    staleManyBefore: "Les branches",
    staleManyAfter:
      "portent encore ce cadrage, déjà livré. Elles sont sans effet — la branche principale l’emporte — et n’ont sans doute pas été supprimées après la fusion.",
    writePending:
      "La modification est enregistrée. Elle apparaîtra ici dès que la branche du cadrage aura été relue.",
    settled: "tranchée",
    open: "ouverte",
    chosen: "retenue",
    impactsOnRules: "Impacts sur les règles de gestion",
    impactDetail: (target: string) => `Détail de ${target}`,
    repealed: "abrogée",
    divergent:
      "L’énoncé courant diffère : il a été modifié par un cadrage ultérieur. Ce texte est celui porté par le présent cadrage.",
    touched:
      "Ce cadrage la concerne sans la modifier. La mention sert de signal de relecture.",
    pending:
      "Cette cible n’existe pas encore dans le référentiel : elle sera créée à la livraison du cadrage.",
    attachmentsNote:
      "Le téléchargement des pièces jointes viendra avec la mise en place du stockage objet.",
    settledDecisions: "Décisions tranchées",
    loadingBranches: "Lecture des cadrages en cours…",
    notFound: (id: string) => `Cadrage introuvable : ${id}`,
  },
  en: {
    participle: (operation: ImpactOperation) => EN_PARTICIPLES[operation],
    rules: (n: number) => (n === 1 ? "rule" : "rules"),
    targets: (n: number) => (n === 1 ? "target" : "targets"),
    linkAddFailed: "The link could not be added.",
    linkEditFailed: "The link could not be modified.",
    linkDeleteFailed: "The link could not be deleted.",
    deleteLinkTitle: "Delete this link?",
    deleteLinkMessage: (label: string) =>
      `“${label}” will no longer be attached to this scoping. The resource itself is not affected.`,
    delete: "Delete",
    edit: "Edit",
    goal: "Goal",
    journey: "User journey",
    decisions: "Decisions",
    impacts: "Impacts",
    misc: "Miscellaneous",
    attachments: "Attachments",
    cancelled: "cancelled",
    missingRule: "This rule does not exist in the current specification.",
    size: (bytes: number) =>
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`,
    back: "Scopings",
    scoping: "Scoping",
    resume: "Resume",
    domains: "Domains",
    resources: "Resources",
    pullRequest: (n: number) => `Pull request #${n}`,
    branch: (name: string) => `Branch ${name}`,
    linkActions: (label: string) => `Actions on the link ${label}`,
    adding: "Adding…",
    addLink: "Add a link",
    staleOneBefore: "The branch",
    staleOneAfter:
      "still carries this scoping, already delivered. It has no effect — the main branch prevails — and was probably not deleted after the merge.",
    staleManyBefore: "The branches",
    staleManyAfter:
      "still carry this scoping, already delivered. They have no effect — the main branch prevails — and were probably not deleted after the merge.",
    writePending:
      "The change is saved. It will appear here as soon as the scoping’s branch has been read again.",
    settled: "settled",
    open: "open",
    chosen: "chosen",
    impactsOnRules: "Impacts on business rules",
    impactDetail: (target: string) => `Details of ${target}`,
    repealed: "repealed",
    divergent:
      "The current statement differs: it was modified by a later scoping. This text is the one this scoping carries.",
    touched:
      "This scoping concerns it without modifying it. The mention serves as a review signal.",
    pending:
      "This target does not exist in the specification yet: it will be created when the scoping is delivered.",
    attachmentsNote: "Downloading attachments will come with object storage.",
    settledDecisions: "Settled decisions",
    loadingBranches: "Reading scopings in progress…",
    notFound: (id: string) => `Scoping not found: ${id}`,
  },
});
