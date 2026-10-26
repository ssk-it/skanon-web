import type { Authenticator, CreatedPasskey } from "./web-sealing";

/**
 * A simulated authenticator: jsdom has no WebAuthn. Like a real PRF passkey, for a given passkey and salt it always returns the same 32 bytes, and different ones for another passkey.
 */
export class FakeAuthenticator implements Authenticator {
  possible = true;
  /** What the next creation will return: the output at creation, later, or never. */
  prfAtCreation: "rendue" | "differee" | "absente" = "rendue";
  cancel = false;
  /** Makes it return another passkey's output, like a keychain that has changed. */
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
