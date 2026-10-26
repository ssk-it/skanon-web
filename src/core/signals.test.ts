import { describe, expect, it } from "vitest";
import { computed, effect, linkedSignal, signal, untracked } from "./signals";

describe("signals", () => {
  it("are read by call and modified by set and update", () => {
    const count = signal(1);
    count.set(2);
    count.update((n) => n + 1);
    expect(count()).toBe(3);
  });

  it("recompute a derived value when its source changes", () => {
    const count = signal(2);
    const double = computed(() => count() * 2);
    expect(double()).toBe(4);
    count.set(5);
    expect(double()).toBe(10);
  });

  it("rerun an effect on what it reads, not on what it reads without subscribing", () => {
    const tracked = signal(0);
    const ignore = signal(0);
    const seen: number[] = [];
    const ref = effect(() => {
      seen.push(tracked() + untracked(() => ignore()));
    });
    ignore.set(10);
    tracked.set(1);
    ref.destroy();
    tracked.set(2);
    expect(seen).toEqual([0, 11]);
  });

  it("keep a hand-set value until the next change of the source", () => {
    const source = signal("brouillon");
    const status = linkedSignal(() => source());
    status.set("en_relecture");
    expect(status()).toBe("en_relecture");
    source.set("livree");
    expect(status()).toBe("livree");
  });

  it("pass the previous value to a linked signal's computation", () => {
    const source = signal(1);
    const linked = linkedSignal<number, string>({
      source: () => source(),
      computation: (s, previous) => `${previous?.value ?? "-"}>${s}`,
    });
    expect(linked()).toBe("->1");
    source.set(2);
    expect(linked()).toBe("->1>2");
  });
});
