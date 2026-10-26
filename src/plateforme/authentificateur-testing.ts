import type { Authentificateur, PasskeyCreee } from "./web-scellement";

/**
 * Un authentificateur simulé : jsdom n'a pas WebAuthn. Comme une vraie passkey PRF, il rend pour une passkey et un sel donnés toujours les mêmes 32 octets, et d'autres pour une autre passkey.
 */
export class FauxAuthentificateur implements Authentificateur {
  possible = true;
  /** Ce que la prochaine création rendra : la sortie dès la création, plus tard, ou jamais. */
  prfALaCreation: "rendue" | "differee" | "absente" = "rendue";
  annuler = false;
  /** Fait rendre la sortie d'une autre passkey, comme un trousseau qui aurait changé. */
  substituer = false;
  readonly secrets = new Map<string, Uint8Array>();
  creations = 0;
  evaluations = 0;

  async isPossible(): Promise<boolean> {
    return this.possible;
  }

  async create(sel: Uint8Array): Promise<PasskeyCreee | null> {
    if (this.annuler) return null;
    this.creations++;
    const id = crypto.getRandomValues(new Uint8Array(16));
    this.secrets.set(cle(id), crypto.getRandomValues(new Uint8Array(32)));
    if (this.prfALaCreation === "absente")
      return { id, prf: null, prfActif: false };
    if (this.prfALaCreation === "differee")
      return { id, prf: null, prfActif: true };
    return { id, prf: await this.sortie(id, sel), prfActif: true };
  }

  async evaluate(id: Uint8Array, sel: Uint8Array): Promise<ArrayBuffer | null> {
    if (this.annuler || !this.secrets.has(cle(id))) return null;
    this.evaluations++;
    return this.sortie(id, sel);
  }

  private async sortie(id: Uint8Array, sel: Uint8Array): Promise<ArrayBuffer> {
    const secret = this.substituer
      ? new Uint8Array(32).fill(7)
      : (this.secrets.get(cle(id)) ?? new Uint8Array(32));
    return crypto.subtle.digest("SHA-256", new Uint8Array([...secret, ...sel]));
  }
}

function cle(id: Uint8Array): string {
  return [...id].join(",");
}
