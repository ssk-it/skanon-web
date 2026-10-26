import { describe, expect, it } from "vitest";
import {
  serializeScoping,
  EditableScoping,
  withLink,
  withLinkModified,
  withoutLink,
} from "./authoring.service";
import { parseLinkTags } from "./repo-loader";
import { splitFrontmatter, isUnreadable } from "./frontmatter";
import {
  ExternalLink,
  LINK_TAG_LABEL,
  DEFAULT_LINK_TAGS,
} from "../model/model";
import { normalizeTag } from "./link-tag";
import { unionLinkTags } from "./specification.store";
import { Scoping } from "../model/model";

/** Reads back what was just written, failing clearly if it is unreadable. */
function rereadLinks(text: string): ExternalLink[] {
  const parse = splitFrontmatter(text);
  if (parse === null) throw new Error("aucun frontmatter produit");
  if (isUnreadable(parse))
    throw new Error(`frontmatter illisible : ${parse.error}`);
  const raw = (parse.data as Record<string, unknown>)["liens"];
  return ((raw as Array<Record<string, unknown>>) ?? []).map((l) => ({
    tag: String(l["tag"] ?? ""),
    url: String(l["url"] ?? ""),
    name: String(l["nom"] ?? ""),
  }));
}

const base: EditableScoping = {
  title: "Un cadrage quelconque",
  domains: ["referentiel"],
  goal: "Ce qu’il vise.",
  journey: "Comment on y arrive.",
  impacts: [],
};

/**
 * A written link must read back identically. A difference would only show on
 * reload, once the file is committed — the worst moment to learn it.
 */
describe("writing external links", () => {
  it("returns a link as it was entered", () => {
    const link = {
      tag: "issue_github",
      name: "Migration du stockage",
      url: "https://github.com/ssk-it/ssk-canon/issues/12",
    };
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links: [link] })),
    ).toEqual([link]);
  });

  it("escapes a name YAML would misread", () => {
    // A « : » followed by a space would make the name a key, and the link would become
    // unreadable — a title almost always carries one.
    const link = {
      tag: "document",
      name: "Stockage : ce qu’on retient",
      url: "https://example.org/n",
    };
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links: [link] })),
    ).toEqual([link]);
  });

  it("returns an empty list when the scoping carries no link", () => {
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links: [] })),
    ).toEqual([]);
  });

  /**
   * The costliest defect: a scoping rewritten without its links being
   * re-read would lose them silently, and nothing on screen would say so.
   */
  it("keeps existing links across rewrites", () => {
    const links = [
      {
        tag: "carte_trello",
        name: "La carte",
        url: "https://trello.com/c/abc",
      },
      {
        tag: "maquette",
        name: "L’écran de saisie",
        url: "https://figma.com/f/1",
      },
    ];
    const first = serializeScoping("2026-001", { ...base, links });
    const second = serializeScoping("2026-001", {
      ...base,
      links: rereadLinks(first),
    });
    expect(second).toBe(first);
  });

  /**
   * The form must be that of links written by hand in the specification.
   * Producing another would show modified lines in review
   * where nobody touched anything — the noise that discredits a review.
   */
  it("writes a link in the form the specification has", () => {
    const text = serializeScoping("2026-001", {
      ...base,
      links: [
        {
          tag: "issue_github",
          name: "",
          url: "https://github.com/ssk-it/ssk-canon",
        },
      ],
    });
    expect(text).toContain(
      "  - { tag: issue_github, url: 'https://github.com/ssk-it/ssk-canon' }",
    );
  });

  it("sets aside a link without an address: it would lead nowhere", () => {
    const links = [
      { tag: "document", name: "Sans adresse", url: "" },
      { tag: "document", name: "Avec adresse", url: "https://example.org/d" },
    ];
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links })).length,
    ).toBe(1);
  });

  /**
   * Scopings written before the name existed do not carry one. Reading them back
   * must return a valid link, which the display will name by its tag.
   */
  it("accepts a link without a name, written before the field existed", () => {
    const link = {
      tag: "issue_github",
      name: "",
      url: "https://github.com/ssk-it/ssk-canon",
    };
    const reread = rereadLinks(
      serializeScoping("2026-001", { ...base, links: [link] }),
    );
    expect(reread).toEqual([link]);
  });
});

describe("link kinds declared by the project", () => {
  it("keeps those of the configuration file", () => {
    expect(parseLinkTags(["carte_trello", "ticket_jira"])).toEqual([
      "carte_trello",
      "ticket_jira",
    ]);
  });

  // The scoping that carries out a roadmap item cites it with a `piste` link: the kind
  // must be offered from the start, otherwise everyone would enter it their own way
  // (scoping 2026-058, RG-piste-etat-deduit).
  it("offers the piste kind by default, with its label", () => {
    expect(DEFAULT_LINK_TAGS).toContain("piste");
    expect(LINK_TAG_LABEL["piste"]).toBe("Piste");
  });

  // Without a fallback, entering a link would offer no choice.
  it("returns the default ones when the project declares none", () => {
    expect(parseLinkTags(undefined)).toEqual(DEFAULT_LINK_TAGS);
    expect(parseLinkTags([])).toEqual(DEFAULT_LINK_TAGS);
  });
});

