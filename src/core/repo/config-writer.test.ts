import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { writeSettings } from "./config-writer";

/**
 * This file is re-read on the platform, and its comments explain what the
 * settings are for. Rewriting the whole document would destroy them — measured,
 * five disappear — hence a block-by-block replacement, which these cases exercise.
 */
const FILE = `# Configuration du projet — lue par l'application et par les Actions
schema_version: 1

projet:
  nom: SSK Canon
  description: >
    Un texte long, que reformater changerait
    sans que personne l'ait demandé.

tags_liens:
  - carte_trello
  - issue_github

# Transitions de statut que l'application propose, depuis chaque statut.
# « livree » n'y figure jamais : elle résulte de la fusion de la demande.
transitions:
  brouillon: [en_relecture]
  en_relecture: [brouillon, validee]
  validee: [en_relecture]

# La demande de fusion reflète le statut.
reflet_demande_fusion: true

attachments:
  provider: scaleway
  bucket: ssk-canon-demo
`;

const BASE = {
  access: "jeton_personnel" as const,
  identity: null,
  codeRepos: [],
};

const IDENTITY = {
  issuer: "https://identite.exemple.fr/realms/projet",
  client: "mon-application",
  exchange: "https://echange.exemple.fr",
};
// The same block, as the configuration file writes it.
const IDENTITY_BLOCK = {
  emetteur: IDENTITY.issuer,
  client: IDENTITY.client,
  echange: IDENTITY.exchange,
};

describe("writing settings to the configuration file", () => {
  it("removes the lifecycle settings, comments included", () => {
    // They have configured nothing since 2026-045: leaving them in the file
    // would suggest the lifecycle is still configurable.
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["transitions"]).toBeUndefined();
    expect(data["reflet_demande_fusion"]).toBeUndefined();
    expect(out).not.toContain("Transitions de statut");
    expect(out).not.toContain("La demande de fusion reflète");
    // the block that followed stays in place
    expect(data["attachments"]).toEqual({
      provider: "scaleway",
      bucket: "ssk-canon-demo",
    });
  });

  it("keeps what the application does not configure", () => {
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
      codeRepos: [],
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["schema_version"]).toBe(1);
    expect(data["tags_liens"]).toEqual(["carte_trello", "issue_github"]);
    expect(data["attachments"]).toEqual({
      provider: "scaleway",
      bucket: "ssk-canon-demo",
    });
  });

  it("does not touch the long texts of other blocks", () => {
    // js-yaml would reformat them by rewriting the whole document
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    expect(out).toContain(
      "Un texte long, que reformater changerait\n    sans que personne l'ait demandé.",
    );
  });

  it("keeps the comments of the blocks it does not touch", () => {
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    expect(out).toContain(
      "# Configuration du projet — lue par l'application et par les Actions",
    );
  });

  it("replaces the comment of the block it rewrites, without duplicating it", () => {
    const first = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    const second = writeSettings(first, { access: "relais", identity: null });
    const occurrences =
      second.split("Comment les rédacteurs obtiennent").length - 1;
    expect(occurrences).toBe(1);
  });

  it("adds missing blocks rather than failing", () => {
    const without = "schema_version: 1\n\nprojet:\n  nom: Neuf\n";
    const out = writeSettings(without, {
      access: "jeton_personnel",
      identity: null,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBe("jeton_personnel");
    expect(data["projet"]).toEqual({ nom: "Neuf" });
  });

  it("always ends with a line ending", () => {
    const out = writeSettings("schema_version: 1", {
      access: "jeton_personnel",
      identity: null,
    });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("writes the access mode, and reads it back", () => {
    const out = writeSettings(FILE, {
      access: "relais",
      identity: null,
    });
    expect((load(out) as Record<string, unknown>)["acces"]).toBe("relais");
  });

  it("adds the access mode to a file that has none", () => {
    // existing projects do not have this key: add it, do not fail
    const out = writeSettings(FILE, {
      access: "identite_tierce",
      identity: IDENTITY,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBe("identite_tierce");
    expect(data["schema_version"]).toBe(1);
  });

  it("writes the identite block, and reads it back", () => {
    const out = writeSettings(FILE, {
      access: "identite_tierce",
      identity: IDENTITY,
    });
    expect((load(out) as Record<string, unknown>)["identite"]).toEqual(
      IDENTITY_BLOCK,
    );
  });

  it("removes the identite block when the mode no longer uses it", () => {
    // leaving it would describe a configuration the project no longer applies
    const withValue = writeSettings(FILE, {
      access: "identite_tierce",
      identity: IDENTITY,
    });
    const without = writeSettings(withValue, {
      access: "jeton_personnel",
      identity: null,
    });
    const data = load(without) as Record<string, unknown>;
    expect(data["identite"]).toBeUndefined();
    expect(data["acces"]).toBe("jeton_personnel");
    expect(without).not.toContain("Où les identités sont vérifiées");
  });

  it("leaves no gap when removing a missing block", () => {
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
      codeRepos: [],
    });
    expect((load(out) as Record<string, unknown>)["schema_version"]).toBe(1);
  });
});

/**
 * Code repos are entered from the application, and what it writes is
 * committed to someone's repo. These cases check that the produced block
 * reads back, and that the rest of the file does not suffer from it.
 */
describe("writing code repos", () => {
  it("writes a block that reading finds again", () => {
    const out = writeSettings(FILE, {
      ...BASE,
      codeRepos: [
        { repo: "orga/front", role: "Application web" },
        { repo: "orga/back", role: "API" },
      ],
    });

    const data = load(out) as Record<string, unknown>;
    expect(data["depots_code"]).toEqual([
      { repo: "orga/front", role: "Application web" },
      { repo: "orga/back", role: "API" },
    ]);
  });

  it("omits the role when it is not set", () => {
    const out = writeSettings(FILE, {
      ...BASE,
      codeRepos: [{ repo: "orga/depot", role: "" }],
    });
    expect(load(out)).toMatchObject({ depots_code: [{ repo: "orga/depot" }] });
  });

  it("removes the block when no repo is declared any more", () => {
    // Leaving it in place would describe a project that no longer declares any.
    const withValue = writeSettings(FILE, {
      ...BASE,
      codeRepos: [{ repo: "orga/depot", role: "API" }],
    });
    const without = writeSettings(withValue, { ...BASE, codeRepos: [] });
    expect(without).not.toContain("depots_code");
    expect(
      (load(without) as Record<string, unknown>)["depots_code"],
    ).toBeUndefined();
  });

  it("does not damage the rest of the file", () => {
    const out = writeSettings(FILE, {
      ...BASE,
      codeRepos: [{ repo: "orga/depot", role: "API" }],
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["schema_version"]).toBe(1);
    expect((data["projet"] as Record<string, unknown>)["nom"]).toBe(
      "SSK Canon",
    );
    expect(out).toContain("# Configuration du projet");
  });

  it("stays stable from one write to the next", () => {
    // Rewriting identically must change nothing: otherwise each settings
    // proposal would show a difference nobody asked for.
    const codeRepos = [{ repo: "orga/depot", role: "API" }];
    const first = writeSettings(FILE, { ...BASE, codeRepos });
    const second = writeSettings(first, { ...BASE, codeRepos });
    expect(second).toBe(first);
  });
});
