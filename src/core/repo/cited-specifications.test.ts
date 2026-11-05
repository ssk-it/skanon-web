import { beforeEach, describe, expect, it } from "vitest";
import { GithubError, type RepoRef } from "../github/github-client";
import { inject, provide, resetInjection } from "../injection";
import type {
  ArchitectureDecision,
  Citation,
  Rule,
  Specification,
} from "../model/model";
import {
  CitedSpecifications,
  citationState,
  type CitedRead,
} from "./cited-specifications";
import { RepoLoader } from "./repo-loader";
import { TokenService } from "../github/token.service";

/**
 * Reading a cited specification with the current access —
 * RG-citation-signalee-chez-le-citant.
 *
 * The reader of the citing project may not open the cited one: the citation
 * then reads as an identifier without content, and says why, never as an error
 * page.
 */
const SOCLE: RepoRef = { owner: "org", repo: "socle-cadrage" };

function specification(
  rules: Partial<Rule>[] = [],
  decisions: Partial<ArchitectureDecision>[] = [],
): Specification {
  return {
    rules: new Map(rules.map((r) => [r.id!, r as Rule])),
    decisions: new Map(
      decisions.map((d) => [d.id!, d as ArchitectureDecision]),
    ),
  } as unknown as Specification;
}

describe("reading a cited specification", () => {
  let reads: RepoRef[];
  let answer: () => Promise<Specification>;
  let token: string | null;

  beforeEach(() => {
    resetInjection();
    reads = [];
    token = "jeton-a";
    provide(TokenService, { valueFor: () => token });
    answer = () => Promise.resolve(specification());
    provide(RepoLoader, {
      loadSpecification: (repo: RepoRef) => {
        reads.push(repo);
        return answer();
      },
    });
  });

  it("reads it once, however many citations name it", async () => {
    const cited = inject(CitedSpecifications);

    const [a, b] = await Promise.all([cited.read(SOCLE), cited.read(SOCLE)]);

    expect(a.kind).toBe("lu");
    expect(b).toBe(a);
    expect(reads).toEqual([SOCLE]);
  });

  it("says the access does not open it, when the platform refuses", async () => {
    answer = () => Promise.reject(new GithubError("Not Found", 404));

    expect(await inject(CitedSpecifications).read(SOCLE)).toEqual({
      kind: "illisible",
      reason: "sans-acces",
    });
  });

  it("says it did not respond, when the platform is out of reach", async () => {
    answer = () => Promise.reject(new GithubError("offline", 0));

    expect(await inject(CitedSpecifications).read(SOCLE)).toEqual({
      kind: "illisible",
      reason: "injoignable",
    });
  });

  it("reads it again when the token that opens it changed", async () => {
    // A refusal is the token's (INV-5): another token may open it.
    const cited = inject(CitedSpecifications);
    await cited.read(SOCLE);

    token = "jeton-b";
    await cited.read(SOCLE);

    expect(reads).toEqual([SOCLE, SOCLE]);
  });
});

/**
 * The state of a citation — the same ones the check warns about
 * (RG-citation-signalee-chez-le-citant).
 */
describe("the state of a citation", () => {
  const CITATION: Citation = {
    prefix: "socle",
    target: "RG-nommage-des-roles",
    scoping: "2026-012",
  };
  const read = (s: Specification): CitedRead => ({
    kind: "lu",
    specification: s,
  });

  it("is current when nothing modified the target since the noted scoping", () => {
    const state = citationState(
      CITATION,
      read(
        specification([
          {
            id: "RG-nommage-des-roles",
            status: "actif",
            createdBy: "2026-003",
            modifiedBy: ["2026-012"],
          },
        ]),
      ),
    );

    expect(state).toEqual({ kind: "a-jour", targetKind: "regle" });
  });

  it("reports the more recent scoping that modified the target", () => {
    const state = citationState(
      CITATION,
      read(
        specification([
          {
            id: "RG-nommage-des-roles",
            status: "actif",
            createdBy: "2026-003",
            modifiedBy: ["2026-012", "2026-031", "2026-020"],
          },
        ]),
      ),
    );

    expect(state).toEqual({
      kind: "modifiee",
      targetKind: "regle",
      since: "2026-031",
    });
  });

  it("compares scoping numbers, not their text", () => {
    const state = citationState(
      { ...CITATION, scoping: "2026-999" },
      read(
        specification([
          {
            id: "RG-nommage-des-roles",
            status: "actif",
            createdBy: "2026-1000",
            modifiedBy: [],
          },
        ]),
      ),
    );

    expect(state.kind).toBe("modifiee");
  });

  it("reports a repealed target", () => {
    const state = citationState(
      CITATION,
      read(
        specification([
          {
            id: "RG-nommage-des-roles",
            status: "abroge",
            createdBy: "2026-003",
            modifiedBy: ["2026-040"],
          },
        ]),
      ),
    );

    expect(state).toEqual({ kind: "abrogee", targetKind: "regle" });
  });

  it("reports a missing target", () => {
    expect(citationState(CITATION, read(specification()))).toEqual({
      kind: "absente",
    });
  });

  it("finds an architecture decision as well as a rule", () => {
    const state = citationState(
      { ...CITATION, target: "ADR-runners" },
      read(
        specification(
          [],
          [
            {
              id: "ADR-runners",
              status: "actif",
              createdBy: "2026-004",
              modifiedBy: [],
            },
          ],
        ),
      ),
    );

    expect(state).toEqual({ kind: "a-jour", targetKind: "adr" });
  });

  it("is unverified when the cited specification cannot be read", () => {
    expect(
      citationState(CITATION, { kind: "illisible", reason: "sans-acces" }),
    ).toEqual({ kind: "non-verifiee", reason: "sans-acces" });
  });

  it("is unverified when the prefix designates no cited specification", () => {
    expect(citationState(CITATION, null)).toEqual({
      kind: "non-verifiee",
      reason: "prefixe-inconnu",
    });
  });
});
