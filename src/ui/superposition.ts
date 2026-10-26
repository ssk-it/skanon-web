import { onBeforeUnmount, watch, type Ref } from "vue";

/**
 * Ce que partagent les panneaux du kit — liste de choix, autocomplétion, menu : ils se posent par-dessus la page, au plus près de ce qui les a ouverts, et se referment au clic dehors. C'est ce que la superposition du CDK faisait pour Material.
 *
 * Un panneau est téléporté dans `body`, en position fixe : posé dans le flux, un dialogue qui défile le rognerait.
 */

/** Au-dessus des dialogues (`z-index: 1000`), sous un diagramme agrandi (1200). */
export const Z_PANNEAU = 1100;

/** La marge qu'un panneau garde avec les bords de la fenêtre. */
const MARGE = 8;

export interface Position {
  readonly top: string;
  readonly left: string;
  readonly minWidth?: string;
}

/**
 * Pose un panneau sous son ancre, aligné à gauche — ou au-dessus quand il ne tient pas en dessous, et décalé vers la gauche quand il déborderait à droite.
 */
export function placerSous(
  ancre: DOMRect,
  panneau: { width: number; height: number },
  options: { largeurAncre?: boolean } = {},
): Position {
  const hauteurFenetre = window.innerHeight;
  const largeurFenetre = window.innerWidth;
  const top =
    ancre.bottom + panneau.height > hauteurFenetre - MARGE &&
    ancre.top - panneau.height >= MARGE
      ? ancre.top - panneau.height
      : ancre.bottom;
  const largeur = Math.max(
    panneau.width,
    options.largeurAncre ? ancre.width : 0,
  );
  const left =
    ancre.left + largeur > largeurFenetre - MARGE
      ? Math.max(MARGE, ancre.right - largeur)
      : ancre.left;
  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: options.largeurAncre ? `${Math.round(ancre.width)}px` : undefined,
  };
}

/**
 * Tant que `ouvert` vaut vrai, un appui hors des éléments donnés referme le panneau, et un défilement ou un redimensionnement le replace.
 */
export function useSuperposition(
  ouvert: Ref<boolean>,
  elements: () => readonly (HTMLElement | null | undefined)[],
  fermer: () => void,
  replacer: () => void,
): void {
  const surAppui = (e: PointerEvent) => {
    const cible = e.target as Node | null;
    if (elements().some((el) => el && cible && el.contains(cible))) return;
    fermer();
  };
  const surMouvement = () => replacer();

  const brancher = () => {
    document.addEventListener("pointerdown", surAppui, true);
    window.addEventListener("scroll", surMouvement, true);
    window.addEventListener("resize", surMouvement);
  };
  const debrancher = () => {
    document.removeEventListener("pointerdown", surAppui, true);
    window.removeEventListener("scroll", surMouvement, true);
    window.removeEventListener("resize", surMouvement);
  };

  watch(ouvert, (o) => (o ? brancher() : debrancher()));
  onBeforeUnmount(debrancher);
}
