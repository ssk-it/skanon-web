import { InjectionToken, inject } from "../injection";
import { signal } from "../signaux";
import { EntreeArbre, RefDepot } from "../github/github-client";
import { FichierIdentite, VarianteIdentite } from "./identite-noms";
import type { Chiffreur } from "../../plateforme/ports";

/**
 * Ce qu'on sait d'une branche lue : son arborescence, et quand on l'a lue.
 *
 * C'est ce qui permet deux choses que les contenus seuls ne donnent pas :
 * redemander l'arborescence de façon conditionnelle, et afficher le dernier état
 * lu quand le dépôt ne répond plus (RG-dernier-etat-connu).
 */
export interface EtatConnu {
  /** Le commit que l'arborescence avait résolu. */
  readonly commit: string;
  /** L'étiquette rendue avec l'arborescence, pour la redemander sous condition. */
  readonly etag: string | null;
  /** Instant de la lecture, au format ISO. */
  readonly lu: string;
  readonly entrees: readonly EntreeArbre[];
  readonly tronque: boolean;
  /** Lu par l'API faute d'être servi par le canal public : un dépôt privé. */
  readonly prive: boolean;
}

/**
 * Le stockage du navigateur où vivent les contenus, s'il en a un.
 *
 * Fourni par injection pour que les tests en donnent un neuf à chaque cas, et
 * qu'un navigateur qui n'en a pas — ou le refuse — retombe sur la mémoire de
 * l'onglet plutôt que d'échouer.
 */
export const FABRIQUE_INDEXEDDB = new InjectionToken<IDBFactory | null>(
  "FABRIQUE_INDEXEDDB",
  {
    factory: () => (typeof indexedDB === "undefined" ? null : indexedDB),
  },
);

const NOM_BASE = "ssk-canon.cache";
const CONTENUS = "contenus";
const ETATS = "etats";
const IDENTITES = "identites";

interface ContenuStocke {
  readonly depot: string;
  readonly sha: string;
  readonly contenu: string;
  readonly prive: boolean;
}

interface EtatStocke extends EtatConnu {
  readonly depot: string;
  readonly ref: string;
}

/** Un symbole lu, prêt à montrer. */
export interface SymboleConnu {
  /** Le fichier de `identite/` qui le porte. */
  readonly chemin: string;
  /** Son empreinte, quand l'API l'a donnée : ce qui évite de le relire. */
  readonly sha: string | null;
  /** L'image, en adresse `data:` — voir `IdentitesService`. */
  readonly source: string;
}

/**
 * Ce qu'on sait de l'identité d'un projet, et de quoi la redemander.
 *
 * Lue hors de toute arborescence — l'accueil n'en charge aucune —, elle ne se
 * range pas sous une empreinte de contenu : elle se redemande sous condition,
 * et se remplace en entier. Voir RG-lecture-identite.
 */
export interface IdentiteConnue {
  /** Lue sous un accès, ou par le canal non décompté. */
  readonly canal: "api" | "raw";
  /** L'étiquette de la racine du dépôt, pour la redemander sous condition. */
  readonly etag: string | null;
  /** L'empreinte du répertoire `identite/`, `null` s'il n'existe pas. */
  readonly repertoire: string | null;
  /** Ce que le répertoire contient, quand l'API l'a dit. */
  readonly fichiers: readonly FichierIdentite[] | null;
  /** Le symbole de chaque fond déjà demandé ; `null` quand il n'y en a pas. */
  readonly symboles: Partial<Record<VarianteIdentite, SymboleConnu | null>>;
  readonly prive: boolean;
}

interface IdentiteStockee extends IdentiteConnue {
  readonly depot: string;
}

/**
 * Une entrée privée rangée sous la clé de la passkey. Ce qui la désigne reste lisible — le dépôt, l'empreinte ou la branche —, parce que l'élagage et les effacements trient sur eux ; le reste n'est que le scellé.
 */
interface EntreeScellee {
  readonly prive: true;
  readonly scelle: string;
}

/**
 * Comment le poste garde ce qu'il a lu d'un dépôt privé : sous la même forme que le jeton qui l'a ouvert (RG-contenus-prives-au-repos). En clair ; ou, le jeton scellé par une passkey, sous la clé qu'elle rend — et rien tant qu'elle n'est pas ouverte.
 */
