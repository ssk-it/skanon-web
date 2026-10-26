import { describe, expect, it } from "vitest";
import { sampleCodeRepos, installCommand } from "./skill-cadrage";

/**
 * L'exemple affiché dans les réglages doit refléter le projet ouvert : un
 * projet qui déclare déjà ses dépôts n'a pas à lire un exemple générique, qu'il
 * recopierait par-dessus sa propre déclaration.
 */
describe("exemple de dépôts de code", () => {
  it("propose un modèle générique quand le projet n’en déclare aucun", () => {
    const out = sampleCodeRepos([]);
    expect(out).toContain("organisation/depot-front");
    expect(out.startsWith("depots_code:")).toBe(true);
  });

  it("reprend les dépôts déclarés par le projet", () => {
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

  it("omet le rôle quand il n’est pas renseigné", () => {
    expect(
      sampleCodeRepos([{ repo: "ssk-it/ssk-canon-pwa", role: "" }]),
    ).toContain("{ repo: ssk-it/ssk-canon-pwa }");
  });

  it("installe le skill depuis le dépôt de l’automatisation", () => {
    // Il n'est pas embarqué dans l'application : une deuxième copie du format
    // divergerait de la première dès la première correction.
    expect(installCommand()).toContain("ssk-it/ssk-canon-action");
    expect(installCommand()).toContain("~/.claude/skills/");
  });
});
