import type { KeyChannel, KeyMessage } from "./web-sealing";

/**
 * Tabs of the same origin, simulated: each endpoint is one tab's `BroadcastChannel`, and, like it, never receives what it posts itself. Delivery is asynchronous, as between real tabs.
 */
export class FakeKeyHub {
  private readonly endpoints = new Set<FakeKeyChannel>();

  /** A new tab's endpoint. */
  open(): FakeKeyChannel {
    const endpoint = new FakeKeyChannel(this);
    this.endpoints.add(endpoint);
    return endpoint;
  }

  /** The tab is closed: it no longer answers. */
  close(endpoint: FakeKeyChannel): void {
    this.endpoints.delete(endpoint);
  }

  deliver(from: FakeKeyChannel, message: KeyMessage): void {
    for (const endpoint of this.endpoints)
      if (endpoint !== from) setTimeout(() => endpoint.receive(message), 0);
  }
}

export class FakeKeyChannel implements KeyChannel {
  private readonly listeners: ((message: KeyMessage) => void)[] = [];

  constructor(private readonly hub: FakeKeyHub) {}

  post(message: KeyMessage): void {
    this.hub.deliver(this, message);
  }

  listen(onMessage: (message: KeyMessage) => void): void {
    this.listeners.push(onMessage);
  }

  receive(message: KeyMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}
