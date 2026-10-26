import { inject } from "../injection";
import { signal } from "../signaux";
import { SpecificationStore } from "../repo/referentiel.store";
import { TokenService, TemporaryAccess } from "./token.service";
import { IdentitySettings } from "../model/model";

/** Ce qu'on garde entre le départ vers l'émetteur et le retour. */
const PENDING_KEY = "ssk-canon.identite.attente";

interface PendingSignIn {
  readonly verifier: string;
  readonly state: string;
  /** Où revenir une fois l'identité vérifiée. */
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
 * Empreinte du secret jetable, telle que l'émetteur l'attend.
 *
 * C'est ce qui permet à une application sans secret de faire vérifier une
 * identité sans danger : seule l'empreinte part avec la demande, et le secret
 * lui-même n'est révélé qu'au moment de l'échange. Un code intercepté ne sert
 * donc à rien.
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
 * Connexion par identité tierce.
 *
 * Le rédacteur se fait vérifier auprès de l'émetteur que le projet déclare, puis
 * échange cette identité contre un accès temporaire au dépôt. Il n'a besoin
 * d'aucun compte sur la plateforme de dépôt — c'est l'obstacle que ce mode lève.
 *
 * L'application ne détient aucun secret : ni celui de l'émetteur, ni celui de la
 * plateforme. Le composant d'échange détient le second, et c'est pourquoi il
 * existe.
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
   * Conduit le rédacteur vers l'émetteur d'identité.
   *
   * L'état et le secret jetable sont conservés dans la session : le navigateur
   * quitte la page, et rien de ce qui vit en mémoire ne survit au retour.
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
   * Termine la connexion au retour de l'émetteur, s'il y a lieu.
   *
   * Rend `true` si un retour a été traité — l'appelant sait alors qu'il doit
   * nettoyer l'adresse, qui porte encore le code.
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
      // L'état lie ce retour à la demande qui l'a produit : sans ce contrôle,
      // un code obtenu ailleurs pourrait être glissé dans cette session.
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

  /** Échange le code contre un jeton d'identité, en révélant le secret jetable. */
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

  /** Échange l'identité vérifiée contre un accès au dépôt. */
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
      // Le message du composant nomme la cause — identité refusée, aucun projet
      // ouvert — et vaut mieux qu'un code d'erreur.
      throw new SignInRefused(
        (body["erreur"] as string) ?? "L’accès au dépôt a été refusé.",
      );
    }
    return body as unknown as TemporaryAccess;
  }

  /**
   * Adresse à laquelle l'émetteur renvoie.
   *
   * La racine, non la page courante : l'émetteur compare cette adresse à celles
   * qu'il admet, et en déclarer une par page serait intenable.
   */
  private returnAddress(): string {
    return `${location.origin}/`;
  }
}
