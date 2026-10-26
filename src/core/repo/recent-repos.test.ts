import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoConfig, sameRepo, DEFAULT_REPO } from "./repo-config";

/**
 * The list of already opened repos lives in the browser. These cases cover
 * what must stay true when moving from one project to another, and the
 * twisted things storage can return.
 */
describe("already opened repos", () => {
  let config: RepoConfig;

  // The test bench provides only an incomplete `localStorage`, without `clear`
  // or `removeItem`. A real one is substituted: what is tested here is the
  // memory of repos, not the browser's ability to store.
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
    config = inject(RepoConfig);
  });

  it("remembers nothing until a repo has been opened", () => {
    expect(config.recents()).toEqual([]);
  });

  it("remembers a repo actually opened", () => {
    config.rememberOpened({ owner: "ssk-it", repo: "ssk-canon" });
    expect(config.recents()).toEqual([{ owner: "ssk-it", repo: "ssk-canon" }]);
  });

  it("moves a reopened repo up rather than duplicating it", () => {
    config.rememberOpened({ owner: "a", repo: "un" });
    config.rememberOpened({ owner: "b", repo: "deux" });
    config.rememberOpened({ owner: "a", repo: "un" });

    expect(config.recents().map((d) => d.repo)).toEqual(["un", "deux"]);
  });

  it("recognises the same repo whatever the case", () => {
    // The platform is case-insensitive: two entries for a single repo would
    // offer the same thing twice.
    config.rememberOpened({ owner: "SSK-IT", repo: "ssk-canon" });
    config.rememberOpened({ owner: "ssk-it", repo: "SSK-Canon" });
    expect(config.recents().length).toBe(1);
  });

  it("forgets a repo without touching the others", () => {
    config.rememberOpened({ owner: "a", repo: "un" });
    config.rememberOpened({ owner: "b", repo: "deux" });
    config.forget({ owner: "a", repo: "un" });
    expect(config.recents().map((d) => d.repo)).toEqual(["deux"]);
  });

  it("bounds the list, the oldest dropping out", () => {
    for (let i = 0; i < 20; i++)
      config.rememberOpened({ owner: "o", repo: `d${i}` });
    expect(config.recents().length).toBe(12);
    expect(config.recents()[0].repo).toBe("d19");
  });

  it("survives corrupted storage, without preventing the application from starting", () => {
    storage["ssk-canon.depots-recents"] = "ceci n’est pas du JSON";
    resetInjection();
    expect(inject(RepoConfig).recents()).toEqual([]);
  });

  it("leaves out incomplete entries an older version may have left", () => {
    storage["ssk-canon.depots-recents"] = JSON.stringify([
      { owner: "ssk-it" },
      { owner: "ssk-it", repo: "ssk-canon" },
    ]);
    resetInjection();
    expect(inject(RepoConfig).recents()).toEqual([
      { owner: "ssk-it", repo: "ssk-canon" },
    ]);
  });

  it("keeps the default repo when nothing is remembered", () => {
    expect(config.repoRef()).toEqual(DEFAULT_REPO);
  });
});

describe("identity of a repo", () => {
  it("ignores case on both sides", () => {
    expect(sameRepo({ owner: "A", repo: "B" }, { owner: "a", repo: "b" })).toBe(
      true,
    );
    expect(sameRepo({ owner: "a", repo: "b" }, { owner: "a", repo: "c" })).toBe(
      false,
    );
  });
});
