/**
 * Le modèle du référentiel et des cadrages.
 *
 * Les identifiants sont des slugs stables et lisibles, jamais des UUID : ils
 * apparaissent dans les chemins de fichiers et les liens croisés, et ne changent
 * jamais. Voir RG-identifiants-stables.
 */

/**
 * Le statut d'un cadrage ne se déclare pas : il se déduit de l'état du dépôt.
 *
 * Un champ `statut:` dans le frontmatter serait une seconde source pour un fait
 * que la plateforme établit déjà, et c'est cette duplication qui avait divergé.
 * Le vérificateur de l'Action refuse désormais un statut déclaré.
 *
 * La branche principale établit la livraison ; la demande de fusion porte le
 * reste du cycle. Voir `deriverStatut` dans `statut-derive.ts`.
 */
export type StatutCadrage = "brouillon" | "en_relecture" | "validee" | "livree";
export type StatutRegle = "actif" | "abroge";
export type OperationImpact = "cree" | "modifie" | "abroge" | "touche";
export type StatutDecision = "ouverte" | "retenue" | "annulee";

export interface Domaine {
  readonly id: string;
  readonly nom: string;
  /** Corps Markdown : la description. */
  readonly description: string;
}

export interface Fonctionnalite {
  readonly id: string;
  readonly nom: string;
  readonly domaines: readonly string[];
  readonly description: string;
}

export interface Regle {
  readonly id: string;
  readonly statut: StatutRegle;
  readonly fonctionnalites: readonly string[];
  /** L'énoncé, en Markdown. C'est le contenu qui compte. */
  readonly enonce: string;
  /**
   * Index dérivés de l'historique, écrits par la propagation.
   * Jamais une source de vérité — voir RG-histoire-derivee.
   */
  readonly creePar: string | null;
  readonly modifiePar: readonly string[];
}

export interface LienExterne {
  readonly tag: string;
  readonly url: string;
  /**
   * Le libellé affiché, tel que saisi.
   *
   * Le tag ne dit que la nature du lien : deux issues d'un même cadrage
   * s'annonceraient toutes deux « Issue GitHub », et rien ne les distinguerait
   * sans ouvrir les deux. Vide sur les cadrages écrits avant ce champ, d'où le
   * repli sur le libellé du tag à l'affichage.
   */
  readonly nom: string;
}

/**
 * Ce qu'un impact peut viser.
 *
 * `regle` dit ce que le produit fait ; `adr` et `architecture` disent comment il
 * est construit. Les trois suivent le même régime de projection — voir
 * RG-cible-impact.
 */
export type NatureCible = "regle" | "adr" | "architecture";

/** Les natures qu'un document d'architecture peut prendre — RG-architecture-flux-composants. */
export type NatureDocument = "composant" | "flux" | "contexte";

export interface Impact {
  /**
   * L'identifiant visé, quelle que soit sa nature.
   *
   * `regle` est conservé pour les cadrages écrits avant que l'impact puisse
   * viser autre chose : un champ retiré rendrait illisible tout l'historique
   * déjà commité, que rien ne réécrira.
   */
  readonly cible: string;
  readonly nature: NatureCible;
  readonly operation: OperationImpact;
  /** @deprecated Lire `cible`. Présent tant que des cadrages l'emploient. */
  readonly regle: string;
}

/**
 * Une décision d'architecture : pourquoi le système est construit ainsi.
 *
 * Même forme qu'une règle, à un détail près — elle n'est rattachée à aucune
 * fonctionnalité. Le référentiel fonctionnel se parcourt par domaines et
 * fonctionnalités ; l'architecture se parcourt par son propre répertoire.
 */
export interface DecisionArchitecture {
  readonly id: string;
  readonly statut: StatutRegle;
  readonly enonce: string;
  readonly creePar: string | null;
  readonly modifiePar: readonly string[];
}

/**
 * Un document d'architecture : composant, flux, ou vue d'ensemble.
 *
 * Un flux référence les composants qu'il relie plutôt que de les décrire. La
 * relation inverse — quels flux touchent ce composant — se calcule de ces
 * références, et n'est donc tenue nulle part.
 */
export interface DocumentArchitecture {
  readonly id: string;
  readonly nature: NatureDocument;
  readonly statut: StatutRegle;
  /** Les composants reliés, pour un flux. Vide pour un composant ou le contexte. */
  readonly composants: readonly string[];
  readonly enonce: string;
  readonly creePar: string | null;
  readonly modifiePar: readonly string[];
}

export interface Option {
  readonly id: string;
  readonly titre: string;
  readonly retenue: boolean;
  readonly corps: string;
}

