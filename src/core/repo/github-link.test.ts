import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { LinksService } from "./links.service";
import { RepoConfig } from "./repo-config";

/**
 * Le lien qui mène au dépôt de cadrage sur GitHub.
 *
 * L'adresse est construite à un seul endroit : une vue qui l'écrirait en dur
 * pointerait encore l'ancien projet après un changement de dépôt.
 */
describe("Lien vers GitHub", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => storage[c] ?? null,
        setItem: (c: string, v: string) => void (storage[c] = v),
        removeItem: (c: string) => void delete storage[c],
        clear: () => void (storage = {}),
      },
    });
    resetInjection();
  });

  it("mène au dépôt ouvert", () => {
    const config = inject(RepoConfig);
    config.repoRef.set({ owner: "ssk-it", repo: "ssk-canon" });

    expect(inject(LinksService).toGithub()).toBe(
      "https://github.com/ssk-it/ssk-canon",
    );
  });

  it("suit le dépôt quand on en change", () => {
    const config = inject(RepoConfig);
    const links = inject(LinksService);

    config.repoRef.set({ owner: "ssk-it", repo: "ssk-canon" });
    expect(links.toGithub()).toBe("https://github.com/ssk-it/ssk-canon");

    config.repoRef.set({ owner: "autre-org", repo: "autre-depot" });
    expect(links.toGithub()).toBe("https://github.com/autre-org/autre-depot");
  });

  it("accepte des segments et les encode", () => {
    const config = inject(RepoConfig);
    config.repoRef.set({ owner: "ssk-it", repo: "ssk-canon" });
    const links = inject(LinksService);

    expect(links.toGithub("issues")).toBe(
      "https://github.com/ssk-it/ssk-canon/issues",
    );
    // Un segment ne doit jamais pouvoir sortir du dépôt qu'il désigne.
    expect(links.toGithub("../evasion")).toBe(
      "https://github.com/ssk-it/ssk-canon/..%2Fevasion",
    );
  });
});
