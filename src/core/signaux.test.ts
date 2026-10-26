import { describe, expect, it } from "vitest";
import { computed, effect, linkedSignal, signal, untracked } from "./signaux";

describe("signaux", () => {
  it("se lisent par appel et se modifient par set et update", () => {
    const count = signal(1);
    count.set(2);
    count.update((n) => n + 1);
    expect(count()).toBe(3);
  });

  it("recalculent un dérivé quand sa source change", () => {
    const count = signal(2);
    const double = computed(() => count() * 2);
    expect(double()).toBe(4);
    count.set(5);
    expect(double()).toBe(10);
  });

  it("relancent un effet sur ce qu'il lit, non sur ce qu'il lit sans s'abonner", () => {
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

  it("gardent une valeur posée à la main jusqu'au prochain changement de la source", () => {
    const source = signal("brouillon");
    const status = linkedSignal(() => source());
    status.set("en_relecture");
    expect(status()).toBe("en_relecture");
    source.set("livree");
    expect(status()).toBe("livree");
  });

  it("passent la valeur précédente au calcul d'un signal lié", () => {
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
