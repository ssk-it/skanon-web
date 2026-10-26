import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { LiensService } from "./liens.service";
import { RepoConfig } from "./repo-config";

/**
 * Le lien qui mène au dépôt de cadrage sur GitHub.
 *
 * L'adresse est construite à un seul endroit : une vue qui l'écrirait en dur
 * pointerait encore l'ancien projet après un changement de dépôt.
 */
describe("Lien vers GitHub", () => {
  let stockage: Record<string, string>;

  beforeEach(() => {
    stockage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => stockage[c] ?? null,
        setItem: (c: string, v: string) => void (stockage[c] = v),
        removeItem: (c: string) => void delete stockage[c],
        clear: () => void (stockage = {}),
      },
    });
    resetInjection();
  });

  it("mène au dépôt ouvert", () => {
    const config = inject(RepoConfig);
    config.depot.set({ owner: "ssk-it", repo: "ssk-canon" });

    expect(inject(LiensService).versGithub()).toBe(
      "https://github.com/ssk-it/ssk-canon",
    );
  });

  it("suit le dépôt quand on en change", () => {
    const config = inject(RepoConfig);
    const liens = inject(LiensService);

    config.depot.set({ owner: "ssk-it", repo: "ssk-canon" });
    expect(liens.versGithub()).toBe("https://github.com/ssk-it/ssk-canon");

    config.depot.set({ owner: "autre-org", repo: "autre-depot" });
    expect(liens.versGithub()).toBe("https://github.com/autre-org/autre-depot");
  });

  it("accepte des segments et les encode", () => {
    const config = inject(RepoConfig);
    config.depot.set({ owner: "ssk-it", repo: "ssk-canon" });
    const liens = inject(LiensService);

    expect(liens.versGithub("issues")).toBe(
      "https://github.com/ssk-it/ssk-canon/issues",
    );
    // Un segment ne doit jamais pouvoir sortir du dépôt qu'il désigne.
    expect(liens.versGithub("../evasion")).toBe(
      "https://github.com/ssk-it/ssk-canon/..%2Fevasion",
    );
  });
});
