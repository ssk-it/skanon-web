import { afterEach } from "vitest";
import { resetInjection } from "./core/injection";

// Chaque test repart d'un conteneur vide, comme le faisait `TestBed.resetTestingModule`.
afterEach(() => {
  resetInjection();
  // Un test peut avoir remplacé le stockage par un stockage qui refuse tout : le refus est son objet, non une erreur du nettoyage.
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      storage.clear();
    } catch {
      /* stockage factice d'un test */
    }
  }
});

// jsdom ne met rien en page et n'implémente pas `scrollTo`, que le défilement du routeur appelle à chaque navigation (`src/routeur.ts`) : sans cette doublure, chaque test de page routée l'écrit sur la console.
window.scrollTo = () => {};
