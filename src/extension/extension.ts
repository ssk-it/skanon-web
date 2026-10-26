/**
 * Ce qu'un livrable ajoute à l'interface commune, et que le code commun ne doit pas connaître : ce qui tient au livrable — qui l'héberge, d'où viennent ses versions, sous quelle licence elles s'obtiennent, ce qu'il vend. Ce qui tient au système passe par les ports (ADR-extensions-commerciales).
 *
 * Chaque point d'extension nomme un endroit de l'interface, jamais une fonctionnalité. Un point naît avec la première extension qui l'emploie, et un test l'éprouve par une extension factice.
 *
 * Une extension est créée par la racine de composition de son livrable, qui lui passe ce dont elle a besoin : elle ne demande rien à l'interface commune qui ne soit exporté.
 */
export interface Extension {
  /** Unique parmi les extensions d'un livrable. */
  readonly id: string;
  readonly coquille?: ApportsDeCoquille;
  readonly pages?: ApportsDePages;
}

/** Ce que porte tout apport à un point qui en reçoit plusieurs. */
export interface Contribution {
  /** Unique parmi les apports du même point. */
  readonly id: string;
  /** Rang parmi les apports du même point, du plus petit au plus grand ; 0 par défaut. À rang égal, l'ordre de composition. */
  readonly rang?: number;
  /** Faux : l'apport ne s'affiche pas. Toujours vrai par défaut. L'extension le calcule elle-même, droits compris : l'interface commune ne sait pas pourquoi. */
  readonly visible?: () => boolean;
}

export interface ApportsDeCoquille {
  /** Des boutons de la barre du haut, avant celui de la connexion. */
  readonly actionsDeBarre?: readonly ActionDeBarre[];
  /** Des bandeaux d'état, sous ceux de la coquille, dans son style : l'extension en donne le texte, la coquille la forme. */
  readonly bandeaux?: readonly Bandeau[];
}

export interface ActionDeBarre extends Contribution {
  /** Le nom de l'icône, qui dit l'état courant plutôt que l'action à venir. */
  readonly icone: () => string;
  /** Le nom accessible ; stable, puisque les tests et la suite native le visent. */
  readonly libelle: string;
  readonly titre: () => string;
  /** Vrai : le bouton est mis en avant, comme celui d'un quota bas. */
  readonly alerte?: () => boolean;
  readonly activer: () => void;
}

export interface Bandeau extends Contribution {
  readonly icone: string;
  /** Ce que dit le bandeau ; il ne s'affiche que visible et non vide. */
  readonly texte: () => string;
}

/** Les sections de la page « Fonctionnement » où un livrable dit ce qui lui est propre (RG-aide-fidele). */
export type SectionAide = "jetons" | "cache" | "communications";

export interface ApportsDePages {
  /** Des phrases de la page « Fonctionnement », par section, à l'endroit que la page réserve au livrable. */
  readonly aide?: Partial<Readonly<Record<SectionAide, readonly string[]>>>;
  readonly mentions?: MentionsDuLivrable;
}

/** Ce que les mentions légales disent du livrable courant (RG-mentions-legales). */
export interface MentionsDuLivrable {
  /** Le paragraphe « Hébergeur » : celui qui sert ce livrable, ou l'absence d'hébergeur. Un seul par livrable. */
  readonly hebergeur?: string;
  /** Ajouté au paragraphe « Données personnelles ». */
  readonly donnees?: readonly string[];
  /** Ajouté à « Propriété intellectuelle » : la licence de ce que le livrable apporte. */
  readonly propriete?: readonly PhraseDeMention[];
}

/** Une phrase des mentions : du texte, ou du texte autour d'un lien hors de l'application — vers des sources, un texte de licence. */
export type PhraseDeMention =
  | string
  | {
      readonly avant: string;
      readonly lien: { readonly libelle: string; readonly href: string };
      readonly apres?: string;
    };

/** Les apports de toutes les extensions d'un livrable, rassemblés point par point. */
export interface Composition {
  readonly actionsDeBarre: readonly ActionDeBarre[];
  readonly bandeaux: readonly Bandeau[];
  readonly aide: Readonly<Record<SectionAide, readonly string[]>>;
  readonly mentions: {
    readonly hebergeur: string | null;
    readonly donnees: readonly string[];
    readonly propriete: readonly PhraseDeMention[];
  };
}