type Protection =
  | { readonly mode: "clair" }
  | { readonly mode: "verrouille" }
  | { readonly mode: "chiffre"; readonly chiffreur: Chiffreur };

const CLAIR: Protection = { mode: "clair" };

/**
 * Les contenus déjà lus, rangés sous l'empreinte que l'arborescence leur donne.
 *
 * Une empreinte désigne un contenu et un seul : ce qui est rangé sous elle ne
 * peut pas être périmé. La fraîcheur ne se joue donc pas ici mais dans
 * l'arborescence, relue à chaque chargement, qui dit quelles empreintes sont en
 * vigueur. Voir RG-contenus-par-empreinte.
 *
 * Deux niveaux : la mémoire de l'onglet, toujours, et le stockage du navigateur
 * quand l'appelant le permet. Ce qui n'est pas persisté — un dépôt privé lu sous
 * un accès temporaire — vit et meurt avec l'onglet, comme l'accès lui-même
 * (RG-contenus-prives-au-repos).
 *
 * Le cache est une copie dérivée, jamais une source : tout échec du stockage est
 * avalé, et ne coûte qu'un téléchargement de plus.
 */
export class ContenusCache {
  private readonly fabrique = inject(FABRIQUE_INDEXEDDB);
  private base: Promise<IDBDatabase | null> | null = null;

  private readonly contenus = new Map<string, ContenuStocke>();
  private readonly etats = new Map<string, EtatStocke>();
  private readonly identites = new Map<string, IdentiteStockee>();

  private protection: Protection = CLAIR;

  /** Range désormais ce qu'il lit d'un dépôt privé sous cette clé ; en clair, sans clé. */
  chiffrerAvec(chiffreur: Chiffreur | null): void {
    this.protection = chiffreur ? { mode: "chiffre", chiffreur } : CLAIR;
  }

  /** Les jetons sont scellés et fermés : ce qui est lu d'un dépôt privé ne vit que dans l'onglet, et les scellés ne se rendent pas. */
  verrouiller(): void {
    this.protection = { mode: "verrouille" };
  }

  /**
   * Augmente à chaque effacement achevé.
   *
   * Ce qu'un écran montre d'un dépôt privé doit disparaître avec l'accès, et
   * non au prochain chargement : c'est le signal que les vues suivent.
   */
  readonly effacements = signal(0);

  async loadContenu(depot: RefDepot, sha: string): Promise<string | null> {
    const cle = cleContenu(depot, sha);
    const memoire = this.contenus.get(cle);
    if (memoire) return memoire.contenu;

    const stocke = await this.desceller<ContenuStocke>(
      await this.lire(CONTENUS, [cleDepot(depot), sha]),
    );
    if (!stocke) return null;
    this.contenus.set(cle, stocke);
    return stocke.contenu;
  }

  async saveContenu(
    depot: RefDepot,
    sha: string,
    contenu: string,
    options: { prive: boolean; persister: boolean },
  ): Promise<void> {
    const entree: ContenuStocke = {
      depot: cleDepot(depot),
      sha,
      contenu,
      prive: options.prive,
    };
    this.contenus.set(cleContenu(depot, sha), entree);
    if (options.persister)
      await this.ecrireProtege(CONTENUS, entree, { depot: entree.depot, sha });
  }

  async loadEtat(depot: RefDepot, ref: string): Promise<EtatConnu | null> {
    const cle = cleEtat(depot, ref);
    const memoire = this.etats.get(cle);
    if (memoire) return memoire;

    const stocke = await this.desceller<EtatStocke>(
      await this.lire(ETATS, [cleDepot(depot), ref]),
    );
    if (!stocke) return null;
    this.etats.set(cle, stocke);
    return stocke;
  }

  async saveEtat(
    depot: RefDepot,
    ref: string,
    etat: EtatConnu,
    options: { persister: boolean },
  ): Promise<void> {
    const entree: EtatStocke = { ...etat, depot: cleDepot(depot), ref };
    this.etats.set(cleEtat(depot, ref), entree);
    if (options.persister)
      await this.ecrireProtege(ETATS, entree, { depot: entree.depot, ref });
  }

  async loadIdentite(depot: RefDepot): Promise<IdentiteConnue | null> {
    const cle = cleDepot(depot);
    const memoire = this.identites.get(cle);
    if (memoire) return memoire;

    const stockee = await this.desceller<IdentiteStockee>(
      await this.lire(IDENTITES, cle),
    );
    if (!stockee) return null;
    this.identites.set(cle, stockee);
    return stockee;
  }

