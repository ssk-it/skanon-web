import { markRaw, type Component } from "vue";
import { signal } from "../core/signaux";

/**
 * Comment s'ouvre un dialogue. Tout est facultatif.
 */
export interface DialogOptions<D> {
  /** Ce que le composant reçoit en prop `data`. */
  readonly data?: D;
  /** La largeur du panneau — `'640px'`. Sans elle, le panneau prend celle de son contenu, entre 280 et 560 px. */
  readonly width?: string;
  /** La largeur maximale, qui remplace les 560 px de Material — `'calc(100vw - 32px)'`. */
  readonly maxWidth?: string;
  /** La distance au haut de la fenêtre ; sans elle, le panneau est centré verticalement. */
  readonly top?: string;
  /** Une classe de plus sur le panneau, pour un dialogue qui s'habille à part (la palette de recherche). */
  readonly className?: string;
  /** Le nom du dialogue pour les lecteurs d'écran, quand il n'a pas de titre visible. */
  readonly label?: string;
  /**
   * Ce qui reçoit le focus à l'ouverture : le premier élément focalisable — ou celui qui porte `data-focus-initial` — par défaut ; le panneau lui-même avec `'dialogue'`, l'équivalent de `autoFocus: 'dialog'`.
   */
  readonly focus?: "premier" | "dialogue";
}

/** Un dialogue ouvert, tel que `UiDialogHote` le monte. */
export interface OpenDialog {
  readonly id: number;
  readonly component: Component;
  readonly options: DialogOptions<unknown>;
  /** Ferme le dialogue ; la promesse d'`open` se résout avec ce résultat. */
  close(result?: unknown): void;
}

/**
 * Le service des dialogues : `MatDialog`, sans Material.
 *
 * ```ts
 * const dialog = inject(DialogService);
 * const confirme = await dialog.open<boolean>(ConfirmationDialog, {
 *   data: { titre: "Supprimer ce lien ?", message: "…", action: "Supprimer" },
 * });
 * if (!confirme) return;
 * ```
 *
 * Le composant ouvert reçoit `data` en prop et émet `fermer(résultat)` ; sa structure — titre, contenu qui défile, actions — vient de `UiDialogue`. La promesse se résout avec le résultat émis, ou avec `undefined` quand le dialogue est fermé sans réponse : Échap, clic sur le fond, changement de page.
 *
 * Le service ne fait que tenir la liste des dialogues ouverts ; `UiDialogHote`, monté une fois dans `App.vue`, les affiche, piège le focus dans le dernier ouvert et le rend ensuite à l'élément qui l'avait.
 */
export class DialogService {
  readonly openDialogs = signal<readonly OpenDialog[]>([]);
  private nextId = 1;

  open<R = unknown, D = unknown>(
    component: Component,
    options: DialogOptions<D> = {},
  ): Promise<R | undefined> {
    return new Promise<R | undefined>((resolve) => {
      const id = this.nextId++;
      const dialog: OpenDialog = {
        id,
        // Le composant est une définition, non un état : le rendre réactif ne servirait à rien et coûterait à chaque rendu.
        component: markRaw(component),
        options,
        close: (result?: unknown) => {
          if (!this.openDialogs().some((d) => d.id === id)) return;
          this.openDialogs.update((list) => list.filter((d) => d.id !== id));
          resolve(result as R | undefined);
        },
      };
      this.openDialogs.update((list) => [...list, dialog]);
    });
  }

  /** Ferme tous les dialogues sans réponse — à la navigation, comme `closeOnNavigation`. */
  closeAll(): void {
    for (const d of [...this.openDialogs()].reverse()) d.close(undefined);
  }
}
