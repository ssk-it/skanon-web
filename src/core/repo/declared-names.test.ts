import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";
import {
  DEFAULT_NAMES,
  decisionFile,
  decisionsFolder,
  namesFromConfigText,
  resolveNames,
  ruleFile,
  scopingFile,
} from "./repo-names";

/**
 * Since scoping 2026-061, a repo may name its folders and its conventional
 * files in `ssk-canon.yml` (RG-noms-declares). What is exercised here is the
 * loader — the step where a folder the application does not know disappears
 * silently — and the paths the application writes to.
 */

const CLIENT_CONFIG = [
  "dossiers:",
  "  domaines: domaines",
  "  fonctionnalites: fonctionnalites",
  "  regles: exigences",
  "  cadrages: evolutions",
  "  decisions_cadrage: arbitrages",
  "fichiers:",
  "  cadrage: evolution.md",
  "  pieces_jointes: pieces-jointes.md",
  "",
].join("\n");

describe("paths under declared names", () => {
  const names = namesFromConfigText(CLIENT_CONFIG);

  it("builds a scoping's paths from the declared names", () => {
    expect(scopingFile(names, "2026-001")).toBe(
      "evolutions/2026-001/evolution.md",
    );
    expect(decisionsFolder(names, "2026-001")).toBe(
      "evolutions/2026-001/arbitrages/",
    );
    expect(decisionFile(names, "2026-001", "01-x")).toBe(
      "evolutions/2026-001/arbitrages/01-x.md",
    );
    expect(ruleFile(names, "RG-a")).toBe("exigences/RG-a.md");
  });

  it("keeps the format's paths for a repo that declares nothing", () => {
    expect(scopingFile(DEFAULT_NAMES, "2026-001")).toBe(
      "cadrages/2026-001/cadrage.md",
    );
    expect(decisionFile(DEFAULT_NAMES, "2026-001", "01-x")).toBe(
      "cadrages/2026-001/decisions/01-x.md",
    );
    expect(ruleFile(DEFAULT_NAMES, "RG-a")).toBe("rules/RG-a.md");
    expect(namesFromConfigText(null)).toEqual(DEFAULT_NAMES);
    expect(namesFromConfigText("schema_version: 1\n")).toEqual(DEFAULT_NAMES);
  });

  it("keeps the format's name for a faulty entry, and says why", () => {
    const { names: read, anomalies } = resolveNames({
      dossiers: { regles: "docs/regles" },
    });
    expect(read.dossiers.regles).toBe("rules");
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]).toContain("dossiers.regles");
  });
});

describe("loading under declared names", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    httpMock = provideHttpTesting();
  });

  /**
   * Answers with the tree, then with the configuration, then with each file
   * the loader asks for: it reads the configuration first, since it tells
   * which folders carry entities.
   */
  async function serve(
    config: string | null,
    files: readonly { path: string; content: string }[],
    others: readonly string[] = [],
  ) {
    const tree = [
      ...(config === null ? [] : [{ path: "ssk-canon.yml" }]),
      ...files,
      ...others.map((path) => ({ path })),
    ];
    httpMock
      .expectOne(
        "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
      )
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: tree.map((f, i) => ({
          path: f.path,
          sha: `b10b${i}`,
          type: "blob",
        })),
      });

    await new Promise((r) => setTimeout(r, 0));
    if (config !== null) {
      httpMock
        .expectOne(
          "https://raw.githubusercontent.com/org/projet/c0mm17/ssk-canon.yml",
        )
        .flush(config);
      await new Promise((r) => setTimeout(r, 0));
    }

    for (const f of files) {
      httpMock
        .expectOne(
          `https://raw.githubusercontent.com/org/projet/c0mm17/${f.path}`,
        )
        .flush(f.content);
    }
    // what lies outside the declared folders is not even requested
    httpMock.verify();
  }

  function load() {
    return inject(RepoLoader).loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
  }

  it("reads entities, scopings, decisions and attachments under the declared names", async () => {
    const expected = load();
    await serve(
      CLIENT_CONFIG,
      [
        {
          path: "domaines/d.md",
          content: "---\nid: d\nnom: D\n---\n\nUn domaine.\n",
        },
        {
          path: "fonctionnalites/f.md",
          content: "---\nid: f\nnom: F\ndomaines: [d]\n---\n\nF.\n",
        },
        {
          path: "exigences/RG-a.md",
          content:
            "---\nid: RG-a\nfonctionnalites: [f]\nstatut: actif\n---\n\nUne exigence.\n",
        },
        {
          path: "evolutions/2026-001/evolution.md",
          content:
            "---\nid: 2026-001\ntitre: Une évolution\ndomaines: [d]\nimpacts: []\n---\n\n## Objectif\n\nUn objectif.\n",
        },
        {
          path: "evolutions/2026-001/arbitrages/01-x.md",
          content:
            "---\nid: 01-x\ntitre: Une question\nstatut: retenue\noption_retenue: a\n---\n\n## Description\n\nTexte.\n",
        },
        {
          path: "evolutions/2026-001/pieces-jointes.md",
          content: `---\nattachments:\n  - { nom: plan.pdf, sha256: ${"a".repeat(64)} }\n---\n`,
        },
      ],
      ["rules/RG-vestige.md", "cadrages/2026-000/cadrage.md"],
    );

    const specification = await expected;
    expect(specification.anomalies).toEqual([]);
    expect([...specification.domains.keys()]).toEqual(["d"]);
    expect([...specification.features.keys()]).toEqual(["f"]);
    expect([...specification.rules.keys()]).toEqual(["RG-a"]);
    const scoping = specification.scopings.get("2026-001");
    expect(scoping?.title).toBe("Une évolution");
    expect(scoping?.decisions.map((d) => d.id)).toEqual(["01-x"]);
    expect(scoping?.attachments.length).toBe(1);
    expect(specification.names?.dossiers.regles).toBe("exigences");
  });

  it("reports a faulty declaration, and reads under the format's name", async () => {
    const expected = load();
    await serve("dossiers:\n  regles: ''\n", [
      {
        path: "rules/RG-a.md",
        content:
          "---\nid: RG-a\nfonctionnalites: [f]\nstatut: actif\n---\n\nUne règle.\n",
      },
    ]);

    const specification = await expected;
    expect(specification.rules.has("RG-a")).toBe(true);
    expect(
      specification.anomalies.some((a) => a.includes("dossiers.regles")),
    ).toBe(true);
  });

  it("reports a declared folder missing while the format's one is still there", async () => {
    const expected = load();
    await serve("dossiers:\n  regles: exigences\n", [], ["rules/RG-a.md"]);

    const specification = await expected;
    expect(
      specification.anomalies.some(
        (a) => a.includes("exigences/") && a.includes("rules/"),
      ),
    ).toBe(true);
  });

  it("reads a repo without configuration under the format's names", async () => {
    const expected = load();
    await serve(null, [
      {
        path: "rules/RG-a.md",
        content:
          "---\nid: RG-a\nfonctionnalites: [f]\nstatut: actif\n---\n\nUne règle.\n",
      },
    ]);

    const specification = await expected;
    expect(specification.rules.has("RG-a")).toBe(true);
    expect(specification.names).toEqual(DEFAULT_NAMES);
  });
});
