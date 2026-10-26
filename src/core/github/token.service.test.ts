import { inject, resetInjection } from "../injection";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";

/**
 * L'environnement de test n'expose qu'un localStorage partiel — ce qui tombe
 * bien : le service doit fonctionner quand le stockage est indisponible, en
 * navigation privée par exemple. On le remplace par une implémentation en
 * mémoire pour contrôler l'état, et un cas vérifie explicitement le repli.
 */
function stubStorage(): Map<string, string> {
  const donnees = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
      removeItem: (k: string) => void donnees.delete(k),
      clear: () => donnees.clear(),
    },
  });
  return donnees;
}

describe("TokenService", () => {
  let service: TokenService;
  let stockage: Map<string, string>;

  beforeEach(() => {
    stockage = stubStorage();
    resetInjection();
    service = inject(TokenService);
  });

  it("démarre sans jeton", () => {
    expect(service.present()).toBe(false);
    expect(service.source()).toBe("aucune");
    expect(service.empreinte()).toBeNull();
  });

  it("conserve un jeton et n’en expose que les derniers caractères", () => {
    service.definir("ghp_abcdefghijklmnopqrst1234");
    expect(service.present()).toBe(true);
    expect(service.source()).toBe("personnel");
    // l'empreinte identifie le jeton sans le divulguer
    expect(service.empreinte()).toBe("…1234");
    expect(service.empreinte()).not.toContain("abcdefgh");
  });

  it("efface le jeton et le stockage", () => {
    service.definir("ghp_abcdefghijklmnopqrst1234");
    service.effacer();
    expect(service.present()).toBe(false);
    expect(stockage.has("ssk-canon.token")).toBe(false);
  });

  /** RG-acces-par-portee, RG-acces-temporaire : un jeton d'une seule organisation, ou un accès temporaire, est déjà un accès en place. */
  it("ne dit aucun accès en place que sans jeton, de quelque portée, ni accès temporaire", () => {
    expect(service.aucunAcces()).toBe(true);

    service.definirPourPortee("ssk-it", "ghp_abcdefghijklmnopqrst1234");
    service.cibler({ owner: "Wayne-Corp", repo: "wayne-devis-cadrage" });
    expect(service.present()).toBe(false);
    expect(service.aucunAcces()).toBe(false);

    service.effacer();
    service.definirAcces({
      jeton: "ghs_temporaire",
      valideJusqua: new Date(Date.now() + 3_600_000).toISOString(),
      depots: ["ssk-it/ssk-canon"],
      identite: { identifiant: "ssk", nom: "SSK", courriel: null },
    });
    expect(service.aucunAcces()).toBe(false);
  });

  it("ignore une saisie vide", () => {
    service.definir("   ");
    expect(service.present()).toBe(false);
  });

  it("fonctionne quand le stockage est indisponible", () => {
    // navigation privée, stockage bloqué : le jeton doit rester utilisable
    // pour la session plutôt que de faire échouer l'application
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("bloqué");
        },
        setItem: () => {
          throw new Error("bloqué");
        },
        removeItem: () => {
          throw new Error("bloqué");
        },
      },
    });
    resetInjection();
    const s = inject(TokenService);

    expect(() => s.definir("ghp_abcdefghijklmnopqrst1234")).not.toThrow();
    expect(s.present()).toBe(true);
    expect(() => s.effacer()).not.toThrow();
    expect(s.present()).toBe(false);
  });

  describe("un coffre qui refuse — RG-secret-conserve-localement", () => {
    function bloquer(): void {
      const refuser = () => {
        throw new Error("bloqué");
      };
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: refuser, setItem: refuser, removeItem: refuser },
      });
      resetInjection();
    }

    it("se tait quand le coffre garde le jeton", async () => {
      service.definir("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      expect(service.coffreRefuse()).toBeNull();
    });

    it("dit que le jeton ne vaut que pour la session", async () => {
      bloquer();
      const s = inject(TokenService);
      s.definir("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      expect(s.coffreRefuse()).toBe("ecriture");
      expect(s.present()).toBe(true);
    });

    it("dit qu’un jeton oublié reste dans le coffre", async () => {
      bloquer();
      const s = inject(TokenService);
      s.effacer();
      await flushPromises();
      expect(s.coffreRefuse()).toBe("effacement");
      expect(s.present()).toBe(false);
    });

    it("cesse de le dire quand le coffre accepte de nouveau", async () => {
      bloquer();
      const s = inject(TokenService);
      s.definir("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      stubStorage();
      s.definir("ghp_abcdefghijklmnopqrst5678");
      await flushPromises();
      expect(s.coffreRefuse()).toBeNull();
    });
  });

  describe("vérification de forme", () => {
    it("accepte les préfixes GitHub connus", () => {
      expect(TokenService.verifierForme("ghp_abcdefghijklmnopqrst")).toBeNull();
      expect(
        TokenService.verifierForme("github_pat_11ABCDEFG0abcdefghij"),
      ).toBeNull();
    });

    it("refuse ce qui ne ressemble pas à un jeton", () => {
      // erreur de saisie la plus fréquente : coller autre chose que le jeton
      expect(TokenService.verifierForme("mon-identifiant")).toContain("ghp_");
      expect(TokenService.verifierForme("")).toContain("Saisir");
      expect(TokenService.verifierForme("ghp_abc def")).toContain("espace");
      expect(TokenService.verifierForme("ghp_court")).toContain("incomplet");
    });
  });
});
