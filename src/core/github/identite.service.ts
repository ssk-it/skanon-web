import { inject } from "../injection";
import { signal } from "../signaux";
import { ReferentielStore } from "../repo/referentiel.store";
import { TokenService, AccesTemporaire } from "./token.service";
import { ReglagesIdentite } from "../model/model";

/** Ce qu'on garde entre le départ vers l'émetteur et le retour. */
const CLE_ATTENTE = "ssk-canon.identite.attente";

interface Attente {
  readonly verificateur: string;
  readonly etat: string;
  /** Où revenir une fois l'identité vérifiée. */
  readonly retour: string;
}

function alea(octets = 32): string {
  const brut = new Uint8Array(octets);
  crypto.getRandomValues(brut);
  return base64url(brut);
}

function base64url(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire)
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
async function empreinte(verificateur: string): Promise<string> {
  const condensat = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verificateur),
  );
  return base64url(new Uint8Array(condensat));
}

export class ConnexionRefusee extends Error {}

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
export class IdentiteService {
  private readonly store = inject(ReferentielStore);
  private readonly tokens = inject(TokenService);

  readonly enCours = signal(false);
  readonly erreur = signal<string | null>(null);

  private reglages(): ReglagesIdentite {
    const r = this.store.referentiel().reglages.identite;
    if (!r) {
      throw new ConnexionRefusee(
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
  async connecter(): Promise<void> {
    const r = this.reglages();
    const verificateur = alea();
    const attente: Attente = {
      verificateur,
      etat: alea(16),
      retour: location.pathname + location.search,
    };
    sessionStorage.setItem(CLE_ATTENTE, JSON.stringify(attente));

    const params = new URLSearchParams({
      client_id: r.client,
      response_type: "code",
      scope: "openid profile email",
      redirect_uri: this.adresseRetour(),
      state: attente.etat,
      code_challenge: await empreinte(verificateur),
      code_challenge_method: "S256",
    });
    location.assign(`${r.emetteur}/protocol/openid-connect/auth?${params}`);
  }

  /**
   * Termine la connexion au retour de l'émetteur, s'il y a lieu.
   *
   * Rend `true` si un retour a été traité — l'appelant sait alors qu'il doit
   * nettoyer l'adresse, qui porte encore le code.
   */
  async terminerRetour(): Promise<boolean> {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const brut = sessionStorage.getItem(CLE_ATTENTE);
    if (!code || !brut) return false;

    sessionStorage.removeItem(CLE_ATTENTE);
    this.enCours.set(true);
    this.erreur.set(null);

    try {
      const attente = JSON.parse(brut) as Attente;
      // L'état lie ce retour à la demande qui l'a produit : sans ce contrôle,
      // un code obtenu ailleurs pourrait être glissé dans cette session.
      if (params.get("state") !== attente.etat) {
        throw new ConnexionRefusee(
          "La réponse ne correspond pas à la demande.",
        );
      }

      const jetonIdentite = await this.echangerCode(code, attente.verificateur);
      this.tokens.definirAcces(await this.echangerContreAcces(jetonIdentite));
      return true;
    } catch (e) {
      this.erreur.set(
        e instanceof Error ? e.message : "La connexion n’a pas abouti.",
      );
      return true;
    } finally {
      this.enCours.set(false);
    }
  }

  /** Échange le code contre un jeton d'identité, en révélant le secret jetable. */
  private async echangerCode(
    code: string,
    verificateur: string,
  ): Promise<string> {
    const r = this.reglages();
    const reponse = await fetch(`${r.emetteur}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: r.client,
        code,
        redirect_uri: this.adresseRetour(),
        code_verifier: verificateur,
      }),
    });

    if (!reponse.ok) {
      throw new ConnexionRefusee(
        "L’émetteur d’identité a refusé la connexion.",
      );
    }
    const { access_token } = (await reponse.json()) as {
      access_token?: string;
    };
    if (!access_token)
      throw new ConnexionRefusee("L’émetteur n’a rendu aucune identité.");
    return access_token;
  }

  /** Échange l'identité vérifiée contre un accès au dépôt. */
  private async echangerContreAcces(
    jetonIdentite: string,
  ): Promise<AccesTemporaire> {
    const r = this.reglages();
    const reponse = await fetch(`${r.echange}/jeton`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jetonIdentite}` },
    });

    const corps = (await reponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!reponse.ok) {
      // Le message du composant nomme la cause — identité refusée, aucun projet
      // ouvert — et vaut mieux qu'un code d'erreur.
      throw new ConnexionRefusee(
        (corps["erreur"] as string) ?? "L’accès au dépôt a été refusé.",
      );
    }
    return corps as unknown as AccesTemporaire;
  }

  /**
   * Adresse à laquelle l'émetteur renvoie.
   *
   * La racine, non la page courante : l'émetteur compare cette adresse à celles
   * qu'il admet, et en déclarer une par page serait intenable.
   */
  private adresseRetour(): string {
    return `${location.origin}/`;
  }
}
