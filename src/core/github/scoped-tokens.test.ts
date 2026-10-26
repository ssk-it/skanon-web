import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService, repoKeys } from "./token.service";

/**
 * An author works on projects belonging to several
 * organisations, and a token may cover only one of them. These cases are about
 * the choice of the token to present, on which every access depends.
 */
describe("tokens by scope", () => {
  let tokens: TokenService;
  let storage: Record<string, string>;
  let session: Record<string, string>;

  /** A minimal web storage: the test bench does not provide one. */
  const fake = (data: () => Record<string, string>) => ({
    getItem: (c: string) => data()[c] ?? null,
    setItem: (c: string, v: string) => void (data()[c] = v),
    removeItem: (c: string) => void delete data()[c],
    clear: () => void Object.keys(data()).forEach((c) => delete data()[c]),
  });

  beforeEach(() => {
    storage = {};
    session = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fake(() => storage),
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: fake(() => session),
    });
    resetInjection();
    tokens = inject(TokenService);
  });

  it("has no token at first", () => {
    expect(tokens.value()).toBeNull();
    expect(tokens.present()).toBe(false);
  });

  it("presents the token of the open repo's organisation", () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.setForScope("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");

    tokens.targetRepo({ owner: "Wayne-Corp", repo: "wayne-chantier-cadrage" });
    expect(tokens.value()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("gives a repo's token precedence over its organisation's", () => {
    // The targeted case: read on the organisation, write on a single repo.
    tokens.setForScope("ssk-it", "ghp_organisation_lecture");
    tokens.setForScope("ssk-it/ssk-canon", "ghp_depot_ecriture");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBe("ghp_depot_ecriture");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon-action" });
    expect(tokens.value()).toBe("ghp_organisation_lecture");
  });

  it("ignores case, which the platform does not distinguish", () => {
    tokens.setForScope("SSK-IT", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
  });

  it("falls back on the general token when no scope matches", () => {
    tokens.set("ghp_general_aaaaaaaaaaaa");
    tokens.setForScope("ssk-it", "ghp_ssk_aaaaaaaaaaaaaaaa");

    tokens.targetRepo({ owner: "autre-orga", repo: "un-depot" });
    expect(tokens.value()).toBe("ghp_general_aaaaaaaaaaaa");
  });

  it("says under which scope the current token applies", () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.currentScope()).toBe("ssk-it");

    tokens.setForScope("ssk-it/ssk-canon", "ghp_bbbbbbbbbbbbbbbbbbbb");
    expect(tokens.currentScope()).toBe("ssk-it/ssk-canon");

    tokens.targetRepo({ owner: "inconnue", repo: "x" });
    expect(tokens.currentScope()).toBeNull();
  });

  it("forgets a scope without touching the others", () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.setForScope("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");
    tokens.forgetScope("ssk-it");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBeNull();
    tokens.targetRepo({ owner: "wayne-corp", repo: "x" });
    expect(tokens.value()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("finds the tokens again from one session to the next", async () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.set("ghp_general_aaaaaaaaaaaa");

    // next session: local storage remains, session storage does not
    session = {};
    resetInjection();
    const next = inject(TokenService);
    await next.initialize();
    next.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });

    expect(next.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
    next.targetRepo({ owner: "autre-orga", repo: "x" });
    expect(next.value()).toBe("ghp_general_aaaaaaaaaaaa");
  });

  it("removes a scope from storage, and not only from memory", async () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.setForScope("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");
    tokens.forgetScope("ssk-it");

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();

    next.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(next.value()).toBeNull();
    next.targetRepo({ owner: "wayne-corp", repo: "x" });
    expect(next.value()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("erases the encrypted vault a previous version had left", async () => {
    // It is not recoverable: the passphrase that opened it is no longer
    // asked for anywhere. Keeping it would only take up space.
    storage["ssk-canon.coffre"] = JSON.stringify({
      v: 1,
      salt: "x",
      nonce: "y",
      sealed: "z",
    });
    session["ssk-canon.cle-session"] = "une-cle";

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();

    expect(storage["ssk-canon.coffre"]).toBeUndefined();
    expect(session["ssk-canon.cle-session"]).toBeUndefined();
  });

  it("takes over the tokens a previous version had written in plain text", async () => {
    storage["ssk-canon.token"] = "ghp_cccccccccccccccccccc";
    storage["ssk-canon.jetons"] = JSON.stringify([
      ["ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa"],
    ]);

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();
    next.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });

    expect(next.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
  });

  it("erases storage, and not only memory", async () => {
    tokens.set("ghp_general_aaaaaaaaaaaa");
    tokens.erase();

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();
    expect(next.value()).toBeNull();
    expect(storage["ssk-canon.token"]).toBeUndefined();
    expect(storage["ssk-canon.jetons"]).toBeUndefined();
  });

  it("erases everything, scopes included", () => {
    tokens.set("ghp_general_aaaaaaaaaaaa");
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.erase();

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBeNull();
    expect(tokens.scopes()).toEqual([]);
  });

  it("survives a corrupted storage", () => {
    storage["ssk-canon.jetons"] = "pas du JSON";
    resetInjection();
    expect(inject(TokenService).scopes()).toEqual([]);
  });

  it("separates the organisation key from the repo key", () => {
    expect(repoKeys({ owner: "SSK-IT", repo: "SSK-Canon" })).toEqual({
      organization: "ssk-it",
      exact: "ssk-it/ssk-canon",
    });
  });
});
