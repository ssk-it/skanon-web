import type { Localized } from "../core/i18n/language";

/**
 * What a deliverable adds to the shared interface, and that the shared code must not know: what belongs to the deliverable — who hosts it, where its versions come from, under what licence they are obtained, what it sells. What belongs to the system goes through the ports (ADR-extensions-commerciales).
 *
 * Each extension point names a place in the interface, never a feature. A point is born with the first extension that uses it, and a test exercises it through a fake extension.
 *
 * Every phrase an extension brings is given in every language (`Localized`), all required by the type: a language it forgets does not compile (RG-textes-traduits).
 *
 * An extension is created by its deliverable's composition root, which passes it what it needs: it asks nothing of the shared interface that is not exported.
 */
export interface Extension {
  /** Unique among a deliverable's extensions. */
  readonly id: string;
  readonly shell?: ShellContributions;
  readonly pages?: PageContributions;
}

/** What every contribution carries to a point that receives several. */
export interface Contribution {
  /** Unique among the contributions to the same point. */
  readonly id: string;
  /** Rank among the contributions to the same point, from smallest to largest; 0 by default. At equal rank, composition order. */
  readonly rank?: number;
  /** False: the contribution is not shown. Always true by default. The extension computes it itself, permissions included: the shared interface does not know why. */
  readonly visible?: () => boolean;
}

export interface ShellContributions {
  /** Buttons of the top bar, before the sign-in one. */
  readonly toolbarActions?: readonly ToolbarAction[];
  /** Status banners, below the shell's, in its style: the extension gives their text, the shell their form. */
  readonly banners?: readonly Banner[];
}

export interface ToolbarAction extends Contribution {
  /** The icon's name, which shows the current state rather than the action to come. */
  readonly icon: () => string;
  /** The accessible name; stable in each language, since tests and the native suite target it. */
  readonly label: Localized<string>;
  readonly title: () => Localized<string>;
  /** True: the button is highlighted, like that of a low quota. */
  readonly alert?: () => boolean;
  readonly activate: () => void;
}

export interface Banner extends Contribution {
  readonly icon: string;
  /** What the banner says; it is only shown when visible and not empty. */
  readonly text: () => Localized<string>;
}

/** The sections of the « Fonctionnement » page where a deliverable says what is specific to it (RG-aide-fidele). */
export type HelpSection = "jetons" | "cache" | "communications";

export interface PageContributions {
  /** Phrases of the « Fonctionnement » page, by section, at the place the page reserves for the deliverable. */
  readonly help?: Partial<
    Readonly<Record<HelpSection, readonly Localized<string>[]>>
  >;
  readonly legalNotice?: DeliverableNotice;
}

/** What the legal notice says about the current deliverable (RG-mentions-legales). */
export interface DeliverableNotice {
  /** The « Hébergeur » paragraph: the one that serves this deliverable, or the absence of a host. Only one per deliverable. */
  readonly host?: Localized<string>;
  /** Added to the « Données personnelles » paragraph. */
  readonly data?: readonly Localized<string>[];
  /** Added to « Propriété intellectuelle »: the licence of what the deliverable contributes. */
  readonly ownership?: readonly NoticePhrase[];
}

/** A phrase of the notice, in every language. */
export type NoticePhrase = Localized<NoticeText>;

/** Text, or text around a link outside the application — to sources, a licence text. */
export type NoticeText =
  | string
  | {
      readonly before: string;
      readonly link: { readonly label: string; readonly href: string };
      readonly after?: string;
    };

/** The contributions of all of a deliverable's extensions, gathered point by point. */
export interface Composition {
  readonly toolbarActions: readonly ToolbarAction[];
  readonly banners: readonly Banner[];
  readonly help: Readonly<Record<HelpSection, readonly Localized<string>[]>>;
  readonly legalNotice: {
    readonly host: Localized<string> | null;
    readonly data: readonly Localized<string>[];
    readonly ownership: readonly NoticePhrase[];
  };
}
