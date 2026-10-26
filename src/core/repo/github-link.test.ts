import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { LinksService } from "./links.service";
import { RepoConfig } from "./repo-config";

/**
 * The link that leads to the framing repo on GitHub.
 *
 * The address is built in a single place: a view that hard-coded it
 * would still point to the old project after a repo change.
 */
describe("Link to GitHub", () => {
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

  it("leads to the open repo", () => {
    const config = inject(RepoConfig);
    config.repoRef.set({ owner: "ssk-it", repo: "ssk-canon" });

    expect(inject(LinksService).toGithub()).toBe(
      "https://github.com/ssk-it/ssk-canon",
    );
  });

  it("follows the repo when it changes", () => {
    const config = inject(RepoConfig);
    const links = inject(LinksService);

    config.repoRef.set({ owner: "ssk-it", repo: "ssk-canon" });
    expect(links.toGithub()).toBe("https://github.com/ssk-it/ssk-canon");

    config.repoRef.set({ owner: "autre-org", repo: "autre-depot" });
    expect(links.toGithub()).toBe("https://github.com/autre-org/autre-depot");
  });

  it("accepts segments and encodes them", () => {
    const config = inject(RepoConfig);
    config.repoRef.set({ owner: "ssk-it", repo: "ssk-canon" });
    const links = inject(LinksService);

    expect(links.toGithub("issues")).toBe(
      "https://github.com/ssk-it/ssk-canon/issues",
    );
    // A segment must never be able to escape the repo it designates.
    expect(links.toGithub("../evasion")).toBe(
      "https://github.com/ssk-it/ssk-canon/..%2Fevasion",
    );
  });
});
