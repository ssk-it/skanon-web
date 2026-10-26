import { describe, expect, it } from "vitest";
import "@fontsource/roboto/400.css";
import "@fontsource/material-symbols-outlined/400.css";

/**
 * Les polices sont embarquées, non demandées à un service : la politique de sécurité du contenu de l'application de bureau refuse tout autre hôte, et l'application doit s'afficher hors ligne. Un fichier de police que le serveur refuse — le magasin global de pnpm mène hors du dépôt (docs/developpement.md) — ne lève aucune erreur : les icônes s'affichent alors en toutes lettres. Seul un vrai moteur le voit.
 */
describe("polices embarquées", () => {
  it.each([["Roboto"], ["Material Symbols Outlined"]])(
    "charge %s",
    async (family) => {
      const loaded = await document.fonts.load(`24px "${family}"`, "a");
      expect(loaded.length).toBeGreaterThan(0);
      expect(document.fonts.check(`24px "${family}"`, "a")).toBe(true);
    },
  );
});
