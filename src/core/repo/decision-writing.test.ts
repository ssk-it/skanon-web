import { describe, expect, it } from "vitest";
import { serializeDecision } from "./authoring.service";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractSubsections,
} from "./frontmatter";

/** Parses the produced text, failing clearly if it is unreadable. */
function reread(text: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const parse = splitFrontmatter(text);
  if (parse === null) throw new Error("aucun frontmatter produit");
  if (isUnreadable(parse))
    throw new Error(`frontmatter illisible : ${parse.error}`);
  return { data: parse.data as Record<string, unknown>, body: parse.body };
}

/**
 * What the application writes must read back identically — by itself as
 * by the checker. A difference would only show on reload, once the
 * file is committed: the worst moment to learn it.
 */
describe("writing a decision", () => {
  const decision = {
    title: "Où stocker les pièces jointes ?",
    status: "retenue" as const,
    description: "Ce qui rendait la question ouverte.",
    options: [
      { id: "dans-la-base", body: "**Pour** — simple.\n**Contre** — lourd." },
      { id: "stockage-objet", body: "**Pour** — passe à l’échelle." },
    ],
    chosenOption: "stockage-objet",
    decision: "Ce qui a tranché, en une phrase.",
  };

  it("produces a frontmatter that reading accepts", () => {
    const { data } = reread(serializeDecision("01-stockage", decision));
    expect(data["id"]).toBe("01-stockage");
    expect(data["statut"]).toBe("retenue");
    expect(data["option_retenue"]).toBe("stockage-objet");
  });

  it("reads the options back as they were written", () => {
    const options = [
      ...extractSubsections(
        reread(serializeDecision("01-stockage", decision)).body,
        "Options",
      ),
    ];
    expect(options.map(([title]) => title)).toEqual([
      "dans-la-base",
      "stockage-objet",
    ]);
  });

  it("marks the chosen option in its text, for whoever reads the file alone", () => {
    const out = serializeDecision("01-stockage", decision);
    const options = [...extractSubsections(reread(out).body, "Options")];
    const chosen = options.find(([t]) => t === "stockage-objet")![1];
    expect(chosen).toContain("**Retenue.**");
    expect(options.find(([t]) => t === "dans-la-base")![1]).not.toContain(
      "Retenue",
    );
  });

  it("reads back the description and what settled it", () => {
    const { body } = reread(serializeDecision("01-stockage", decision));
    expect(extractSection(body, "Description")).toContain("question ouverte");
    expect(extractSection(body, "Décision")).toContain("a tranché");
  });

  it("writes null when nothing is settled yet", () => {
    // An open decision is the normal case of an in-progress scoping: it must
    // not be rejected, nor claim to have a chosen option.
    const out = serializeDecision("01-x", {
      ...decision,
      status: "ouverte",
      chosenOption: null,
    });
    expect(reread(out).data["option_retenue"]).toBeNull();
    expect(out).not.toContain("**Retenue.**");
  });

  it("escapes a title containing a colon", () => {
    // The format's most frequent fault: YAML reads the `:` as a separator.
    const out = serializeDecision("01-x", {
      ...decision,
      title: "Stockage : où ?",
    });
    expect(reread(out).data["titre"]).toBe("Stockage : où ?");
  });

  it("omits empty sections rather than writing hollow headings", () => {
    const out = serializeDecision("01-x", {
      ...decision,
      options: [],
      decision: "",
    });
    expect(out).not.toContain("## Options");
    expect(out).not.toContain("## Décision");
  });

  it("sets aside an option without an identifier", () => {
    const out = serializeDecision("01-x", {
      ...decision,
      options: [...decision.options, { id: "  ", body: "orpheline" }],
    });
    expect([...extractSubsections(reread(out).body, "Options")].length).toBe(2);
  });
});
