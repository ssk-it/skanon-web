import { inject } from "../injection";
import { signal } from "../signals";
import { SpecificationStore } from "../repo/specification.store";
import { TokenService, TemporaryAccess } from "./token.service";
import { IdentitySettings } from "../model/model";

/** What is kept between leaving for the issuer and coming back. */
const PENDING_KEY = "ssk-canon.identite.attente";

interface PendingSignIn {
  readonly verifier: string;
  readonly state: string;
  /** Where to come back once the identity is verified. */
  readonly returnPath: string;
}

function randomBytes(bytes = 32): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return base64url(raw);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const o of bytes) binary += String.fromCharCode(o);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Fingerprint of the one-time secret, as the issuer expects it.
 *
 * This is what lets an application without a secret have an identity verified
 * safely: only the fingerprint leaves with the request, and the secret
 * itself is only revealed at the moment of the exchange. An intercepted code is
 * therefore useless.
 */
async function fingerprint(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

export class SignInRefused extends Error {}

/**
 * Sign-in through a third-party identity.
 *
 * The author gets verified by the issuer the project declares, then
 * exchanges this identity for temporary access to the repo. They need
 * no account on the repo platform — that is the obstacle this mode removes.
 *
 * The application holds no secret: neither the issuer's, nor the
 * platform's. The exchange component holds the second, and that is why it
 * exists.
 */
export class IdentityService {
  private readonly store = inject(SpecificationStore);
  private readonly tokens = inject(TokenService);

  readonly inProgress = signal(false);
  readonly error = signal<string | null>(null);

  private settings(): IdentitySettings {
    const r = this.store.specification().settings.identity;
    if (!r) {
      throw new SignInRefused(
        "Ce projet ne déclare pas où vérifier les identités. Voir ses réglages.",
      );
    }
    return r;
  }

  /**
   * Leads the author to the identity issuer.
   *
   * The state and the one-time secret are kept in the session: the browser
   * leaves the page, and nothing that lives in memory survives the return.
   */
  async signIn(): Promise<void> {
    const r = this.settings();
    const verifier = randomBytes();
    const pending: PendingSignIn = {
      verifier,
      state: randomBytes(16),
      returnPath: location.pathname + location.search,
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    const params = new URLSearchParams({
      client_id: r.client,
      response_type: "code",
      scope: "openid profile email",
      redirect_uri: this.returnAddress(),
      state: pending.state,
      code_challenge: await fingerprint(verifier),
      code_challenge_method: "S256",
    });
    location.assign(`${r.issuer}/protocol/openid-connect/auth?${params}`);
  }

  /**
   * Completes the sign-in on return from the issuer, if there is one.
   *
   * Returns `true` if a return was handled — the caller then knows it must
   * clean up the address, which still carries the code.
   */
  async completeReturn(): Promise<boolean> {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!code || !raw) return false;

    sessionStorage.removeItem(PENDING_KEY);
    this.inProgress.set(true);
    this.error.set(null);

    try {
      const pending = JSON.parse(raw) as PendingSignIn;
      // The state ties this return to the request that produced it: without this check,
      // a code obtained elsewhere could be slipped into this session.
      if (params.get("state") !== pending.state) {
        throw new SignInRefused("La réponse ne correspond pas à la demande.");
      }

      const identityToken = await this.exchangeCode(code, pending.verifier);
      this.tokens.setAccess(await this.exchangeForAccess(identityToken));
      return true;
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : "La connexion n’a pas abouti.",
      );
      return true;
    } finally {
      this.inProgress.set(false);
    }
  }

  /** Exchanges the code for an identity token, revealing the one-time secret. */
  private async exchangeCode(code: string, verifier: string): Promise<string> {
    const r = this.settings();
    const response = await fetch(`${r.issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: r.client,
        code,
        redirect_uri: this.returnAddress(),
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      throw new SignInRefused("L’émetteur d’identité a refusé la connexion.");
    }
    const { access_token } = (await response.json()) as {
      access_token?: string;
    };
    if (!access_token)
      throw new SignInRefused("L’émetteur n’a rendu aucune identité.");
    return access_token;
  }

  /** Exchanges the verified identity for access to the repo. */
  private async exchangeForAccess(
    identityToken: string,
  ): Promise<TemporaryAccess> {
    const r = this.settings();
    const response = await fetch(`${r.exchange}/jeton`, {
      method: "POST",
      headers: { Authorization: `Bearer ${identityToken}` },
    });

    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      // The component's message names the cause — identity refused, no project
      // open — and is worth more than an error code.
      throw new SignInRefused(
        (body["erreur"] as string) ?? "L’accès au dépôt a été refusé.",
      );
    }
    return body as unknown as TemporaryAccess;
  }

  /**
   * Address the issuer sends back to.
   *
   * The root, not the current page: the issuer compares this address with those
   * it admits, and declaring one per page would be untenable.
   */
  private returnAddress(): string {
    return `${location.origin}/`;
  }
}
