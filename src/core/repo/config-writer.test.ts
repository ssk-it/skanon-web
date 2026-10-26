import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { writeSettings } from "./config-writer";

/**
 * Ce fichier se relit sur la plateforme, et ses commentaires expliquent à quoi
 * servent les réglages. Réécrire le document entier les détruirait — mesuré,
 * cinq disparaissent — d'où un remplacement par blocs, que ces cas éprouvent.
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
// Le même bloc, tel que le fichier de configuration l'écrit.
const IDENTITY_BLOCK = {
  emetteur: IDENTITY.issuer,
  client: IDENTITY.client,
  echange: IDENTITY.exchange,
};

describe("écriture des réglages dans le fichier de configuration", () => {
  it("retire les réglages du cycle, commentaires compris", () => {
    // Ils ne règlent plus rien depuis 2026-045 : les laisser dans le fichier
    // ferait croire que le cycle se configure encore.
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["transitions"]).toBeUndefined();
    expect(data["reflet_demande_fusion"]).toBeUndefined();
    expect(out).not.toContain("Transitions de statut");
    expect(out).not.toContain("La demande de fusion reflète");
    // le bloc qui suivait reste en place
    expect(data["attachments"]).toEqual({
      provider: "scaleway",
      bucket: "ssk-canon-demo",
    });
  });

  it("conserve ce que l’application ne règle pas", () => {
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

  it("ne touche pas aux textes longs des autres blocs", () => {
    // js-yaml les reformaterait en réécrivant le document entier
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    expect(out).toContain(
      "Un texte long, que reformater changerait\n    sans que personne l'ait demandé.",
    );
  });

  it("conserve les commentaires des blocs qu’il ne touche pas", () => {
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    expect(out).toContain(
      "# Configuration du projet — lue par l'application et par les Actions",
    );
  });

  it("remplace le commentaire du bloc qu’il réécrit, sans le dupliquer", () => {
    const first = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
    });
    const second = writeSettings(first, { access: "relais", identity: null });
    const occurrences =
      second.split("Comment les rédacteurs obtiennent").length - 1;
    expect(occurrences).toBe(1);
  });

  it("ajoute les blocs absents plutôt que d’échouer", () => {
    const without = "schema_version: 1\n\nprojet:\n  nom: Neuf\n";
    const out = writeSettings(without, {
      access: "jeton_personnel",
      identity: null,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBe("jeton_personnel");
    expect(data["projet"]).toEqual({ nom: "Neuf" });
  });

  it("termine toujours par une fin de ligne", () => {
    const out = writeSettings("schema_version: 1", {
      access: "jeton_personnel",
      identity: null,
    });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("écrit le mode d’accès, et le relit", () => {
    const out = writeSettings(FILE, {
      access: "relais",
      identity: null,
    });
    expect((load(out) as Record<string, unknown>)["acces"]).toBe("relais");
  });

  it("ajoute le mode d’accès à un fichier qui n’en a pas", () => {
    // les projets existants n'ont pas cette clé : l'ajouter, pas échouer
    const out = writeSettings(FILE, {
      access: "identite_tierce",
      identity: IDENTITY,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBe("identite_tierce");
    expect(data["schema_version"]).toBe(1);
  });

  it("écrit le bloc identite, et le relit", () => {
    const out = writeSettings(FILE, {
      access: "identite_tierce",
      identity: IDENTITY,
    });
    expect((load(out) as Record<string, unknown>)["identite"]).toEqual(
      IDENTITY_BLOCK,
    );
  });

  it("retire le bloc identite quand le mode ne l’emploie plus", () => {
    // le laisser décrirait une configuration que le projet n'applique plus
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

  it("ne laisse pas de trou en retirant un bloc absent", () => {
    const out = writeSettings(FILE, {
      access: "jeton_personnel",
      identity: null,
      codeRepos: [],
    });
    expect((load(out) as Record<string, unknown>)["schema_version"]).toBe(1);
  });
});

/**
 * Les dépôts de code se saisissent depuis l'application, et ce qu'elle écrit est
 * commité dans le dépôt de quelqu'un. Ces cas éprouvent que le bloc produit se
 * relit, et que le reste du fichier n'en souffre pas.
 */
describe("écriture des dépôts de code", () => {
  it("écrit un bloc que la lecture retrouve", () => {
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

  it("omet le rôle quand il n’est pas renseigné", () => {
    const out = writeSettings(FILE, {
      ...BASE,
      codeRepos: [{ repo: "orga/depot", role: "" }],
    });
    expect(load(out)).toMatchObject({ depots_code: [{ repo: "orga/depot" }] });
  });

  it("retire le bloc quand plus aucun dépôt n’est déclaré", () => {
    // Le laisser en place décrirait un projet qui n'en déclare plus.
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

  it("n’abîme pas le reste du fichier", () => {
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

  it("reste stable d’une écriture à l’autre", () => {
    // Réécrire à l'identique ne doit rien changer : sinon chaque proposition de
    // réglages ferait apparaître un écart que personne n'a demandé.
    const codeRepos = [{ repo: "orga/depot", role: "API" }];
    const first = writeSettings(FILE, { ...BASE, codeRepos });
    const second = writeSettings(first, { ...BASE, codeRepos });
    expect(second).toBe(first);
  });
});
