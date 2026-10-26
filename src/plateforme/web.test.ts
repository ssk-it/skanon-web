import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { VersionAnnouncement } from "./ports";
import {
  ServiceWorkerAnnouncer,
  createWebPlatform,
  ACTIVATE_MESSAGE,
  VERSION_LOST_MESSAGE,
} from "./web";

/**
 * Un service worker et son conteneur simulés : jsdom n'en a pas. Seul ce que l'annonceur lit y figure — l'état d'un worker, l'inscription et ses trois places, les événements du conteneur.
 */
class FakeWorker extends EventTarget {
  readonly postMessage = vi.fn();
  constructor(
    public state: ServiceWorkerState,
    readonly scriptURL = "http://localhost:3000/sw.js",
  ) {
    super();
  }

  switchTo(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  readonly update = vi.fn(() => Promise.resolve());
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  readonly registration = new FakeRegistration();
  readonly register = vi.fn(() => Promise.resolve(this.registration));
}

async function create(container: FakeContainer) {
  const announcer = new ServiceWorkerAnnouncer(
    container as unknown as ServiceWorkerContainer,
  );
  const announcements: VersionAnnouncement[] = [];
  announcer.listen((a) => announcements.push(a));
  await flushPromises();
  return { announcer: announcer, announcements: announcements };
}

describe("AnnonceurDuServiceWorker", () => {
  it("n’est pas actif sans service worker", () => {
    expect(new ServiceWorkerAnnouncer(undefined).active).toBe(false);
  });

  it("inscrit le service worker de Skanon sur toute l’application", async () => {
    const container = new FakeContainer();
    await create(container);
    expect(container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("n’annonce pas la première installation", async () => {
    const container = new FakeContainer();
    container.registration.installing = new FakeWorker("installing");
    const { announcements: announcements } = await create(container);

    container.registration.installing.switchTo("installed");
    expect(announcements).toEqual([]);
  });

  it("annonce une version déjà en attente au chargement", async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker("activated");
    container.registration.waiting = new FakeWorker("installed");
    const { announcements: announcements } = await create(container);
    expect(announcements).toEqual(["prete"]);
  });

  it("n’annonce une version trouvée qu’une fois installée", async () => {
    // une version détectée n'est pas encore téléchargée : recharger servirait encore l'ancienne
    const container = new FakeContainer();
    container.controller = new FakeWorker("activated");
    const { announcements: announcements } = await create(container);

    const next = new FakeWorker("installing");
    container.registration.installing = next;
    container.registration.dispatchEvent(new Event("updatefound"));
    expect(announcements).toEqual([]);

    next.switchTo("installed");
    expect(announcements).toEqual(["prete"]);
  });

  it("ne propose rien sous le service worker de l’ancienne application", async () => {
    // la relève : Skanon s'installe à la place de SSK Canon, ce n'est pas une nouvelle version de Skanon
    const container = new FakeContainer();
    container.controller = new FakeWorker(
      "activated",
      "http://localhost:3000/ngsw-worker.js",
    );
    container.registration.waiting = new FakeWorker("installed");
    const { announcements: announcements } = await create(container);
    expect(announcements).toEqual([]);
  });

  it("rejoue une annonce faite avant qu’on l’écoute", async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker("activated");
    container.registration.waiting = new FakeWorker("installed");
    const { announcer: announcer } = await create(container);

    const late: VersionAnnouncement[] = [];
    announcer.listen((a) => late.push(a));
    expect(late).toEqual(["prete"]);
  });

  it("annonce une version perdue quand le service worker le dit", async () => {
    const container = new FakeContainer();
    const { announcements: announcements } = await create(container);

    container.dispatchEvent(
      new MessageEvent("message", { data: { type: VERSION_LOST_MESSAGE } }),
    );
    expect(announcements).toEqual(["perdue"]);
  });

  it("ignore les autres messages", async () => {
    const container = new FakeContainer();
    const { announcements: announcements } = await create(container);
    container.dispatchEvent(new MessageEvent("message", { data: "bonjour" }));
    expect(announcements).toEqual([]);
  });

  it("vérifie en demandant la mise à jour de l’inscription", async () => {
    const container = new FakeContainer();
    const { announcer: announcer } = await create(container);
    await announcer.check();
    expect(container.registration.update).toHaveBeenCalledOnce();
  });

  it("active la version en attente, et attend qu’elle serve", async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker("activated");
    const waiting = new FakeWorker("installed");
    container.registration.waiting = waiting;
    const { announcer: announcer } = await create(container);

    let finished = false;
    const activation = announcer.activate().then(() => (finished = true));
    await flushPromises();
    expect(waiting.postMessage).toHaveBeenCalledWith({
      type: ACTIVATE_MESSAGE,
    });
    expect(finished).toBe(false);

    container.dispatchEvent(new Event("controllerchange"));
    await activation;
    expect(finished).toBe(true);
  });

  it("ne retient pas le rechargement si le changement ne vient pas", async () => {
    const container = new FakeContainer();
    container.registration.waiting = new FakeWorker("installed");
    const { announcer: announcer } = await create(container);
    vi.useFakeTimers();
    try {
      const activation = announcer.activate();
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
    const version = await createWebPlatform().loadVersion();
    expect(version).toBe(import.meta.env.VITE_VERSION);
    expect(version).toMatch(/^([0-9a-f]{7}|développement)$/);
  });
});
