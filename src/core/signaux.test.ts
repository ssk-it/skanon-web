import { describe, expect, it } from "vitest";
import { computed, effect, linkedSignal, signal, untracked } from "./signaux";

describe("signaux", () => {
  it("se lisent par appel et se modifient par set et update", () => {
    const compte = signal(1);
    compte.set(2);
    compte.update((n) => n + 1);
    expect(compte()).toBe(3);
  });

  it("recalculent un dérivé quand sa source change", () => {
    const compte = signal(2);
    const double = computed(() => compte() * 2);
    expect(double()).toBe(4);
    compte.set(5);
    expect(double()).toBe(10);
  });

  it("relancent un effet sur ce qu'il lit, non sur ce qu'il lit sans s'abonner", () => {
    const suivi = signal(0);
    const ignore = signal(0);
    const vus: number[] = [];
    const ref = effect(() => {
      vus.push(suivi() + untracked(() => ignore()));
    });
    ignore.set(10);
    suivi.set(1);
    ref.destroy();
    suivi.set(2);
    expect(vus).toEqual([0, 11]);
  });

  it("gardent une valeur posée à la main jusqu'au prochain changement de la source", () => {
    const source = signal("brouillon");
    const statut = linkedSignal(() => source());
    statut.set("en_relecture");
    expect(statut()).toBe("en_relecture");
    source.set("livree");
    expect(statut()).toBe("livree");
  });

  it("passent la valeur précédente au calcul d'un signal lié", () => {
    const source = signal(1);
    const lie = linkedSignal<number, string>({
      source: () => source(),
      computation: (s, precedent) => `${precedent?.value ?? "-"}>${s}`,
    });
    expect(lie()).toBe("->1");
    source.set(2);
    expect(lie()).toBe("->1>2");
  });
});