  async saveIdentite(
    depot: RefDepot,
    identite: IdentiteConnue,
    options: { persister: boolean },
  ): Promise<void> {
    const entree: IdentiteStockee = { ...identite, depot: cleDepot(depot) };
    this.identites.set(entree.depot, entree);
    if (options.persister)
      await this.ecrireProtege(IDENTITES, entree, { depot: entree.depot });
  }

  /** Oublie l'identité d'un dépôt — refusée, ou disparue. */
  async clearIdentite(depot: RefDepot): Promise<void> {
    const cle = cleDepot(depot);
    this.identites.delete(cle);
    await this.effacer(IDENTITES, cle);
    this.effacements.update((n) => n + 1);
  }

  /**
   * Retire d'un dépôt ce qu'aucune arborescence lue ne cite plus.
   *
   * `empreintes` réunit celles de la branche principale et des branches de
   * cadrage ; `refs` les branches encore ouvertes. Le cache suit ainsi le
   * référentiel, non son historique.
   */
  async pruneDepot(
    depot: RefDepot,
    empreintes: ReadonlySet<string>,
    refs: ReadonlySet<string>,
  ): Promise<void> {
    const cle = cleDepot(depot);
    this.oublierMemoire(
      (c) => c.depot === cle && !empreintes.has(c.sha),
      (e) => e.depot === cle && !refs.has(e.ref),
      () => false,
    );
    await this.supprimer(
      (c: ContenuStocke) => c.depot === cle && !empreintes.has(c.sha),
      (e: EtatStocke) => e.depot === cle && !refs.has(e.ref),
      () => false,
    );
  }

  /** Efface tout ce qu'on détient d'un dépôt. */
  async clearDepot(depot: RefDepot): Promise<void> {
    const cle = cleDepot(depot);
    this.oublierMemoire(
      (c) => c.depot === cle,
      (e) => e.depot === cle,
      (i) => i.depot === cle,
    );
    await this.supprimer(
      (c: ContenuStocke) => c.depot === cle,
      (e: EtatStocke) => e.depot === cle,
      (i: IdentiteStockee) => i.depot === cle,
    );
    this.effacements.update((n) => n + 1);
  }

  /**
   * Efface les contenus privés des dépôts qu'un accès retiré couvrait.
   *
   * Sans portée, tous : c'est le cas de la déconnexion.
   */
  async clearPrives(
    couvre: (depot: string) => boolean = () => true,
  ): Promise<void> {
    const prives = new Set<string>();
    for (const c of this.contenus.values())
      if (c.prive && couvre(c.depot)) prives.add(c.depot);
    for (const e of this.etats.values())
      if (e.prive && couvre(e.depot)) prives.add(e.depot);
    for (const i of this.identites.values())
      if (i.prive && couvre(i.depot)) prives.add(i.depot);

    this.oublierMemoire(
      (c) => prives.has(c.depot),
      (e) => prives.has(e.depot),
      (i) => prives.has(i.depot),
    );
    await this.supprimer(
      (c: ContenuStocke) => c.prive && couvre(c.depot),
      (e: EtatStocke) => e.prive && couvre(e.depot),
      (i: IdentiteStockee) => i.prive && couvre(i.depot),
    );
    this.effacements.update((n) => n + 1);
  }

  private oublierMemoire(
    contenu: (c: ContenuStocke) => boolean,
    etat: (e: EtatStocke) => boolean,
    identite: (i: IdentiteStockee) => boolean,
  ): void {
    for (const [cle, c] of this.contenus)
      if (contenu(c)) this.contenus.delete(cle);
    for (const [cle, e] of this.etats) if (etat(e)) this.etats.delete(cle);
    for (const [cle, i] of this.identites)
      if (identite(i)) this.identites.delete(cle);
  }

  // --- protection des contenus privés ---

  /** Écrit une entrée telle que la protection le veut : elle-même, son scellé, ou rien. */
  private async ecrireProtege(
    magasin: string,
    entree: { readonly prive: boolean },
    designation: Record<string, string>,
  ): Promise<void> {
    if (!entree.prive || this.protection.mode === "clair")
      return this.ecrire(magasin, entree);
    if (this.protection.mode === "verrouille") return;
    const scellee: EntreeScellee = {
      prive: true,
      scelle: await this.protection.chiffreur.seal(JSON.stringify(entree)),
    };
    await this.ecrire(magasin, { ...designation, ...scellee });
  }

