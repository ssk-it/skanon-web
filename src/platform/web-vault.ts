import type { TokenVault, VaultWrite, StoredTokens } from "./ports";

/**
 * The web version: the browser's local storage, in plain text. What that is worth is stated in RG-secret-conserve-localement: a token stored here can be read in the browser profile, hence the advice to grant only a least-privilege token.
 *
 * The keys are SSK Canon's: on the same hosting, Skanon finds the tokens already entered.
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
      // Blocked storage or corrupted content: start from nothing rather than make startup fail.
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
      // Blocked storage: the tokens are only valid for the session in memory, and the interface says so.
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
