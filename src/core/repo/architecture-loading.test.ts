import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";

/**
 * Since scoping 2026-038, the specification carries what describes how the
 * product is built: architecture decisions and architecture documents.
 *
 * What is exercised here is loading — the only step where an unknown kind
 * disappears silently. A file stored in a directory that the loader ignores
 * is not reported as an anomaly: it simply does not exist, and nothing in
 * the application says it was set aside.
 */
describe("loading of architecture targets", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();

    httpMock = provideHttpTesting();
  });

  /** Answers with the tree, then with the content of each announced file. */
  async function serve(files: readonly { path: string; content: string }[]) {
    const tree = httpMock.expectOne(
      "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
    );
    tree.flush({
      sha: "c0mm17",
      truncated: false,
      tree: files.map((f) => ({
        path: f.path,
        sha: "b10b",
        type: "blob",
      })),
    });

    // Content loading only starts once the tree has been returned:
    // let the queue run before claiming the next requests.
    await new Promise((r) => setTimeout(r, 0));

    for (const f of files) {
      httpMock
        .expectOne(
          `https://raw.githubusercontent.com/org/projet/c0mm17/${f.path}`,
        )
        .flush(f.content);
    }
  }

  it("loads an architecture decision", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "decisions/ADR-stockage.md",
        content:
          "---\nid: ADR-stockage\nstatut: actif\ncree_par: 2026-038\nmodifie_par: []\n---\n\nLe stockage est objet.\n",
      },
    ]);

    const specification = await expected;
    const adr = specification.decisions.get("ADR-stockage");
    expect(adr, "la décision n’a pas été chargée").toBeTruthy();
    expect(adr?.statement).toBe("Le stockage est objet.");
    expect(adr?.createdBy).toBe("2026-038");
  });

  it("loads an architecture document with its kind and its components", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "architecture/FLX-export.md",
        content:
          "---\nid: FLX-export\nnature: flux\ncomposants: [api, stockage]\nstatut: actif\ncree_par: 2026-038\nmodifie_par: []\n---\n\nUn export nocturne.\n",
      },
    ]);

    const specification = await expected;
    const flows = specification.architecture.get("FLX-export");
    expect(flows, "le document n’a pas été chargé").toBeTruthy();
    expect(flows?.kind).toBe("flux");
    expect(flows?.components).toEqual(["api", "stockage"]);
  });

  it("makes computable the relation from a component to the flows that touch it", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "architecture/CMP-api.md",
        content:
          "---\nid: CMP-api\nnature: composant\nstatut: actif\n---\n\nL’API.\n",
      },
      {
        path: "architecture/FLX-export.md",
        content:
          "---\nid: FLX-export\nnature: flux\ncomposants: [CMP-api]\nstatut: actif\n---\n\nUn export.\n",
      },
      {
        path: "architecture/FLX-autre.md",
        content:
          "---\nid: FLX-autre\nnature: flux\ncomposants: [CMP-autre]\nstatut: actif\n---\n\nUn autre.\n",
      },
    ]);

    const specification = await expected;
    // The relation is not maintained by hand: it is read from the documents themselves.
    const touching = [...specification.architecture.values()].filter((d) =>
      d.components.includes("CMP-api"),
    );
    expect(touching.map((d) => d.id)).toEqual(["FLX-export"]);
  });

  it("reads an impact targeting an architecture decision or document", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "cadrages/2026-001/cadrage.md",
        content:
          "---\nid: 2026-001\ntitre: Un cadrage\nimpacts:\n  - { adr: ADR-stockage, operation: cree }\n  - { architecture: FLX-export, operation: modifie }\n  - { regle: RG-a, operation: touche }\n---\n\n## Objectif\n\nUn objectif.\n",
      },
    ]);

    const specification = await expected;
    const impacts = specification.scopings.get("2026-001")?.impacts ?? [];
    expect(impacts.length).toBe(3);
    // Each impact knows what it targets: without that, the application would show
    // three indistinguishable lines, all presented as rules.
    expect(impacts.map((i) => i.target)).toEqual([
      "ADR-stockage",
      "FLX-export",
      "RG-a",
    ]);
    expect(impacts.map((i) => i.kind)).toEqual([
      "adr",
      "architecture",
      "regle",
    ]);
  });
});