/**
 * The kind is entered freely: no list declared in advance covers the
 * resources all projects reference. It is nonetheless used as a key in
 * the frontmatter, hence the normalisation — without it, « Ticket Jira » would found
 * one more kind next to the « ticket_jira » already in use, and the offered
 * list would fill up with duplicates nothing would bring together.
 */
describe("normalisation of an entered kind", () => {
  it("leaves a known kind unchanged", () => {
    for (const t of DEFAULT_LINK_TAGS) expect(normalizeTag(t)).toBe(t);
  });

  /**
   * The input field shows the label, not the key: seeing « carte_trello »
   * appear after choosing « Carte Trello » would look like a
   * correction. The written key is recovered by normalisation, which assumes
   * every label leads back to it. A future label that did not — two
   * words separated by a hyphen, an accent carried by the key — would write a kind
   * different from the one chosen, and nothing would flag it at input.
   */
  it("brings each label back to the kind it designates", () => {
    for (const [tag, label] of Object.entries(LINK_TAG_LABEL)) {
      expect(normalizeTag(label)).toBe(tag);
    }
  });

  it("folds case, accents and separators", () => {
    expect(normalizeTag("Ticket Jira")).toBe("ticket_jira");
    expect(normalizeTag("Spécification détaillée")).toBe(
      "specification_detaillee",
    );
    expect(normalizeTag("note-de-cadrage")).toBe("note_de_cadrage");
    expect(normalizeTag("  Maquette  ")).toBe("maquette");
  });

  // A field carrying nothing keepable must not produce an empty kind
  // nor one made of underscores: the link would be written with a key nothing names.
  it("returns nothing when no useful character remains", () => {
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("—")).toBe("");
    expect(normalizeTag("!?")).toBe("");
  });
});

/** A scoping reduced to what the union looks at: its links. */
function scopingWithLinks(id: string, tags: readonly string[]): Scoping {
  return {
    id,
    links: tags.map((tag) => ({
      tag,
      name: "",
      url: `https://exemple.test/${tag}`,
    })),
  } as unknown as Scoping;
}

describe("kinds offered at input", () => {
  it("adds to the declared kinds those the scopings use", () => {
    expect(
      unionLinkTags(
        ["carte_trello", "document"],
        [
          scopingWithLinks("2026-001", ["ticket_jira"]),
          scopingWithLinks("2026-002", ["note"]),
        ],
      ),
    ).toEqual(["carte_trello", "document", "note", "ticket_jira"]);
  });

  // A declared kind that scopings use stays at its declared place:
  // seeing it twice in the list would suggest two kinds.
  it("does not repeat a kind both declared and used", () => {
    expect(
      unionLinkTags(
        ["carte_trello", "document"],
        [scopingWithLinks("2026-001", ["document"])],
      ),
    ).toEqual(["carte_trello", "document"]);
  });

  it("ignores links whose kind is empty", () => {
    expect(
      unionLinkTags(["document"], [scopingWithLinks("2026-001", ["", "  "])]),
    ).toEqual(["document"]);
  });
});

/**
 * Adding, correcting and removing all go through rewriting the whole
 * list: that is where address uniqueness is decided, and a written duplicate
 * would only show when re-reading the scoping, once committed.
 */
describe("list of a scoping's links", () => {
  const trello = {
    tag: "carte_trello",
    name: "La carte",
    url: "https://trello.com/c/abc",
  };
  const figma = {
    tag: "maquette",
    name: "L’écran",
    url: "https://figma.com/f/1",
  };

  it("adds a link after the existing ones", () => {
    expect(withLink([trello], figma)).toEqual([trello, figma]);
  });

  it("replaces the one that already carried this address rather than duplicating", () => {
    const resumed = { ...trello, name: "La carte, renommée" };
    expect(withLink([trello, figma], resumed)).toEqual([figma, resumed]);
  });

  /**
   * The rank holds: a link that jumps to the end of the row for a retouched name
   * would cast doubt on what was written.
   */
  it("corrects a link without moving it", () => {
    const corrected = { ...trello, name: "Un autre nom" };
    expect(withLinkModified([trello, figma], trello.url, corrected)).toEqual([
      corrected,
      figma,
    ]);
  });

  it("corrects a link's address, the old one serving to find it", () => {
    const moved = { ...trello, url: "https://trello.com/c/xyz" };
    expect(withLinkModified([trello, figma], trello.url, moved)).toEqual([
      moved,
      figma,
    ]);
  });

  /**
   * Correcting an address to that of another link in the list merges them into
   * one: keeping both would break the uniqueness that adding maintains.
   */
  it("does not leave two links on the same address after a correction", () => {
    const to = {
      tag: "maquette",
      name: "Finalement la maquette",
      url: figma.url,
    };
    expect(withLinkModified([trello, figma], trello.url, to)).toEqual([to]);
  });

  /**
   * The link may have disappeared between display and write — scoping delivered,
   * or taken up from another tab. Silently losing the input would be
   * worse than adding it.
   */
  it("adds the corrected link when the old address is no longer there", () => {
    expect(withLinkModified([figma], trello.url, trello)).toEqual([
      figma,
      trello,
    ]);
  });

  it("removes the link carrying the given address, and only that one", () => {
    expect(withoutLink([trello, figma], trello.url)).toEqual([figma]);
    expect(
      withoutLink([trello, figma], "https://example.org/inconnue"),
    ).toEqual([trello, figma]);
  });
});
