import type { CoffreDeJetons, EcritureCoffre, JetonsStockes } from "./ports";

/**
 * La version web : le stockage local du navigateur, en clair. Ce que cela vaut est dit dans RG-secret-conserve-localement : un jeton posé ici se lit dans le profil du navigateur, d'où le conseil de n'accorder qu'un jeton de moindre privilège.
 *
 * Les clés sont celles de SSK Canon : sur un même hébergement, Skanon retrouve les jetons déjà saisis.
 */
const CLE_GENERAL = "ssk-canon.token";
const CLE_PORTEES = "ssk-canon.jetons";

export class CoffreDuNavigateur implements CoffreDeJetons {
  async loadJetons(): Promise<JetonsStockes> {
    try {
      const general = localStorage.getItem(CLE_GENERAL) || null;
      const brut = localStorage.getItem(CLE_PORTEES);
      return { general, parPortee: toPaires(brut ? JSON.parse(brut) : []) };
    } catch {
      // Stockage bloqué ou contenu corrompu : repartir de rien plutôt que de faire échouer le démarrage.
      return { general: null, parPortee: [] };
    }
  }

  async saveJetons(jetons: JetonsStockes): Promise<EcritureCoffre> {
    try {
      if (jetons.general) localStorage.setItem(CLE_GENERAL, jetons.general);
      else localStorage.removeItem(CLE_GENERAL);
      if (jetons.parPortee.length)
        localStorage.setItem(CLE_PORTEES, JSON.stringify(jetons.parPortee));
      else localStorage.removeItem(CLE_PORTEES);
      return "faite";
    } catch {
      // Stockage bloqué : les jetons ne valent que pour la session en mémoire, et l'interface le dit.
      return "refusee";
    }
  }

  async deleteJetons(): Promise<EcritureCoffre> {
    try {
      localStorage.removeItem(CLE_GENERAL);
      localStorage.removeItem(CLE_PORTEES);
      return "faite";
    } catch {
      return "refusee";
    }
  }
}

export function toPaires(valeur: unknown): Array<[string, string]> {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter(
    (p): p is [string, string] =>
      Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string",
  );
}
