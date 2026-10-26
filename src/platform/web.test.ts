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
 * A simulated service worker and its container: jsdom has none. Only what the announcer reads is there — a worker's state, the registration and its three slots, the container's events.
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

describe("ServiceWorkerAnnouncer", () => {
  it("is not active without a service worker", () => {
    expect(new ServiceWorkerAnnouncer(undefined).active).toBe(false);
  });

  it("registers Skanon's service worker over the whole application", async () => {
    const container = new FakeContainer();
    await create(container);
    expect(container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("does not announce the first installation", async () => {
    const container = new FakeContainer();
    container.registration.installing = new FakeWorker("installing");
    const { announcements: announcements } = await create(container);

    container.registration.installing.switchTo("installed");
    expect(announcements).toEqual([]);
  });

  it("announces a version already waiting at load", async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker("activated");
    container.registration.waiting = new FakeWorker("installed");
    const { announcements: announcements } = await create(container);
    expect(announcements).toEqual(["prete"]);
  });

  it("announces a found version only once installed", async () => {
    // a detected version is not downloaded yet: reloading would still serve the old one
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

  it("offers nothing under the former application's service worker", async () => {
    // the handover: Skanon installs itself in place of SSK Canon, it is not a new version of Skanon
    const container = new FakeContainer();
    container.controller = new FakeWorker(
      "activated",
      "http://localhost:3000/ngsw-worker.js",
    );
    container.registration.waiting = new FakeWorker("installed");
    const { announcements: announcements } = await create(container);
    expect(announcements).toEqual([]);
  });

  it("replays an announcement made before anyone listens", async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker("activated");
    container.registration.waiting = new FakeWorker("installed");
    const { announcer: announcer } = await create(container);

    const late: VersionAnnouncement[] = [];
    announcer.listen((a) => late.push(a));
    expect(late).toEqual(["prete"]);
  });

  it("announces a lost version when the service worker says so", async () => {
    const container = new FakeContainer();
    const { announcements: announcements } = await create(container);

    container.dispatchEvent(
      new MessageEvent("message", { data: { type: VERSION_LOST_MESSAGE } }),
    );
    expect(announcements).toEqual(["perdue"]);
  });

  it("ignores other messages", async () => {
    const container = new FakeContainer();
    const { announcements: announcements } = await create(container);
    container.dispatchEvent(new MessageEvent("message", { data: "bonjour" }));
    expect(announcements).toEqual([]);
  });

  it("checks by asking for the registration's update", async () => {
    const container = new FakeContainer();
    const { announcer: announcer } = await create(container);
    await announcer.check();
    expect(container.registration.update).toHaveBeenCalledOnce();
  });

  it("activates the waiting version, and waits for it to serve", async () => {
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

  it("does not hold back the reload if the change does not come", async () => {
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

describe("the web version", () => {
  // The site is redeployed on every merge, without a tag (its deployment lives in the private repository): the built commit is what designates it.
  it("is the commit recorded at build", async () => {
    const version = await createWebPlatform().loadVersion();
    expect(version).toBe(import.meta.env.VITE_VERSION);
    expect(version).toMatch(/^([0-9a-f]{7}|développement)$/);
  });
});
