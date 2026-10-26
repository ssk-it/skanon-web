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
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    },
  });
  return data;
}

describe("TokenService", () => {
  let service: TokenService;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = stubStorage();
    resetInjection();
    service = inject(TokenService);
  });

  it("démarre sans jeton", () => {
    expect(service.present()).toBe(false);
    expect(service.source()).toBe("aucune");
    expect(service.fingerprint()).toBeNull();
  });

  it("conserve un jeton et n’en expose que les derniers caractères", () => {
    service.set("ghp_abcdefghijklmnopqrst1234");
    expect(service.present()).toBe(true);
    expect(service.source()).toBe("personnel");
    // l'empreinte identifie le jeton sans le divulguer
    expect(service.fingerprint()).toBe("…1234");
    expect(service.fingerprint()).not.toContain("abcdefgh");
  });

  it("efface le jeton et le stockage", () => {
    service.set("ghp_abcdefghijklmnopqrst1234");
    service.erase();
    expect(service.present()).toBe(false);
    expect(storage.has("ssk-canon.token")).toBe(false);
  });

  /** RG-acces-par-portee, RG-acces-temporaire : un jeton d'une seule organisation, ou un accès temporaire, est déjà un accès en place. */
  it("ne dit aucun accès en place que sans jeton, de quelque portée, ni accès temporaire", () => {
    expect(service.noAccess()).toBe(true);

    service.setForScope("ssk-it", "ghp_abcdefghijklmnopqrst1234");
    service.targetRepo({ owner: "Wayne-Corp", repo: "wayne-devis-cadrage" });
    expect(service.present()).toBe(false);
    expect(service.noAccess()).toBe(false);

    service.erase();
    service.setAccess({
      token: "ghs_temporaire",
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      repos: ["ssk-it/ssk-canon"],
      identity: { identifier: "ssk", name: "SSK", email: null },
    });
    expect(service.noAccess()).toBe(false);
  });

  it("ignore une saisie vide", () => {
    service.set("   ");
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

    expect(() => s.set("ghp_abcdefghijklmnopqrst1234")).not.toThrow();
    expect(s.present()).toBe(true);
    expect(() => s.erase()).not.toThrow();
    expect(s.present()).toBe(false);
  });

  describe("un coffre qui refuse — RG-secret-conserve-localement", () => {
    function block(): void {
      const deny = () => {
        throw new Error("bloqué");
      };
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: deny, setItem: deny, removeItem: deny },
      });
      resetInjection();
    }

    it("se tait quand le coffre garde le jeton", async () => {
      service.set("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      expect(service.vaultRefused()).toBeNull();
    });

    it("dit que le jeton ne vaut que pour la session", async () => {
      block();
      const s = inject(TokenService);
      s.set("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      expect(s.vaultRefused()).toBe("ecriture");
      expect(s.present()).toBe(true);
    });

    it("dit qu’un jeton oublié reste dans le coffre", async () => {
      block();
      const s = inject(TokenService);
      s.erase();
      await flushPromises();
      expect(s.vaultRefused()).toBe("effacement");
      expect(s.present()).toBe(false);
    });

    it("cesse de le dire quand le coffre accepte de nouveau", async () => {
      block();
      const s = inject(TokenService);
      s.set("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      stubStorage();
      s.set("ghp_abcdefghijklmnopqrst5678");
      await flushPromises();
      expect(s.vaultRefused()).toBeNull();
    });
  });

  describe("vérification de forme", () => {
    it("accepte les préfixes GitHub connus", () => {
      expect(TokenService.checkForm("ghp_abcdefghijklmnopqrst")).toBeNull();
      expect(
        TokenService.checkForm("github_pat_11ABCDEFG0abcdefghij"),
      ).toBeNull();
    });

    it("refuse ce qui ne ressemble pas à un jeton", () => {
      // erreur de saisie la plus fréquente : coller autre chose que le jeton
      expect(TokenService.checkForm("mon-identifiant")).toContain("ghp_");
      expect(TokenService.checkForm("")).toContain("Saisir");
      expect(TokenService.checkForm("ghp_abc def")).toContain("espace");
      expect(TokenService.checkForm("ghp_court")).toContain("incomplet");
    });
  });
});
