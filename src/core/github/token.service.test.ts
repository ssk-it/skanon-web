import { inject, resetInjection } from "../injection";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";
import { LocaleService } from "../i18n/locale.service";

/**
 * The test environment only exposes a partial localStorage — which is
 * convenient: the service must work when storage is unavailable, in
 * private browsing for instance. We replace it with an in-memory implementation
 * to control the state, and one case explicitly checks the fallback.
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

  it("starts without a token", () => {
    expect(service.present()).toBe(false);
    expect(service.source()).toBe("aucune");
    expect(service.fingerprint()).toBeNull();
  });

  it("keeps a token and exposes only its last characters", () => {
    service.set("ghp_abcdefghijklmnopqrst1234");
    expect(service.present()).toBe(true);
    expect(service.source()).toBe("personnel");
    // the fingerprint identifies the token without disclosing it
    expect(service.fingerprint()).toBe("…1234");
    expect(service.fingerprint()).not.toContain("abcdefgh");
  });

  it("erases the token and the storage", () => {
    service.set("ghp_abcdefghijklmnopqrst1234");
    service.erase();
    expect(service.present()).toBe(false);
    expect(storage.has("ssk-canon.token")).toBe(false);
  });

  /** RG-acces-par-portee, RG-acces-temporaire: a token for a single organisation, or a temporary access, is already an access in place. */
  it("reports no access in place only without a token, of any scope, nor temporary access", () => {
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

  it("ignores an empty input", () => {
    service.set("   ");
    expect(service.present()).toBe(false);
  });

  it("works when storage is unavailable", () => {
    // private browsing, blocked storage: the token must stay usable
    // for the session rather than make the application fail
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

  describe("a vault that refuses — RG-secret-conserve-localement", () => {
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

    it("stays silent when the vault keeps the token", async () => {
      service.set("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      expect(service.vaultRefused()).toBeNull();
    });

    it("says the token is only valid for the session", async () => {
      block();
      const s = inject(TokenService);
      s.set("ghp_abcdefghijklmnopqrst1234");
      await flushPromises();
      expect(s.vaultRefused()).toBe("ecriture");
      expect(s.present()).toBe(true);
    });

    it("says a forgotten token remains in the vault", async () => {
      block();
      const s = inject(TokenService);
      s.erase();
      await flushPromises();
      expect(s.vaultRefused()).toBe("effacement");
      expect(s.present()).toBe(false);
    });

    it("stops saying so when the vault accepts again", async () => {
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

  describe("shape check", () => {
    it("accepts known GitHub prefixes", () => {
      expect(TokenService.checkForm("ghp_abcdefghijklmnopqrst")).toBeNull();
      expect(
        TokenService.checkForm("github_pat_11ABCDEFG0abcdefghij"),
      ).toBeNull();
    });

    it("refuses what does not look like a token", () => {
      // most frequent input error: pasting something other than the token
      expect(TokenService.checkForm("mon-identifiant")).toContain("ghp_");
      expect(TokenService.checkForm("")).toContain("Saisir");
      expect(TokenService.checkForm("ghp_abc def")).toContain("espace");
      expect(TokenService.checkForm("ghp_court")).toContain("incomplet");
    });

    it("says what is wrong in English", () => {
      inject(LocaleService).choice.set("en");
      expect(TokenService.checkForm("")).toBe("Enter a token.");
      expect(TokenService.checkForm("ghp_abc def")).toContain("space");
      expect(TokenService.checkForm("mon-identifiant")).toContain(
        "starts with ghp_",
      );
      expect(TokenService.checkForm("ghp_court")).toContain("incomplete");
    });
  });
});
