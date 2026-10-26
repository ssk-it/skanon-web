import { markRaw, type Component } from "vue";
import { signal } from "../core/signals";

/**
 * How a dialog opens. Everything is optional.
 */
export interface DialogOptions<D> {
  /** What the component receives as its `data` prop. */
  readonly data?: D;
  /** The panel width — `'640px'`. Without it, the panel takes its content's width, between 280 and 560 px. */
  readonly width?: string;
  /** The maximum width, which replaces Material's 560 px — `'calc(100vw - 32px)'`. */
  readonly maxWidth?: string;
  /** The distance from the top of the window; without it, the panel is centred vertically. */
  readonly top?: string;
  /** One more class on the panel, for a dialog styled on its own (the search palette). */
  readonly className?: string;
  /** The dialog's name for screen readers, when it has no visible title. */
  readonly label?: string;
  /**
   * What receives focus on opening: the first focusable element — or the one carrying `data-focus-initial` — by default; the panel itself with `'dialogue'`, the equivalent of `autoFocus: 'dialog'`.
   */
  readonly focus?: "premier" | "dialogue";
}

/** An open dialog, as `UiDialogHost` mounts it. */
export interface OpenDialog {
  readonly id: number;
  readonly component: Component;
  readonly options: DialogOptions<unknown>;
  /** Closes the dialog; the promise from `open` resolves with this result. */
  close(result?: unknown): void;
}

/**
 * The dialog service: `MatDialog`, without Material.
 *
 * ```ts
 * const dialog = inject(DialogService);
 * const confirmed = await dialog.open<boolean>(ConfirmationDialog, {
 *   data: { title: "Supprimer ce lien ?", message: "…", action: "Supprimer" },
 * });
 * if (!confirmed) return;
 * ```
 *
 * The opened component receives `data` as a prop and emits `close(result)`; its structure — title, scrolling content, actions — comes from `UiDialog`. The promise resolves with the emitted result, or with `undefined` when the dialog is closed without an answer: Escape, click on the backdrop, page change.
 *
 * The service only keeps the list of open dialogs; `UiDialogHost`, mounted once in `App.vue`, shows them, traps focus in the last one opened and then gives it back to the element that had it.
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
        // The component is a definition, not state: making it reactive would serve no purpose and cost on every render.
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

  /** Closes all dialogs without an answer — on navigation, like `closeOnNavigation`. */
  closeAll(): void {
    for (const d of [...this.openDialogs()].reverse()) d.close(undefined);
  }
}
