import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";
import {
  displayIdentifier,
  extractScopingIdentifier,
} from "./scoping-reference";

/**
 * The project prefix — RG-prefixe-projet.
 *
 * It is added on display and accepted on input, without changing anything in
 * what is stored. That asymmetry is what matters: identifiers already written
 * in issues, pull requests or cards stay valid, and nothing could catch up
 * with them if they stopped being so.
 */
describe("prefix declared by the project", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();

    httpMock = provideHttpTesting();
  });

  async function loadWithConfig(config: string) {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    httpMock
      .expectOne(
        "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
      )
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: [{ path: "ssk-canon.yml", sha: "b10b", type: "blob" }],
      });

    await new Promise((r) => setTimeout(r, 0));
    httpMock
      .expectOne(
        "https://raw.githubusercontent.com/org/projet/c0mm17/ssk-canon.yml",
      )
      .flush(config);

    return expected;
  }

  it("reads the prefix declared under the project", async () => {
    const specification = await loadWithConfig(
      "schema_version: 1\nprojet:\n  nom: Prime\n  prefixe: PRMCO\n",
    );

    expect(specification.project.prefix).toBe("PRMCO");
  });

  it("leaves the prefix empty when the project declares none", async () => {
    // The case of every existing project: nothing must change for them.
    const specification = await loadWithConfig(
      "schema_version: 1\nprojet:\n  nom: Prime\n",
    );

    expect(specification.project.prefix).toBeNull();
  });
});

describe("displaying an identifier", () => {
  it("prefixes the identifier when the project declares a prefix", () => {
    expect(displayIdentifier("2026-002", "PRMCO")).toBe("PRMCO-2026-002");
  });

  it("returns the bare identifier when no prefix is declared", () => {
    expect(displayIdentifier("2026-002", null)).toBe("2026-002");
  });
});

/**
 * Routing accepts both forms — RG-prefixe-projet.
 *
 * The bare address stays valid and stays canonical: it is the one written in
 * issues and pull requests, and nothing could catch up with it if it stopped
 * working. The prefixed address is added.
 */
describe("prefixed address", () => {
  it("leads to the same scoping as the bare address", () => {
    expect(extractScopingIdentifier("PRMCO-2026-002", "PRMCO")).toBe(
      "2026-002",
    );
    expect(extractScopingIdentifier("2026-002", "PRMCO")).toBe("2026-002");
  });

  it("refuses another project's prefix", () => {
    expect(extractScopingIdentifier("AUTRE-2026-002", "PRMCO")).toBeNull();
  });
});
