import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AnnonceVersion } from "./ports";
import {
  AnnonceurDuServiceWorker,
  createPlateformeWeb,
  MESSAGE_ACTIVER,
  MESSAGE_VERSION_PERDUE,
} from "./web";

/**
 * Un service worker et son conteneur simulés : jsdom n'en a pas. Seul ce que l'annonceur lit y figure — l'état d'un worker, l'inscription et ses trois places, les événements du conteneur.
 */
class FauxWorker extends EventTarget {
  readonly postMessage = vi.fn();
  constructor(
    public state: ServiceWorkerState,
    readonly scriptURL = "http://localhost:3000/sw.js",
  ) {
    super();
  }

  passerA(etat: ServiceWorkerState): void {
    this.state = etat;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FausseInscription extends EventTarget {
  installing: FauxWorker | null = null;
  waiting: FauxWorker | null = null;
  readonly update = vi.fn(() => Promise.resolve());
}

class FauxConteneur extends EventTarget {
  controller: FauxWorker | null = null;
  readonly inscription = new FausseInscription();
  readonly register = vi.fn(() => Promise.resolve(this.inscription));
}

async function creer(conteneur: FauxConteneur) {
  const annonceur = new AnnonceurDuServiceWorker(
    conteneur as unknown as ServiceWorkerContainer,
  );
  const annonces: AnnonceVersion[] = [];
  annonceur.listen((a) => annonces.push(a));
  await flushPromises();
  return { annonceur, annonces };
}

describe("AnnonceurDuServiceWorker", () => {
  it("n’est pas actif sans service worker", () => {
    expect(new AnnonceurDuServiceWorker(undefined).actif).toBe(false);
  });

  it("inscrit le service worker de Skanon sur toute l’application", async () => {
    const conteneur = new FauxConteneur();
    await creer(conteneur);
    expect(conteneur.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("n’annonce pas la première installation", async () => {
    const conteneur = new FauxConteneur();
    conteneur.inscription.installing = new FauxWorker("installing");
    const { annonces } = await creer(conteneur);

    conteneur.inscription.installing.passerA("installed");
    expect(annonces).toEqual([]);
  });

  it("annonce une version déjà en attente au chargement", async () => {
    const conteneur = new FauxConteneur();
    conteneur.controller = new FauxWorker("activated");
    conteneur.inscription.waiting = new FauxWorker("installed");
    const { annonces } = await creer(conteneur);
    expect(annonces).toEqual(["prete"]);
  });

  it("n’annonce une version trouvée qu’une fois installée", async () => {
    // une version détectée n'est pas encore téléchargée : recharger servirait encore l'ancienne
    const conteneur = new FauxConteneur();
    conteneur.controller = new FauxWorker("activated");
    const { annonces } = await creer(conteneur);

    const nouveau = new FauxWorker("installing");
    conteneur.inscription.installing = nouveau;
    conteneur.inscription.dispatchEvent(new Event("updatefound"));
    expect(annonces).toEqual([]);

    nouveau.passerA("installed");
    expect(annonces).toEqual(["prete"]);
  });

  it("ne propose rien sous le service worker de l’ancienne application", async () => {
    // la relève : Skanon s'installe à la place de SSK Canon, ce n'est pas une nouvelle version de Skanon
    const conteneur = new FauxConteneur();
    conteneur.controller = new FauxWorker(
      "activated",
      "http://localhost:3000/ngsw-worker.js",
    );
    conteneur.inscription.waiting = new FauxWorker("installed");
    const { annonces } = await creer(conteneur);
    expect(annonces).toEqual([]);
  });

  it("rejoue une annonce faite avant qu’on l’écoute", async () => {
    const conteneur = new FauxConteneur();
    conteneur.controller = new FauxWorker("activated");
    conteneur.inscription.waiting = new FauxWorker("installed");
    const { annonceur } = await creer(conteneur);

    const tardives: AnnonceVersion[] = [];
    annonceur.listen((a) => tardives.push(a));
    expect(tardives).toEqual(["prete"]);
  });

  it("annonce une version perdue quand le service worker le dit", async () => {
    const conteneur = new FauxConteneur();
    const { annonces } = await creer(conteneur);

    conteneur.dispatchEvent(
      new MessageEvent("message", { data: { type: MESSAGE_VERSION_PERDUE } }),
    );
    expect(annonces).toEqual(["perdue"]);
  });

  it("ignore les autres messages", async () => {
    const conteneur = new FauxConteneur();
    const { annonces } = await creer(conteneur);
    conteneur.dispatchEvent(new MessageEvent("message", { data: "bonjour" }));
    expect(annonces).toEqual([]);
  });

  it("vérifie en demandant la mise à jour de l’inscription", async () => {
    const conteneur = new FauxConteneur();
    const { annonceur } = await creer(conteneur);
    await annonceur.check();
    expect(conteneur.inscription.update).toHaveBeenCalledOnce();
  });

  it("active la version en attente, et attend qu’elle serve", async () => {
    const conteneur = new FauxConteneur();
    conteneur.controller = new FauxWorker("activated");
    const enAttente = new FauxWorker("installed");
    conteneur.inscription.waiting = enAttente;
    const { annonceur } = await creer(conteneur);

    let fini = false;
    const activation = annonceur.activate().then(() => (fini = true));
    await flushPromises();
    expect(enAttente.postMessage).toHaveBeenCalledWith({
      type: MESSAGE_ACTIVER,
    });
    expect(fini).toBe(false);

    conteneur.dispatchEvent(new Event("controllerchange"));
    await activation;
    expect(fini).toBe(true);
  });

  it("ne retient pas le rechargement si le changement ne vient pas", async () => {
    const conteneur = new FauxConteneur();
    conteneur.inscription.waiting = new FauxWorker("installed");
    const { annonceur } = await creer(conteneur);
    vi.useFakeTimers();
    try {
      const activation = annonceur.activate();
      await vi.advanceTimersByTimeAsync(3000);
      await expect(activation).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("la version web", () => {
  // Le site se redéploie à chaque fusion, sans étiquette (docs/deploiement.md) : c'est le commit construit qui la désigne.
  it("est le commit inscrit au build", async () => {
    const version = await createPlateformeWeb().loadVersion();
    expect(version).toBe(import.meta.env.VITE_VERSION);
    expect(version).toMatch(/^([0-9a-f]{7}|développement)$/);
  });
});