export interface Decision {
  readonly id: string;
  readonly titre: string;
  readonly statut: StatutDecision;
  readonly optionRetenue: string | null;
  readonly description: string;
  readonly options: readonly Option[];
  /** Le corps complet, pour l'affichage brut si le découpage échoue. */
  readonly corps: string;
}

export interface PieceJointe {
  readonly nom: string;
  readonly sha256: string;
  readonly taille: number;
  readonly type: string;
  readonly ajouteLe: string | null;
}

/**
 * D'où vient un cadrage qu'on n'a pas encore livré.
 *
 * Un cadrage en brouillon ou en relecture n'est jamais sur la branche par
 * défaut : il y arrive à sa livraison. Le montrer sans dire d'où il vient
 * laisserait croire qu'il fait déjà partie du référentiel.
 */
export interface ProvenanceCadrage {
  readonly branche: string;
  /**
   * Absent pour une branche qui n'a pas encore de demande de fusion : un
   * cadrage commencé, en brouillon (RG-statuts-cadrage).
   */
  readonly pullRequest?: number;
  readonly brouillon: boolean;
  /**
   * La décision des relecteurs, telle que la plateforme la résume.
   *
   * `null` quand personne ne s'est encore prononcé, ou quand l'appel qui la lit
   * n'a pas abouti : le cadrage est alors montré en relecture, jamais validé.
   * Affirmer une validation qui n'a pas eu lieu serait le seul mensonge coûteux
   * de cette dérivation.
   */
  readonly approbation?: DecisionRelecture | null;
}

/** Ce que GitHub résume de l'avis des relecteurs sur une demande de fusion. */
export type DecisionRelecture =
  "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";

/**
 * Une section de niveau 2 que le gabarit d'un cadrage ne présente pas en propre.
 *
 * Un cadrage porte ce que son auteur juge utile : un relevé de mesures, des
 * questions ouvertes, une note. L'éditeur les conservait déjà à la réécriture,
 * mais la fiche ne les montrait nulle part — écrit et invisible, ce qui est
 * pire que refusé.
 */
export interface SectionDivers {
  readonly titre: string;
  readonly corps: string;
}

export interface Cadrage {
  readonly id: string;
  readonly titre: string;
  readonly statut: StatutCadrage;
  readonly domaines: readonly string[];
  readonly liens: readonly LienExterne[];
  readonly impacts: readonly Impact[];
  readonly objectif: string;
  readonly parcours: string;
  /** Énoncés portés par ce cadrage, indexés par identifiant de règle. */
  readonly enonces: ReadonlyMap<string, string>;
  readonly decisions: readonly Decision[];
  readonly piecesJointes: readonly PieceJointe[];
  /**
   * Les sections que la fiche rassemble sous « Divers », dans leur ordre
   * d'origine.
   */
  readonly divers: readonly SectionDivers[];
  /** Renseigné pour un cadrage lu depuis une branche, absent sur la principale. */
  readonly provenance?: ProvenanceCadrage;
  /**
   * Les branches qui portent encore ce cadrage, déjà livré
   * (RG-branches-survivantes-signalees). Sans effet, elles sont signalées pour
   * qu'on ne les reprenne pas en croyant travailler sur un cadrage en cours.
   */
  readonly branchesSurvivantes?: readonly string[];
}

/**
 * Comment les rédacteurs d'un projet obtiennent l'accès au dépôt.
 *
 * Les trois modes s'empilent : chacun lève un obstacle que le précédent laissait,
 * sans annuler ce qu'il apportait. Passer de l'un à l'autre ne demande de
 * reprendre ni le référentiel ni les cadrages — seule la façon d'obtenir l'accès
 * change. Voir RG-modes-acces.
 */
export type ModeAcces = "jeton_personnel" | "identite_tierce" | "relais";

/**
 * Ce que chaque mode garantit, et ce qu'il ne garantit pas.
 *
 * Ces limites sont imposées par la plateforme, non choisies : un jeton
 * d'installation se restreint aux dépôts et aux permissions, jamais aux chemins.
 * Les annoncer est ce qu'exige RG-garanties-annoncees — une garantie absente
 * qu'on tairait ferait cesser de se méfier là où il faudrait.
 */
export interface GarantiesAcces {
  /** Jusqu'où descend l'autorisation. */
  readonly portee: "depot" | "chemin";
  /** Si l'auteur d'un commit est vérifié, ou seulement déclaré par le client. */
  readonly auteurVerifie: boolean;
  /** Si le rédacteur doit disposer d'un compte sur la plateforme de dépôt. */
  readonly compteRequis: boolean;
}