  /** Une entrée lue du stockage, rendue en clair ; `null` pour un scellé qu'aucune clé ouverte n'ouvre. */
  private async desceller<T>(stocke: unknown): Promise<T | null> {
    if (!stocke) return null;
    const scelle = (stocke as Partial<EntreeScellee>).scelle;
    if (scelle === undefined) return stocke as T;
    if (this.protection.mode !== "chiffre") return null;
    const texte = await this.protection.chiffreur.open(scelle);
    if (texte === null) return null;
    try {
      return JSON.parse(texte) as T;
    } catch {
      return null;
    }
  }

  // --- stockage du navigateur ---

  private ouvrir(): Promise<IDBDatabase | null> {
    this.base ??= new Promise((resolve) => {
      if (!this.fabrique) return resolve(null);
      try {
        // Version 2 : les identités. Chaque magasin n'est créé que s'il
        // manque, pour qu'un poste passé par la version 1 garde ses contenus.
        const demande = this.fabrique.open(NOM_BASE, 2);
        demande.onupgradeneeded = () => {
          const db = demande.result;
          const existe = (nom: string) => db.objectStoreNames.contains(nom);
          if (!existe(CONTENUS))
            db.createObjectStore(CONTENUS, { keyPath: ["depot", "sha"] });
          if (!existe(ETATS))
            db.createObjectStore(ETATS, { keyPath: ["depot", "ref"] });
          if (!existe(IDENTITES))
            db.createObjectStore(IDENTITES, { keyPath: "depot" });
        };
        demande.onsuccess = () => resolve(demande.result);
        // Stockage refusé, quota dépassé, navigation privée stricte : l'onglet
        // garde sa mémoire, et le chargement suivant relira simplement tout.
        demande.onerror = () => resolve(null);
        demande.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.base;
  }

  private async lire<T>(magasin: string, cle: IDBValidKey): Promise<T | null> {
    const db = await this.ouvrir();
    if (!db) return null;
    try {
      return await new Promise<T | null>((resolve) => {
        const demande = db.transaction(magasin).objectStore(magasin).get(cle);
        demande.onsuccess = () =>
          resolve((demande.result as T | undefined) ?? null);
        demande.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async ecrire(magasin: string, valeur: unknown): Promise<void> {
    const db = await this.ouvrir();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(magasin, "readwrite");
        tx.objectStore(magasin).put(valeur);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // stockage plein ou refusé : la mémoire de l'onglet suffit
    }
  }

  private async effacer(magasin: string, cle: IDBValidKey): Promise<void> {
    const db = await this.ouvrir();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(magasin, "readwrite");
        tx.objectStore(magasin).delete(cle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // un effacement manqué se rattrape au suivant
    }
  }

  private async supprimer(
    contenu: (c: ContenuStocke) => boolean,
    etat: (e: EtatStocke) => boolean,
    identite: (i: IdentiteStockee) => boolean,
  ): Promise<void> {
    const db = await this.ouvrir();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction([CONTENUS, ETATS, IDENTITES], "readwrite");
        parcourir(tx.objectStore(CONTENUS), contenu);
        parcourir(tx.objectStore(ETATS), etat);
        parcourir(tx.objectStore(IDENTITES), identite);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // un effacement manqué se rattrape au suivant
    }
  }
}

function parcourir<T>(
  magasin: IDBObjectStore,
  aRetirer: (valeur: T) => boolean,
): void {
  const curseur = magasin.openCursor();
  curseur.onsuccess = () => {
    const c = curseur.result;
    if (!c) return;
    if (aRetirer(c.value as T)) c.delete();
    c.continue();
  };
}

/** `organisation/depot`, en minuscules : la forme des portées de jetons. */
function cleDepot(depot: RefDepot): string {
  return `${depot.owner.toLowerCase()}/${depot.repo.toLowerCase()}`;
}

function cleContenu(depot: RefDepot, sha: string): string {
  return `${cleDepot(depot)}|${sha}`;
}

function cleEtat(depot: RefDepot, ref: string): string {
  return `${cleDepot(depot)}|${ref}`;
}
