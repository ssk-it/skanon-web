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

/** Relit ce qui vient d'être écrit, en échouant clairement s'il est illisible. */
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
 * Un lien écrit doit se relire à l'identique. L'écart ne se verrait qu'au
 * rechargement, une fois le fichier commité — le pire moment pour l'apprendre.
 */
describe("écriture des liens externes", () => {
  it("rend un lien tel qu’il a été saisi", () => {
    const link = {
      tag: "issue_github",
      name: "Migration du stockage",
      url: "https://github.com/ssk-it/ssk-canon/issues/12",
    };
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links: [link] })),
    ).toEqual([link]);
  });

  it("échappe un nom que YAML lirait de travers", () => {
    // Un « : » suivi d'une espace ferait du nom une clé, et le lien deviendrait
    // illisible — un titre en porte presque toujours un.
    const link = {
      tag: "document",
      name: "Stockage : ce qu’on retient",
      url: "https://example.org/n",
    };
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links: [link] })),
    ).toEqual([link]);
  });

  it("rend une liste vide quand le cadrage ne porte aucun lien", () => {
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links: [] })),
    ).toEqual([]);
  });

  /**
   * Le défaut le plus coûteux : un cadrage réécrit sans que ses liens soient
   * relus les perdrait en silence, et rien dans l'écran ne le dirait.
   */
  it("conserve les liens existants au fil des réécritures", () => {
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
   * La forme doit être celle des liens écrits à la main dans le référentiel.
   * En produire une autre ferait apparaître en relecture des lignes modifiées
   * là où personne n'a rien touché — le bruit qui décrédibilise une revue.
   */
  it("écrit un lien sous la forme qu’a le référentiel", () => {
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

  it("écarte un lien sans adresse : il ne mènerait nulle part", () => {
    const links = [
      { tag: "document", name: "Sans adresse", url: "" },
      { tag: "document", name: "Avec adresse", url: "https://example.org/d" },
    ];
    expect(
      rereadLinks(serializeScoping("2026-001", { ...base, links })).length,
    ).toBe(1);
  });

  /**
   * Les cadrages écrits avant que le nom existe n'en portent pas. Les relire
   * doit rendre un lien valide, que l'affichage nommera par son tag.
   */
  it("accepte un lien sans nom, écrit avant que le champ existe", () => {
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

describe("natures de lien déclarées par le projet", () => {
  it("retient celles du fichier de configuration", () => {
    expect(parseLinkTags(["carte_trello", "ticket_jira"])).toEqual([
      "carte_trello",
      "ticket_jira",
    ]);
  });

  // Le cadrage qui réalise une piste la cite par un lien `piste` : la nature
  // doit se proposer d'emblée, sans quoi chacun la saisirait à sa façon
  // (cadrage 2026-058, RG-piste-etat-deduit).
  it("propose la nature piste par défaut, avec son libellé", () => {
    expect(DEFAULT_LINK_TAGS).toContain("piste");
    expect(LINK_TAG_LABEL["piste"]).toBe("Piste");
  });

  // Sans repli, la saisie d'un lien n'offrirait aucun choix.
  it("rend celles par défaut quand le projet n’en déclare aucune", () => {
    expect(parseLinkTags(undefined)).toEqual(DEFAULT_LINK_TAGS);
    expect(parseLinkTags([])).toEqual(DEFAULT_LINK_TAGS);
  });
});

/**
 * La nature se saisit librement : aucune liste déclarée d'avance ne couvre les
 * ressources que tous les projets référencent. Elle sert pourtant de clé dans
 * le frontmatter, d'où la normalisation — sans elle, « Ticket Jira » fonderait
 * une nature de plus à côté du « ticket_jira » déjà employé, et la liste
 * proposée se peuplerait de doublons que rien ne rapprocherait.
 */
describe("normalisation d’une nature saisie", () => {
  it("laisse une nature connue inchangée", () => {
    for (const t of DEFAULT_LINK_TAGS) expect(normalizeTag(t)).toBe(t);
  });

  /**
   * Le champ de saisie montre le libellé, non la clé : voir « carte_trello »
   * s'inscrire après avoir choisi « Carte Trello » ferait croire à une
   * correction. La clé écrite s'en retrouve par normalisation, ce qui suppose
   * que chaque libellé y ramène. Un libellé futur qui ne le ferait pas — deux
   * mots qu'un tiret sépare, un accent porté par la clé — écrirait une nature
   * différente de celle choisie, et rien ne le signalerait à la saisie.
   */
  it("ramène chaque libellé à la nature qu’il désigne", () => {
    for (const [tag, label] of Object.entries(LINK_TAG_LABEL)) {
      expect(normalizeTag(label)).toBe(tag);
    }
  });

  it("replie la casse, les accents et les séparateurs", () => {
    expect(normalizeTag("Ticket Jira")).toBe("ticket_jira");
    expect(normalizeTag("Spécification détaillée")).toBe(
      "specification_detaillee",
    );
    expect(normalizeTag("note-de-cadrage")).toBe("note_de_cadrage");
    expect(normalizeTag("  Maquette  ")).toBe("maquette");
  });

  // Le champ ne portant rien de retenable ne doit pas produire une nature vide
  // ni faite de soulignés : le lien s'écrirait avec une clé que rien ne nomme.
  it("ne rend rien quand il ne reste aucun caractère utile", () => {
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("—")).toBe("");
    expect(normalizeTag("!?")).toBe("");
  });
});

/** Un cadrage réduit à ce que l'union regarde : ses liens. */
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

describe("natures proposées à la saisie", () => {
  it("ajoute aux natures déclarées celles que les cadrages emploient", () => {
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

  // Une nature déclarée que des cadrages emploient reste à sa place déclarée :
  // la voir deux fois dans la liste laisserait croire à deux natures.
  it("ne répète pas une nature à la fois déclarée et employée", () => {
    expect(
      unionLinkTags(
        ["carte_trello", "document"],
        [scopingWithLinks("2026-001", ["document"])],
      ),
    ).toEqual(["carte_trello", "document"]);
  });

  it("ignore les liens dont la nature est vide", () => {
    expect(
      unionLinkTags(["document"], [scopingWithLinks("2026-001", ["", "  "])]),
    ).toEqual(["document"]);
  });
});

/**
 * Ajout, correction et retrait passent tous par la réécriture de la liste
 * entière : c'est là que se joue l'unicité des adresses, et un doublon écrit
 * ne se verrait qu'à la relecture du cadrage, une fois commité.
 */
describe("liste des liens d’un cadrage", () => {
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

  it("ajoute un lien à la suite des existants", () => {
    expect(withLink([trello], figma)).toEqual([trello, figma]);
  });

  it("remplace celui qui portait déjà cette adresse plutôt que de doubler", () => {
    const resumed = { ...trello, name: "La carte, renommée" };
    expect(withLink([trello, figma], resumed)).toEqual([figma, resumed]);
  });

  /**
   * Le rang tient : un lien qui saute en fin de rangée pour un nom retouché
   * ferait douter de ce qui a été écrit.
   */
  it("corrige un lien sans le déplacer", () => {
    const corrected = { ...trello, name: "Un autre nom" };
    expect(withLinkModified([trello, figma], trello.url, corrected)).toEqual([
      corrected,
      figma,
    ]);
  });

  it("corrige l’adresse d’un lien, l’ancienne servant à le retrouver", () => {
    const moved = { ...trello, url: "https://trello.com/c/xyz" };
    expect(withLinkModified([trello, figma], trello.url, moved)).toEqual([
      moved,
      figma,
    ]);
  });

  /**
   * Corriger une adresse pour celle d'un autre lien de la liste les fond en un
   * seul : les garder tous deux romprait l'unicité que l'ajout maintient.
   */
  it("ne laisse pas deux liens sur une même adresse après correction", () => {
    const to = {
      tag: "maquette",
      name: "Finalement la maquette",
      url: figma.url,
    };
    expect(withLinkModified([trello, figma], trello.url, to)).toEqual([to]);
  });

  /**
   * Le lien a pu disparaître entre l'affichage et l'écriture — cadrage livré,
   * ou repris depuis un autre onglet. Perdre la saisie sans rien dire serait
   * pire que de l'ajouter.
   */
  it("ajoute le lien corrigé quand l’ancienne adresse n’est plus là", () => {
    expect(withLinkModified([figma], trello.url, trello)).toEqual([
      figma,
      trello,
    ]);
  });

  it("retire le lien portant l’adresse donnée, et lui seul", () => {
    expect(withoutLink([trello, figma], trello.url)).toEqual([figma]);
    expect(
      withoutLink([trello, figma], "https://example.org/inconnue"),
    ).toEqual([trello, figma]);
  });
});