export const GARANTIES: Record<ModeAcces, GarantiesAcces> = {
  jeton_personnel: {
    portee: "depot",
    auteurVerifie: false,
    compteRequis: true,
  },
  identite_tierce: {
    portee: "depot",
    auteurVerifie: false,
    compteRequis: false,
  },
  relais: { portee: "chemin", auteurVerifie: true, compteRequis: false },
};

/**
 * Ce qu'un projet demande du jeton qui l'ouvre, dans la version web : la passkey proposée au rédacteur, ou exigée de lui (RG-protection-du-jeton-par-projet). Proposée est le défaut : un projet qui ne règle rien fonctionne comme avant.
 */
export type ProtectionDuJeton = "proposee" | "exigee";

/** Les valeurs qu'un projet peut déclarer, pour valider ce qui est lu. */
export const PROTECTIONS_DU_JETON: ReadonlySet<ProtectionDuJeton> =
  new Set<ProtectionDuJeton>(["proposee", "exigee"]);

/** Les modes qu'un projet peut déclarer, pour valider ce qui est lu. */
export const MODES_ACCES: ReadonlySet<ModeAcces> = new Set<ModeAcces>([
  "jeton_personnel",
  "identite_tierce",
  "relais",
]);

export const LIBELLE_MODE_ACCES: Record<ModeAcces, string> = {
  jeton_personnel: "Jeton personnel",
  identite_tierce: "Identité tierce",
  relais: "Relais",
};

/**
 * Où le projet fait vérifier l'identité de ses rédacteurs.
 *
 * Rien de secret ici : l'émetteur et l'identifiant du client sont publics par
 * nature, comme dans toute application qui s'exécute dans un navigateur. Le
 * client n'a pas de secret — c'est l'échange à secret jetable qui le protège.
 */
export interface ReglagesIdentite {
  /** Racine du serveur d'identité, jusqu'au domaine du projet inclus. */
  readonly emetteur: string;
  /** Identifiant du client public déclaré chez cet émetteur. */
  readonly client: string;
  /** Composant qui échange une identité vérifiée contre un accès au dépôt. */
  readonly echange: string;
}

/**
 * Ce qu'un projet règle pour lui-même, dans son fichier de configuration.
 *
 * Ces réglages vivent dans le dépôt, non dans le navigateur : ils valent pour
 * tous ceux qui travaillent sur le projet, se relisent sur la plateforme, et
 * suivent le dépôt s'il change de mains. Un réglage d'équipe qui varierait d'un
 * poste à l'autre ne réglerait rien.
 */
export interface ReglagesProjet {
  /**
   * Comment les rédacteurs obtiennent l'accès au dépôt.
   *
   * Le jeton personnel est le défaut : un projet qui ne déclare rien fonctionne,
   * et n'a rien à héberger.
   */
  readonly acces: ModeAcces;
  /**
   * Paramètres du mode « identité tierce ». Absents dans les autres modes, et
   * absents aussi d'un projet qui déclare ce mode sans les fournir — auquel cas
   * l'application le signale plutôt que d'échouer à la connexion.
   */
  readonly identite: ReglagesIdentite | null;
  /** Si le jeton qui ouvre ce projet doit être gardé sous passkey dans la version web. */
  readonly protectionDuJeton: ProtectionDuJeton;
  /**
   * Les natures de lien externe que ce projet reconnaît.
   *
   * Déclarées dans le dépôt : un projet suivi sur Trello et un autre sur Jira
   * n'ont pas les mêmes ressources à référencer, et une liste en dur dans
   * l'application obligerait à la modifier pour chaque projet.
   */
  readonly tagsLiens: readonly string[];
}

/** Le contenu complet d'un dépôt de projet, tel que chargé en mémoire. */
/**
 * Un dépôt de code que ce projet réalise.
 *
 * Le lien est déclaré ici, du côté qui a autorité : le dépôt de cadrage porte la
 * vue « projet », que plusieurs dépôts de code composent. Le déclarer dans
 * chaque dépôt de code le dupliquerait autant de fois qu'il y en a, et rien ne
 * garantirait qu'ils restent d'accord.
 */
export interface DepotCode {
  /** `organisation/depot`, tel que la plateforme le nomme. */
  readonly repo: string;
  /** Ce qu'il porte, en quelques mots. Facultatif. */
  readonly role: string;
}

