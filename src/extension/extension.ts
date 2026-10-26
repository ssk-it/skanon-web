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
  readonly shell?: ShellContributions;
  readonly pages?: PageContributions;
}

/** Ce que porte tout apport à un point qui en reçoit plusieurs. */
export interface Contribution {
  /** Unique parmi les apports du même point. */
  readonly id: string;
  /** Rang parmi les apports du même point, du plus petit au plus grand ; 0 par défaut. À rang égal, l'ordre de composition. */
  readonly rank?: number;
  /** Faux : l'apport ne s'affiche pas. Toujours vrai par défaut. L'extension le calcule elle-même, droits compris : l'interface commune ne sait pas pourquoi. */
  readonly visible?: () => boolean;
}

export interface ShellContributions {
  /** Des boutons de la barre du haut, avant celui de la connexion. */
  readonly toolbarActions?: readonly ToolbarAction[];
  /** Des bandeaux d'état, sous ceux de la coquille, dans son style : l'extension en donne le texte, la coquille la forme. */
  readonly banners?: readonly Banner[];
}

export interface ToolbarAction extends Contribution {
  /** Le nom de l'icône, qui dit l'état courant plutôt que l'action à venir. */
  readonly icon: () => string;
  /** Le nom accessible ; stable, puisque les tests et la suite native le visent. */
  readonly label: string;
  readonly title: () => string;
  /** Vrai : le bouton est mis en avant, comme celui d'un quota bas. */
  readonly alert?: () => boolean;
  readonly activate: () => void;
}

export interface Banner extends Contribution {
  readonly icon: string;
  /** Ce que dit le bandeau ; il ne s'affiche que visible et non vide. */
  readonly text: () => string;
}

/** Les sections de la page « Fonctionnement » où un livrable dit ce qui lui est propre (RG-aide-fidele). */
export type HelpSection = "jetons" | "cache" | "communications";

export interface PageContributions {
  /** Des phrases de la page « Fonctionnement », par section, à l'endroit que la page réserve au livrable. */
  readonly help?: Partial<Readonly<Record<HelpSection, readonly string[]>>>;
  readonly legalNotice?: DeliverableNotice;
}

/** Ce que les mentions légales disent du livrable courant (RG-mentions-legales). */
export interface DeliverableNotice {
  /** Le paragraphe « Hébergeur » : celui qui sert ce livrable, ou l'absence d'hébergeur. Un seul par livrable. */
  readonly host?: string;
  /** Ajouté au paragraphe « Données personnelles ». */
  readonly data?: readonly string[];
  /** Ajouté à « Propriété intellectuelle » : la licence de ce que le livrable apporte. */
  readonly ownership?: readonly NoticePhrase[];
}

/** Une phrase des mentions : du texte, ou du texte autour d'un lien hors de l'application — vers des sources, un texte de licence. */
export type NoticePhrase =
  | string
  | {
      readonly before: string;
      readonly link: { readonly label: string; readonly href: string };
      readonly after?: string;
    };

/** Les apports de toutes les extensions d'un livrable, rassemblés point par point. */
export interface Composition {
  readonly toolbarActions: readonly ToolbarAction[];
  readonly banners: readonly Banner[];
  readonly help: Readonly<Record<HelpSection, readonly string[]>>;
  readonly legalNotice: {
    readonly host: string | null;
    readonly data: readonly string[];
    readonly ownership: readonly NoticePhrase[];
  };
}
