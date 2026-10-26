import { describe, expect, it } from "vitest";
import { InjectionToken, inject, provide, resetInjection } from "./injection";

class Compteur {
  valeur = 0;
}

class Utilisateur {
  readonly compteur = inject(Compteur);
}

describe("injection", () => {
  it("rend une seule instance par service", () => {
    expect(inject(Utilisateur).compteur).toBe(inject(Compteur));
  });

  it("rend la doublure fournie à la place du service", () => {
    const doublure = { valeur: 42 };
    provide(Compteur, doublure);
    expect(inject(Utilisateur).compteur.valeur).toBe(42);
  });

  it("repart d'un conteneur vide après réinitialisation", () => {
    const premier = inject(Compteur);
    resetInjection();
    expect(inject(Compteur)).not.toBe(premier);
  });

  it("emploie la fabrique d'un jeton, et refuse un jeton sans valeur", () => {
    expect(inject(new InjectionToken("avec", { factory: () => 3 }))).toBe(3);
    const sans = new InjectionToken<number>("sans");
    expect(() => inject(sans)).toThrow(/sans/);
    expect(inject(sans, { optional: true })).toBeNull();
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
