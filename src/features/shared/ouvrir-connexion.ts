import { inject } from "../../core/injection";
import { DialogService } from "../../ui/dialog.service";

/**
 * Ouvre la connexion à GitHub, depuis la barre comme depuis l'accueil. Résout `true` quand l'accès a changé.
 *
 * Le dialogue est chargé à l'ouverture, non au démarrage : il porte la saisie du jeton, un poids que tout le monde paierait pour un bouton qu'on ne clique pas toujours. Il est plus large que les 560 px par défaut : l'aide à la création du jeton y tient un tableau des permissions, qu'un panneau étroit tasse.
 */
export async function ouvrirConnexion(): Promise<boolean> {
  const { default: TokenDialog } = await import("./TokenDialog.vue");
  const change = await inject(DialogService).open<boolean>(TokenDialog, {
    focus: "dialogue",
    largeur: "680px",
    largeurMax: "calc(100vw - 32px)",
  });
  return change === true;
}
