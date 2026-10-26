import { describe, expect, it } from "vitest";
import { InjectionToken, inject, provide, resetInjection } from "./injection";

class Counter {
  value = 0;
}

class Consumer {
  readonly counter = inject(Counter);
}

describe("injection", () => {
  it("rend une seule instance par service", () => {
    expect(inject(Consumer).counter).toBe(inject(Counter));
  });

  it("rend la doublure fournie à la place du service", () => {
    const fake = { value: 42 };
    provide(Counter, fake);
    expect(inject(Consumer).counter.value).toBe(42);
  });

  it("repart d'un conteneur vide après réinitialisation", () => {
    const first = inject(Counter);
    resetInjection();
    expect(inject(Counter)).not.toBe(first);
  });

  it("emploie la fabrique d'un jeton, et refuse un jeton sans valeur", () => {
    expect(inject(new InjectionToken("avec", { factory: () => 3 }))).toBe(3);
    const without = new InjectionToken<number>("sans");
    expect(() => inject(without)).toThrow(/sans/);
    expect(inject(without, { optional: true })).toBeNull();
  });

  it("signale une dépendance circulaire plutôt que de déborder la pile", () => {
    class A {
      readonly b: unknown = inject(B);
    }
    class B {
      readonly a = inject(A);
    }
    expect(() => inject(A)).toThrow(/circulaire/);
  });
});
