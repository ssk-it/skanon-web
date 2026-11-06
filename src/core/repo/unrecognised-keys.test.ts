import { beforeEach, describe, expect, it } from "vitest";
import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { RepoLoader } from "./repo-loader";

/**
 * Reading loses nothing either — RG-preservation-integrale, scoping 2026-069.
 *
 * A feature's frontmatter may carry keys the interface does not recognise. The loader keeps them on the feature, as they were read and without interpreting them, so that an extension that understands them can read them (ADR-extensions-commerciales).
 */
describe("a feature's unrecognised frontmatter keys", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    httpMock = provideHttpTesting();
  });

  async function serve(files: readonly { path: string; content: string }[]) {
    httpMock
      .expectOne(
        "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
      )
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: files.map((f, i) => ({
          path: f.path,
          sha: `b10b${i}`,
          type: "blob",
        })),
      });
    await new Promise((r) => setTimeout(r, 0));
    for (const f of files) {
      httpMock
        .expectOne(
          `https://raw.githubusercontent.com/org/projet/c0mm17/${f.path}`,
        )
        .flush(f.content);
    }
    httpMock.verify();
  }

  function load() {
    return inject(RepoLoader).loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
  }

  it("keeps them on the feature, as they were read", async () => {
    const expected = load();
    await serve([
      {
        path: "features/f.md",
        content: [
          "---",
          "id: f",
          "nom: F",
          "domaines: [d]",
          "palier: 2",
          "variantes: [courte, longue]",
          "note: { auteur: Alice, relue: true }",
          "---",
          "",
          "F.",
          "",
        ].join("\n"),
      },
    ]);

    const feature = (await expected).features.get("f");
    expect(feature?.name).toBe("F");
    expect(feature?.domains).toEqual(["d"]);
    expect(feature?.unrecognisedKeys).toEqual({
      palier: 2,
      variantes: ["courte", "longue"],
      note: { auteur: "Alice", relue: true },
    });
  });

  it("keeps none for a feature that carries only the format's keys", async () => {
    const expected = load();
    await serve([
      {
        path: "features/f.md",
        content: "---\nid: f\nnom: F\ndomaines: [d]\n---\n\nF.\n",
      },
    ]);

    expect((await expected).features.get("f")?.unrecognisedKeys).toEqual({});
  });

  it("keeps a malformed value as it is: judging it belongs to whoever understands the key", async () => {
    const expected = load();
    await serve([
      {
        path: "features/f.md",
        content: "---\nid: f\nnom: F\ndomaines: [d]\npalier: []\n---\n\nF.\n",
      },
    ]);

    const specification = await expected;
    expect(specification.features.get("f")?.unrecognisedKeys).toEqual({
      palier: [],
    });
    expect(specification.anomalies).toEqual([]);
  });
});
