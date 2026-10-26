import type { Authenticator, CreatedPasskey } from "./web-sealing";

/**
 * Un authentificateur simulé : jsdom n'a pas WebAuthn. Comme une vraie passkey PRF, il rend pour une passkey et un sel donnés toujours les mêmes 32 octets, et d'autres pour une autre passkey.
 */
export class FakeAuthenticator implements Authenticator {
  possible = true;
  /** Ce que la prochaine création rendra : la sortie dès la création, plus tard, ou jamais. */
  prfAtCreation: "rendue" | "differee" | "absente" = "rendue";
  cancel = false;
  /** Fait rendre la sortie d'une autre passkey, comme un trousseau qui aurait changé. */
  substitute = false;
  readonly secrets = new Map<string, Uint8Array>();
  creations = 0;
  evaluations = 0;

  async isPossible(): Promise<boolean> {
    return this.possible;
  }

  async create(salt: Uint8Array): Promise<CreatedPasskey | null> {
    if (this.cancel) return null;
    this.creations++;
    const id = crypto.getRandomValues(new Uint8Array(16));
    this.secrets.set(key(id), crypto.getRandomValues(new Uint8Array(32)));
    if (this.prfAtCreation === "absente")
      return { id, prf: null, prfEnabled: false };
    if (this.prfAtCreation === "differee")
      return { id, prf: null, prfEnabled: true };
    return { id, prf: await this.output(id, salt), prfEnabled: true };
  }

  async evaluate(
    id: Uint8Array,
    salt: Uint8Array,
  ): Promise<ArrayBuffer | null> {
    if (this.cancel || !this.secrets.has(key(id))) return null;
    this.evaluations++;
    return this.output(id, salt);
  }

  private async output(id: Uint8Array, salt: Uint8Array): Promise<ArrayBuffer> {
    const secret = this.substitute
      ? new Uint8Array(32).fill(7)
      : (this.secrets.get(key(id)) ?? new Uint8Array(32));
    return crypto.subtle.digest(
      "SHA-256",
      new Uint8Array([...secret, ...salt]),
    );
  }
}

function key(id: Uint8Array): string {
  return [...id].join(",");
}
