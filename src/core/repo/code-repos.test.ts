import { describe, expect, it } from "vitest";
import { parseCodeRepos } from "./repo-loader";

/**
 * Code repos come from the configuration file, hence from text
 * written by hand. The scoping skill uses them to situate itself: a dubious
 * entry must be set aside and reported, never make the specification unreadable.
 */
describe("code repos declared by the project", () => {
  it("returns an empty list when nothing is declared", () => {
    expect(parseCodeRepos(undefined)).toEqual({ repos: [], anomalies: [] });
    expect(parseCodeRepos(null).repos).toEqual([]);
  });

  it("reads a repo with its role", () => {
    const { repos, anomalies } = parseCodeRepos([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
    ]);
    expect(repos).toEqual([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
    ]);
    expect(anomalies).toEqual([]);
  });

  it("accepts the short form, the role telling nothing about a single-repo project", () => {
    expect(parseCodeRepos(["ssk-it/ssk-canon-pwa"]).repos).toEqual([
      { repo: "ssk-it/ssk-canon-pwa", role: "" },
    ]);
  });

  it("sets aside a misnamed repo, and says which one", () => {
    const { repos, anomalies } = parseCodeRepos([
      "sans-organisation",
      { repo: "ssk-it/ssk-canon-pwa" },
    ]);
    expect(repos).toEqual([{ repo: "ssk-it/ssk-canon-pwa", role: "" }]);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]).toContain("sans-organisation");
  });

  it("flags a value that is not a list, keeping nothing", () => {
    const { repos, anomalies } = parseCodeRepos("ssk-it/ssk-canon-pwa");
    expect(repos).toEqual([]);
    expect(anomalies.length).toBe(1);
  });
});
