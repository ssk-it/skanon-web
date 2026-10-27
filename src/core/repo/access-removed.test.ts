import { beforeEach, describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { RepoLoader } from "./repo-loader";
import { writeSettings } from "./config-writer";

/**
 * The access mode and the third-party identity are no longer settings: only the personal token opens a repo. A project that still declares them sees them ignored without an anomaly — settings that have become pointless, not wrong settings —, and the first save removes them.
 */
const FILE = `schema_version: 1

# Comment les rédacteurs obtiennent l'accès au dépôt.
# jeton_personnel : chacun apporte le sien — rien à héberger.
acces: identite_tierce

# Où les identités sont vérifiées.
identite:
  emetteur: https://identite.exemple.fr/realms/projet
  client: mon-application
  echange: https://echange.exemple.fr

tags_liens:
  - carte_trello
`;

describe("reading a project that still declares an access mode", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    httpMock = provideHttpTesting();
  });

  async function loadFrom(config: string) {
    const expected = inject(RepoLoader).loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
    await new Promise((r) => setTimeout(r, 0));
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: [{ path: "ssk-canon.yml", sha: "b10b", type: "blob" }],
      });
    await new Promise((r) => setTimeout(r, 0));
    httpMock.expectOne((r) => r.url.endsWith("/ssk-canon.yml")).flush(config);
    return expected;
  }

  it("ignores the mode and the identity, without an anomaly", async () => {
    const specification = await loadFrom(FILE);
    expect(specification.anomalies).toEqual([]);
    expect(specification.settings).not.toHaveProperty("access");
    expect(specification.settings).not.toHaveProperty("identity");
  });

  it("also ignores a mode that never existed", async () => {
    const specification = await loadFrom("schema_version: 1\nacces: oauth\n");
    expect(specification.anomalies).toEqual([]);
  });
});

describe("saving a project that still declares an access mode", () => {
  it("removes the mode and the identity, comments included", () => {
    const out = writeSettings(FILE, {});
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBeUndefined();
    expect(data["identite"]).toBeUndefined();
    expect(out).not.toContain("Comment les rédacteurs");
    expect(out).not.toContain("Où les identités");
    expect(data["tags_liens"]).toEqual(["carte_trello"]);
  });

  it("adds no mode to a file that has none", () => {
    const out = writeSettings("schema_version: 1\n", {});
    expect(out).not.toContain("acces");
  });
});
