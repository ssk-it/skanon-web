import type { AnnonceVersion, AnnonceurDeVersion, Plateforme } from "./ports";
import {
  AuthentificateurDuNavigateur,
  CoffreScelleDuNavigateur,
} from "./web-scellement";

/** Le script du service worker de Skanon, émis par `outils/pwa/pwa.ts` dans la seule version web. */
export const SCRIPT_SERVICE_WORKER = "/sw.js";

/** Ce que le service worker dit à la page : un fichier de la version en cours n'est plus servi (`outils/pwa/sw.js`). */
export const MESSAGE_VERSION_PERDUE = "VERSION_PERDUE";

/** Ce que la page demande au service worker en attente : servir dès maintenant. */
export const MESSAGE_ACTIVER = "SKIP_WAITING";

/** Ce que l'on attend au plus le changement de service worker avant de recharger malgré tout. */
const DELAI_ACTIVATION = 3000;

/**
 * Les versions, apprises du service worker (RG-nouvelle-version-proposee, RG-version-perdue-signalee).
 *
 * Une version est prête quand un nouveau service worker a fini de s'installer — tout ce qu'il servira est alors en cache — et qu'un autre sert encore cette page : la première installation n'est pas une nouvelle version, et une version qui se télécharge encore n'est pas prête, puisque recharger servirait encore l'ancienne.
 *
 * Une annonce faite avant qu'on l'écoute — l'inscription précède le montage de la coquille — est rejouée à qui écoute ensuite.
 */
export class AnnonceurDuServiceWorker implements AnnonceurDeVersion {
  readonly actif: boolean;
  /** La version prête sert au rechargement de la page, non à une relance. */
  readonly relance = false;
  private readonly inscription: Promise<ServiceWorkerRegistration> | null;
  private readonly ecouteurs = new Set<(a: AnnonceVersion) => void>();
  private readonly faites = new Set<AnnonceVersion>();

  constructor(
    private readonly conteneur: ServiceWorkerContainer | undefined,
    private readonly script = SCRIPT_SERVICE_WORKER,
  ) {
    this.actif = !!conteneur;
    if (!conteneur) {
      this.inscription = null;
      return;
    }
    conteneur.addEventListener("message", (e: MessageEvent) => {
      if (
        (e.data as { type?: unknown } | null)?.type === MESSAGE_VERSION_PERDUE
      )
        this.annoncer("perdue");
    });
    this.inscription = apresChargement().then(() =>
      conteneur.register(script, { scope: "/", updateViaCache: "none" }),
    );
    this.inscription.then(
      (r) => this.suivre(r),
      // Inscription refusée — navigation privée, stockage bloqué : l'application marche sans, et sans hors-ligne.
      () => {},
    );
  }

  listen(surAnnonce: (a: AnnonceVersion) => void): () => void {
    this.ecouteurs.add(surAnnonce);
    for (const a of this.faites) surAnnonce(a);
    return () => this.ecouteurs.delete(surAnnonce);
  }

  /** Le service worker ne dit pas pourquoi il n'a rien trouvé : il n'y a rien à expliquer. */
  listenCause(): () => void {
    return () => {};
  }

  async check(): Promise<void> {
    const r = await this.inscription;
    await r?.update();
  }

  async activate(): Promise<void> {
    const conteneur = this.conteneur;
    const enAttente = (await this.inscription)?.waiting;
    if (!conteneur || !enAttente) return;
    const change = new Promise<void>((fin) => {
      conteneur.addEventListener("controllerchange", () => fin(), {
        once: true,
      });
      setTimeout(fin, DELAI_ACTIVATION);
    });
    enAttente.postMessage({ type: MESSAGE_ACTIVER });
    await change;
  }

  private suivre(r: ServiceWorkerRegistration): void {
    const surInstallation = (w: ServiceWorker | null) => {
      if (!w) return;
      const verifier = () => {
        if (w.state === "installed" && this.servieParSkanon())
          this.annoncer("prete");
      };
      verifier();
      w.addEventListener("statechange", verifier);
    };
    if (r.waiting && this.servieParSkanon()) this.annoncer("prete");
    surInstallation(r.installing);
    r.addEventListener("updatefound", () => surInstallation(r.installing));
  }

  /**
   * Vrai quand une version de Skanon sert déjà cette page. Sous le service worker de l'ancienne application, ou sans aucun, celui qui s'installe ne remplace pas une version de Skanon : il n'y a rien à proposer.
   */
  private servieParSkanon(): boolean {
    const actuel = this.conteneur?.controller?.scriptURL;
    return !!actuel && new URL(actuel).pathname === this.script;
  }

  private annoncer(a: AnnonceVersion): void {
    if (this.faites.has(a)) return;
    this.faites.add(a);
    for (const e of this.ecouteurs) e(a);
  }
}

/** L'inscription attend la fin du chargement : le préchargement ne dispute pas la bande passante à la première page. */
function apresChargement(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((fin) =>
    window.addEventListener("load", () => fin(), { once: true }),
  );
}

/**
 * Le service worker n'est inscrit que dans la version web construite : le serveur de développement n'en publie pas, les tests n'en ont pas, et l'application de bureau n'en a pas l'usage.
 */
function serviceWorkerDisponible(): ServiceWorkerContainer | undefined {
  if (
    import.meta.env.VITE_CIBLE !== "web" ||
    !import.meta.env.PROD ||
    typeof navigator === "undefined"
  )
    return undefined;
  return navigator.serviceWorker;
}

export function createPlateformeWeb(): Plateforme {
  // Un seul objet pour les deux ports : le scellement décide de ce que le coffre écrit.
  const coffre = new CoffreScelleDuNavigateur(
    new AuthentificateurDuNavigateur(),
  );
  return {
    cible: "web",
    coffre,
    scellement: coffre,
    ouvreur: {
      async open(url) {
        window.open(url, "_blank", "noopener");
      },
    },
    // La version web reçoit ses liens par l'adresse même (`/lien?…`) : rien à écouter.
    liens: { async listen() {} },
    version: new AnnonceurDuServiceWorker(serviceWorkerDisponible()),
    // Le site se redéploie à chaque fusion, sans numéro : le commit construit le désigne (`vite.config.ts`).
    loadVersion: async () => import.meta.env.VITE_VERSION,
  };
}
