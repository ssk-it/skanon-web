import { defineMessages } from "../../core/i18n/language";
import type { RichPart } from "./RichText.vue";

const NEW_TOKEN = "https://github.com/settings/personal-access-tokens/new";
const TOKENS = "https://github.com/settings/tokens";

/** GitHub's own labels — Repository access, Contents, Read-only… — stay as GitHub displays them: they are what the reader looks for on its page. */
export const tokenHelpMessages = defineMessages({
  fr: {
    title: "Créer un jeton",
    here: "ici",
    steps: (pasteWhere: string): readonly (readonly RichPart[])[] => [
      [
        "Ouvrir ",
        { link: NEW_TOKEN, text: "la page de création d’un jeton" },
        " sur GitHub.",
      ],
      [
        "Donner un nom qui rappelle son usage — « Skanon » — et une date d’expiration. Un jeton qui n’expire jamais est un jeton qu’on oublie.",
      ],
      [
        "Sous ",
        { strong: "Repository access" },
        ", choisir les dépôts à consulter. Se limiter à ceux-là plutôt que d’accorder l’accès à tout le compte.",
      ],
      [
        "Sous ",
        { strong: "Permissions → Repository permissions" },
        ", accorder ce que l’usage demande — voir le tableau ci-dessous.",
      ],
      [
        `Créer le jeton, le copier, et le coller ${pasteWhere}. GitHub ne l’affichera plus.`,
      ],
    ],
    permission: "Permission",
    toRead: "Pour consulter",
    toWrite: "Pour rédiger",
    whyBothTitle: "Pourquoi écrire demande les deux.",
    whyBoth: [
      " Rédiger un cadrage crée une branche et y dépose un fichier — deux écritures dans le dépôt, que ",
      { strong: "Contents" },
      " autorise. La demande de fusion ne vient qu’ensuite, et c’est ",
      { strong: "Pull requests" },
      " qui l’ouvre. La première écrit dans le dépôt, la seconde demande à fusionner ce qui a été écrit.",
    ] as readonly RichPart[],
    noUncheckedMerge:
      "Rien n’entre pour autant dans la branche principale sans contrôle : la protection du dépôt exige que la vérification d’intégrité soit passée. Un jeton d’écriture ouvre un cadrage, il ne le livre pas seul.",
    whyIssuesTitle: "Pourquoi lire les issues.",
    whyIssues: [
      " La roadmap d’un projet — ce qu’on envisage pour un domaine ou une fonctionnalité — vit dans les issues de son dépôt. Sans ",
      { strong: "Issues" },
      " en lecture, elle ne s’affiche pas ; l’accorder dès la création évite de recréer le jeton.",
    ] as readonly RichPart[],
    leastTitle: "N’accorder que ce dont on a besoin.",
    least: (onDesktop: boolean) =>
      ` Un jeton est conservé ${onDesktop ? "dans le coffre du système" : "par votre navigateur"} : toute personne ayant accès à cette session peut le récupérer. En lecture seule, le pire qu’il permette est de lire ce que vous pouviez déjà lire.`,
    readOnly:
      "Pour consulter, s’en tenir à la lecture. N’accorder l’écriture que si vous rédigez, et la limiter aux dépôts concernés — un jeton d’écriture sur tout le compte fait courir un risque sans rapport avec l’usage.",
    publicTitle: "Un dépôt public a-t-il besoin d’un jeton ?",
    public:
      " Non pour le consulter. Mais sans jeton, GitHub limite l’application à 60 requêtes par heure et par adresse — partagées avec tout autre usage depuis la même connexion. Un jeton porte cette limite à 5 000.",
    history: [
      "Une exception : GitHub refuse ",
      { strong: "l’historique" },
      " à toute requête anonyme, même sur un dépôt public. Les cadrages restent lisibles sans jeton ; leurs dates et leurs auteurs n’apparaissent qu’une fois connecté.",
    ] as readonly RichPart[],
    revoke: [
      "Un jeton se révoque à tout moment depuis ",
      { link: TOKENS, text: "les réglages GitHub" },
      ". Le révoquer suffit : rien à faire ici.",
    ] as readonly RichPart[],
  },
  en: {
    title: "Create a token",
    here: "here",
    steps: (pasteWhere) => [
      [
        "Open ",
        { link: NEW_TOKEN, text: "the token creation page" },
        " on GitHub.",
      ],
      [
        "Give it a name that recalls its use — “Skanon” — and an expiry date. A token that never expires is a token one forgets.",
      ],
      [
        "Under ",
        { strong: "Repository access" },
        ", choose the repos to read. Keep to those rather than granting access to the whole account.",
      ],
      [
        "Under ",
        { strong: "Permissions → Repository permissions" },
        ", grant what the use requires — see the table below.",
      ],
      [
        `Create the token, copy it, and paste it ${pasteWhere}. GitHub will not show it again.`,
      ],
    ],
    permission: "Permission",
    toRead: "To read",
    toWrite: "To write",
    whyBothTitle: "Why writing needs both.",
    whyBoth: [
      " Writing a scoping creates a branch and puts a file on it — two writes in the repo, which ",
      { strong: "Contents" },
      " allows. The pull request only comes next, and ",
      { strong: "Pull requests" },
      " is what opens it. The first writes in the repo, the second asks to merge what was written.",
    ],
    noUncheckedMerge:
      "Nothing enters the main branch unchecked for all that: the repo's protection requires the integrity check to have passed. A write token opens a scoping, it does not deliver it alone.",
    whyIssuesTitle: "Why read issues.",
    whyIssues: [
      " A project's roadmap — what is envisaged for a domain or a feature — lives in its repo's issues. Without ",
      { strong: "Issues" },
      " read access, it does not show; granting it at creation saves creating the token again.",
    ],
    leastTitle: "Grant only what you need.",
    least: (onDesktop) =>
      ` A token is kept ${onDesktop ? "in the system keychain" : "by your browser"}: anyone with access to this session can retrieve it. Read-only, the worst it allows is reading what you could already read.`,
    readOnly:
      "To read, stick to read access. Grant write access only if you write scopings, and limit it to the repos concerned — a write token on the whole account runs a risk unrelated to the use.",
    publicTitle: "Does a public repo need a token?",
    public:
      " Not to read it. But without a token, GitHub limits the application to 60 requests per hour and per address — shared with any other use from the same connection. A token raises that limit to 5,000.",
    history: [
      "One exception: GitHub refuses ",
      { strong: "history" },
      " to any anonymous request, even on a public repo. Scopings remain readable without a token; their dates and authors only appear once signed in.",
    ],
    revoke: [
      "A token can be revoked at any time from ",
      { link: TOKENS, text: "the GitHub settings" },
      ". Revoking it is enough: nothing to do here.",
    ],
  },
});
