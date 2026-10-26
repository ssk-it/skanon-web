import { onBeforeUnmount, watch, type Ref } from "vue";

/**
 * What the kit's panels share — select, autocomplete, menu: they sit over the page, as close as possible to what opened them, and close on an outside click. This is what the CDK overlay did for Material.
 *
 * A panel is teleported into `body`, in fixed position: placed in the flow, a scrolling dialog would clip it.
 */

/** Above dialogs (`z-index: 1000`), below an enlarged diagram (1200). */
export const Z_PANEL = 1100;

/** The margin a panel keeps from the window edges. */
const MARGIN = 8;

export interface Position {
  readonly top: string;
  readonly left: string;
  readonly minWidth?: string;
}

/**
 * Places a panel below its anchor, left-aligned — or above when it does not fit below, and shifted to the left when it would overflow on the right.
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
 * While `opened` is true, a press outside the given elements closes the panel, and a scroll or a resize repositions it.
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