export interface Referentiel {
  readonly projet: {
    readonly nom: string;
    readonly description: string;
    readonly depotsCode: readonly DepotCode[];
    /**
     * Le préfixe ajouté aux identifiants à l'affichage — RG-prefixe-projet.
     *
     * `null` quand le projet n'en déclare pas, ce qui est le cas par défaut :
     * ses identifiants s'affichent alors nus, comme ils sont stockés.
     */
    readonly prefixe: string | null;
  };
  readonly reglages: ReglagesProjet;
  readonly domaines: ReadonlyMap<string, Domaine>;
  readonly fonctionnalites: ReadonlyMap<string, Fonctionnalite>;
  readonly regles: ReadonlyMap<string, Regle>;
  /** Ce qui décrit comment le produit est construit — cadrage 2026-038. */
  readonly decisions: ReadonlyMap<string, DecisionArchitecture>;
  readonly architecture: ReadonlyMap<string, DocumentArchitecture>;
  readonly cadrages: ReadonlyMap<string, Cadrage>;
  /** Anomalies rencontrées au chargement, non bloquantes pour l'affichage. */
  readonly anomalies: readonly string[];
}

/** Les statuts qu'un cadrage peut porter, pour valider ce qui est déclaré. */
export const STATUTS_CADRAGE: ReadonlySet<StatutCadrage> =
  new Set<StatutCadrage>(["brouillon", "en_relecture", "validee", "livree"]);

/**
 * Les bascules de statut que l'application propose — RG-bascule-de-statut.
 *
 * Fixes, et non réglables : le statut se lit sur la demande de fusion, et
 * l'application ne sait la déplacer qu'entre brouillon et prête à relire.
 * « Validée » ne s'obtient que par une relecture ; se l'accorder à soi-même la
 * viderait de son sens. « Livrée » résulte de la fusion, et rien ne la propose.
 * Un cadrage validé peut repasser en brouillon : on le reprend.
 */
export const BASCULES_STATUT: ReadonlyMap<
  StatutCadrage,
  readonly StatutCadrage[]
> = new Map<StatutCadrage, readonly StatutCadrage[]>([
  ["brouillon", ["en_relecture"]],
  ["en_relecture", ["brouillon"]],
  ["validee", ["brouillon"]],
  // un cadrage livré ne se reprend plus : ses impacts sont propagés
  ["livree", []],
]);

// --- libellés d'affichage ---

export const LIBELLE_STATUT_CADRAGE: Record<StatutCadrage, string> = {
  brouillon: "Brouillon",
  en_relecture: "En relecture",
  validee: "Validée",
  livree: "Livrée",
};

/**
 * Les statuts d'une décision.
 *
 * `annulee` conserve la décision et son motif : l'effacer ferait reposer la
 * question, sans le raisonnement qui l'avait close.
 */
export const STATUTS_DECISION: readonly StatutDecision[] = [
  "ouverte",
  "retenue",
  "annulee",
];

export const LIBELLE_STATUT_DECISION: Record<StatutDecision, string> = {
  ouverte: "Ouverte",
  retenue: "Retenue",
  annulee: "Annulée",
};

export const LIBELLE_OPERATION: Record<OperationImpact, string> = {
  cree: "crée",
  modifie: "modifie",
  abroge: "abroge",
  touche: "touche",
};

/**
 * Les natures de lien d'un projet qui n'en déclare aucune.
 *
 * Les mêmes que celles du fichier de configuration d'exemple : un projet
 * amorcé sans y toucher retrouve ce qu'il aurait eu en le lisant.
 */
export const TAGS_LIENS_PAR_DEFAUT: readonly string[] = [
  "carte_trello",
  "issue_github",
  "piste",
  "maquette",
  "document",
];

export const LIBELLE_TAG_LIEN: Record<string, string> = {
  carte_trello: "Carte Trello",
  issue_github: "Issue GitHub",
  piste: "Piste",
  maquette: "Maquette",
  document: "Document",
};

/**
 * Ordre du cycle de vie : brouillon, en relecture, validée, livrée.
 *
 * C'est l'ordre de la liste des cadrages, où ce qui demande de l'attention
 * passe devant ce qui fait déjà référence.
 */
export const ORDRE_CYCLE_VIE: Record<StatutCadrage, number> = {
  brouillon: 0,
  en_relecture: 1,
  validee: 2,
  livree: 3,
};

/**
 * Ordre inverse, pour lire une histoire à rebours.
 *
 * Sur la chronologie d'une règle, on part de l'état actuel — donc du cadrage
 * livré le plus récent — pour remonter vers son origine.
 */
export const ORDRE_HISTORIQUE: Record<StatutCadrage, number> = {
  livree: 0,
  validee: 1,
  en_relecture: 2,
  brouillon: 3,
};
