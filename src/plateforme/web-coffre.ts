import type { TokenVault, VaultWrite, StoredTokens } from "./ports";

/**
 * La version web : le stockage local du navigateur, en clair. Ce que cela vaut est dit dans RG-secret-conserve-localement : un jeton posé ici se lit dans le profil du navigateur, d'où le conseil de n'accorder qu'un jeton de moindre privilège.
 *
 * Les clés sont celles de SSK Canon : sur un même hébergement, Skanon retrouve les jetons déjà saisis.
 */
const GENERAL_KEY = "ssk-canon.token";
const SCOPES_KEY = "ssk-canon.jetons";

export class BrowserVault implements TokenVault {
  async loadTokens(): Promise<StoredTokens> {
    try {
      const general = localStorage.getItem(GENERAL_KEY) || null;
      const raw = localStorage.getItem(SCOPES_KEY);
      return { general, byScope: toPairs(raw ? JSON.parse(raw) : []) };
    } catch {
      // Stockage bloqué ou contenu corrompu : repartir de rien plutôt que de faire échouer le démarrage.
      return { general: null, byScope: [] };
    }
  }

  async saveTokens(tokens: StoredTokens): Promise<VaultWrite> {
    try {
      if (tokens.general) localStorage.setItem(GENERAL_KEY, tokens.general);
      else localStorage.removeItem(GENERAL_KEY);
      if (tokens.byScope.length)
        localStorage.setItem(SCOPES_KEY, JSON.stringify(tokens.byScope));
      else localStorage.removeItem(SCOPES_KEY);
      return "faite";
    } catch {
      // Stockage bloqué : les jetons ne valent que pour la session en mémoire, et l'interface le dit.
      return "refusee";
    }
  }

  async deleteTokens(): Promise<VaultWrite> {
    try {
      localStorage.removeItem(GENERAL_KEY);
      localStorage.removeItem(SCOPES_KEY);
      return "faite";
    } catch {
      return "refusee";
    }
  }
}

export function toPairs(value: unknown): Array<[string, string]> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is [string, string] =>
      Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string",
  );
}
