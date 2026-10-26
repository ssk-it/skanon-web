import { onBeforeUnmount, watch, type Ref } from "vue";

/**
 * Ce que partagent les panneaux du kit — liste de choix, autocomplétion, menu : ils se posent par-dessus la page, au plus près de ce qui les a ouverts, et se referment au clic dehors. C'est ce que la superposition du CDK faisait pour Material.
 *
 * Un panneau est téléporté dans `body`, en position fixe : posé dans le flux, un dialogue qui défile le rognerait.
 */

/** Au-dessus des dialogues (`z-index: 1000`), sous un diagramme agrandi (1200). */
export const Z_PANEL = 1100;

/** La marge qu'un panneau garde avec les bords de la fenêtre. */
const MARGIN = 8;

export interface Position {
  readonly top: string;
  readonly left: string;
  readonly minWidth?: string;
}

/**
 * Pose un panneau sous son ancre, aligné à gauche — ou au-dessus quand il ne tient pas en dessous, et décalé vers la gauche quand il déborderait à droite.
 */
export function placeBelow(
  anchor: DOMRect,
  panel: { width: number; height: number },
  options: { anchorWidth?: boolean } = {},
): Position {
  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;
  const top =
    anchor.bottom + panel.height > windowHeight - MARGIN &&
    anchor.top - panel.height >= MARGIN
      ? anchor.top - panel.height
      : anchor.bottom;
  const width = Math.max(panel.width, options.anchorWidth ? anchor.width : 0);
  const left =
    anchor.left + width > windowWidth - MARGIN
      ? Math.max(MARGIN, anchor.right - width)
      : anchor.left;
  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: options.anchorWidth ? `${Math.round(anchor.width)}px` : undefined,
  };
}

/**
 * Tant que `ouvert` vaut vrai, un appui hors des éléments donnés referme le panneau, et un défilement ou un redimensionnement le replace.
 */
export function useOverlay(
  opened: Ref<boolean>,
  elements: () => readonly (HTMLElement | null | undefined)[],
  close: () => void,
  reposition: () => void,
): void {
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (elements().some((el) => el && target && el.contains(target))) return;
    close();
  };
  const onMove = () => reposition();

  const connect = () => {
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
  };
  const disconnect = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
  };

  watch(opened, (o) => (o ? connect() : disconnect()));
  onBeforeUnmount(disconnect);
}
