import { defineMessages } from "../../core/i18n/language";

export const rulePageMessages = defineMessages({
  fr: {
    breadcrumb: "Fil d’Ariane",
    functional: "Fonctionnel",
    kind: "Règle de gestion",
    repealed: "abrogée",
    repealedBanner:
      "Cette règle ne s’applique plus. Elle reste consultable parce que les cadrages qui l’ont créée puis abrogée expliquent pourquoi.",
    currentStatement: "Énoncé courant",
    history: "Histoire de cette règle",
    historyIntro:
      "Les cadrages qui l’ont touchée, du plus récent au plus ancien. Chacun porte la décision qui explique son état.",
    notDeliveredYet: "pas encore livré",
    withoutWriting: "sans écriture",
    predatesRepo: "antérieur au dépôt",
    notDeliveredYetReason:
      "Ce cadrage n’a pas encore été livré : il n’a donc pas modifié le référentiel.",
    withoutWritingReason:
      "Un impact « touche » ne modifie pas le texte de la règle : aucun commit ne lui correspond.",
    predatesRepoReason:
      "Aucun commit de ce dépôt ne correspond à ce cadrage — il décrit une décision antérieure.",
    historyUnavailable: "L’historique Git n’a pas pu être chargé.",
    statementThen: "Énoncé porté par ce cadrage",
    statementDiffers:
      "Cet énoncé diffère de l’énoncé courant : il reflète la règle telle qu’elle était à la livraison de ce cadrage.",
    noImpact:
      "Aucun cadrage ne déclare d’impact sur cette règle. C’est une anomalie : toute règle devrait résulter d’un cadrage.",
    neighbors: "Règles voisines",
    inFeature: (name: string) => `Dans ${name}`,
    allRules: (n: number) => `Les ${n} règles de la fonctionnalité`,
    notFound: (id: string) => `Règle introuvable : ${id}`,
  },
  en: {
    breadcrumb: "Breadcrumb",
    functional: "Functional",
    kind: "Business rule",
    repealed: "repealed",
    repealedBanner:
      "This rule no longer applies. It remains available because the scopings that created and then repealed it explain why.",
    currentStatement: "Current statement",
    history: "History of this rule",
    historyIntro:
      "The scopings that touched it, from most recent to oldest. Each carries the decision that explains its state.",
    notDeliveredYet: "not delivered yet",
    withoutWriting: "no write",
    predatesRepo: "predates the repository",
    notDeliveredYetReason:
      "This scoping has not been delivered yet: so it has not modified the specification.",
    withoutWritingReason:
      "A “touches” impact does not modify the rule’s text: no commit corresponds to it.",
    predatesRepoReason:
      "No commit of this repository corresponds to this scoping — it describes an earlier decision.",
    historyUnavailable: "The Git history could not be loaded.",
    statementThen: "Statement carried by this scoping",
    statementDiffers:
      "This statement differs from the current one: it reflects the rule as it was when this scoping was delivered.",
    noImpact:
      "No scoping declares an impact on this rule. This is an anomaly: every rule should result from a scoping.",
    neighbors: "Neighbouring rules",
    inFeature: (name: string) => `In ${name}`,
    allRules: (n: number) => `All ${n} rules of the feature`,
    notFound: (id: string) => `Rule not found: ${id}`,
  },
});
