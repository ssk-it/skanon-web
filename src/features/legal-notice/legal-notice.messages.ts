import { defineMessages } from "../../core/i18n/language";

/** The publisher's identifiers — name, address, SIRET, VAT number — are not translated: they are written in the page as registered. */
export const legalNoticeMessages = defineMessages({
  fr: {
    title: "Mentions légales",
    translation: null as string | null,
    publisher: "Éditeur",
    name: "Nom",
    legalForm: "Forme juridique",
    legalFormValue: "Auto-entrepreneur",
    address: "Adresse",
    contact: "Contact",
    vat: "N° TVA intracommunautaire",
    host: "Hébergeur",
    ownership: "Propriété intellectuelle",
    copyright:
      "Les droits d’auteur sur Skanon appartiennent à Sébastien Skorupski. Chaque partie est publiée sous sa propre licence.",
    components:
      "Les composants libres sur lesquels Skanon s’appuie restent sous leurs propres licences. Les référentiels qu’il affiche appartiennent à leurs auteurs.",
    personalData: "Données personnelles",
    noTracking:
      "Skanon ne dépose aucun cookie et n’emploie aucun outil de mesure d’audience. Il n’a pas de serveur qui garde vos données : ce qu’il lit, il le tient de GitHub, et le garde sur ce poste.",
    seeHelp:
      "Ce que Skanon fait de vos jetons, ce qu’il garde, et à qui il parle :",
    help: "Fonctionnement de Skanon",
  },
  en: {
    title: "Legal notice",
    // RG-textes-traduits: the source, the publisher's site, exists only in French.
    translation:
      "This notice is a translation: the French version is authoritative.",
    publisher: "Publisher",
    name: "Name",
    legalForm: "Legal form",
    legalFormValue: "Auto-entrepreneur (French sole proprietorship)",
    address: "Address",
    contact: "Contact",
    vat: "EU VAT number",
    host: "Host",
    ownership: "Intellectual property",
    copyright:
      "The copyright on Skanon belongs to Sébastien Skorupski. Each part is published under its own licence.",
    components:
      "The free components Skanon relies on remain under their own licences. The specifications it displays belong to their authors.",
    personalData: "Personal data",
    noTracking:
      "Skanon sets no cookie and uses no audience measurement tool. It has no server that keeps your data: what it reads, it gets from GitHub, and keeps on this device.",
    seeHelp:
      "What Skanon does with your tokens, what it keeps, and whom it talks to:",
    help: "How Skanon works",
  },
});
