import { describe, expect, it } from "vitest";
import { sampleCodeRepos, installCommand } from "./scoping-skill";

/**
 * The example displayed in the settings must reflect the open project: a
 * project that already declares its repos has no business reading a generic
 * example, which it would copy over its own declaration.
 */
describe("example of code repos", () => {
  it("offers a generic template when the project declares none", () => {
    const out = sampleCodeRepos([]);
    expect(out).toContain("organisation/depot-front");
    expect(out.startsWith("depots_code:")).toBe(true);
  });

  it("takes up the repos declared by the project", () => {
    const out = sampleCodeRepos([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
      { repo: "Wayne-Corp/wayne-back", role: "API" },
    ]);
    expect(out).toContain(
      "{ repo: Wayne-Corp/wayne-front, role: Application web }",
    );
    expect(out).toContain("{ repo: Wayne-Corp/wayne-back, role: API }");
    expect(out).not.toContain("organisation/depot-front");
  });

  it("omits the role when it is not filled in", () => {
    expect(
      sampleCodeRepos([{ repo: "ssk-it/ssk-canon-pwa", role: "" }]),
    ).toContain("{ repo: ssk-it/ssk-canon-pwa }");
  });

  it("installs the skill from the automation's repo", () => {
    // It is not embedded in the application: a second copy of the format would
    // diverge from the first at the first correction.
    expect(installCommand()).toContain("ssk-it/ssk-canon-action");
    expect(installCommand()).toContain("~/.claude/skills/");
  });
});
