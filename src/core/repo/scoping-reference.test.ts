import { describe, expect, it } from "vitest";
import {
  resolveScopingReference,
  extractScopingIdentifier,
} from "./scoping-reference";
import type { Scoping } from "../model/model";

/**
 * Resolving a reference to a scoping — RG-reference-par-identifiant.
 *
 * What is at stake is not convenience but the lifetime of the text: citing a
 * pull request's address forces one to come back and correct it after
 * delivery, and that omission is silent — the link keeps working, leads to a
 * closed pull request, and nothing says that a page exists.
 */
function scoping(id: string, provenance?: Scoping["provenance"]): Scoping {
  return { id, title: `Cadrage ${id}`, provenance } as unknown as Scoping;
}

const REPO = { owner: "org", repo: "projet" };

describe("resolving a scoping reference", () => {
  it("leads to the page when the scoping is delivered", () => {
    const target = resolveScopingReference(
      "2026-002",
      [scoping("2026-002")],
      REPO,
    );

    expect(target).toEqual({
      kind: "fiche",
      link: ["/", "org", "projet", "cadrages", "2026-002"],
      label: "2026-002",
    });
  });

  it("leads to the pull request as long as the scoping is not", () => {
    const target = resolveScopingReference(
      "2026-002",
      [
        scoping("2026-002", {
          branch: "cadrage-2026-002",
          pullRequest: 42,
          draft: true,
        }),
      ],
      REPO,
    );

    expect(target).toEqual({
      kind: "demande",
      url: "https://github.com/org/projet/pull/42",
      label: "2026-002",
      inProgress: true,
    });
  });

  it("reports a reference the repo does not carry", () => {
    // An unknown identifier is not a typing error to correct: the scoping may
    // be in progress elsewhere, on a branch this load did not see. Saying so is
    // better than making up a dead link.
    const target = resolveScopingReference(
      "2026-999",
      [scoping("2026-002")],
      REPO,
    );

    expect(target).toEqual({ kind: "inconnu", label: "2026-999" });
  });
});

/**
 * The project prefix — RG-prefixe-projet.
 *
 * It is added on display and accepted on input, without changing anything in
 * what is stored: identifiers already written in issues or pull requests stay
 * valid, and that is the whole point.
 */
describe("prefixed identifier", () => {
  it("accepts the unprefixed form", () => {
    expect(extractScopingIdentifier("2026-002", "PRMCO")).toBe("2026-002");
  });

  it("accepts the project's prefixed form", () => {
    expect(extractScopingIdentifier("PRMCO-2026-002", "PRMCO")).toBe(
      "2026-002",
    );
  });

  it("refuses a prefix that is not the project's", () => {
    // A numerically valid identifier is not enough: prefixed with another
    // project's prefix, it designates a scoping that is not here.
    expect(extractScopingIdentifier("AUTRE-2026-002", "PRMCO")).toBeNull();
  });

  it("accepts no prefix when the project declares none", () => {
    expect(extractScopingIdentifier("2026-002", null)).toBe("2026-002");
    expect(extractScopingIdentifier("PRMCO-2026-002", null)).toBeNull();
  });
});
