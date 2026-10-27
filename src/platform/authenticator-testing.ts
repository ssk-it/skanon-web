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
  /** The times the browser's window asked to pick a passkey. */
  choices = 0;

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

  /** The user picks the site's passkey in the browser's window, and confirms with Touch ID. */
  async choose(salt: Uint8Array): Promise<ArrayBuffer | null> {
    const [id] = [...this.secrets.keys()];
    if (this.cancel || id === undefined) return null;
    this.choices++;
    return this.output(Uint8Array.from(id.split(","), Number), salt);
  }

  /** Whether the browser offers passkeys through autofill, and returns PRF that way. */
  conditionalPossible = true;
  /** The autofill request waiting for the user to pick a passkey, if there is one. */
  private offered: {
    readonly salt: Uint8Array;
    readonly answer: (output: ArrayBuffer | null) => void;
  } | null = null;

  async isConditionalPossible(): Promise<boolean> {
    return this.conditionalPossible;
  }

  evaluateConditional(
    salt: Uint8Array,
    signal: AbortSignal,
  ): Promise<ArrayBuffer | null> {
    return new Promise((answer) => {
      if (signal.aborted) return answer(null);
      this.offered = { salt, answer };
      signal.addEventListener("abort", () => {
        this.offered = null;
        answer(null);
      });
    });
  }

  /** True while the autofill offers a passkey. */
  get offering(): boolean {
    return this.offered !== null;
  }

  /** The user picks the passkey the autofill offers, and confirms with Touch ID. */
  async pick(): Promise<void> {
    const offered = this.offered;
    if (!offered) throw new Error("no passkey offered");
    this.offered = null;
    const [id] = [...this.secrets.keys()];
    offered.answer(
      this.cancel || id === undefined
        ? null
        : await this.output(
            Uint8Array.from(id.split(","), Number),
            offered.salt,
          ),
    );
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
