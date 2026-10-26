import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { ecrireReglages } from "./config-ecriture";

/**
 * Ce fichier se relit sur la plateforme, et ses commentaires expliquent à quoi
 * servent les réglages. Réécrire le document entier les détruirait — mesuré,
 * cinq disparaissent — d'où un remplacement par blocs, que ces cas éprouvent.
 */
const FICHIER = `# Configuration du projet — lue par l'application et par les Actions
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
  acces: "jeton_personnel" as const,
  identite: null,
  depotsCode: [],
};

const IDENTITE = {
  emetteur: "https://identite.exemple.fr/realms/projet",
  client: "mon-application",
  echange: "https://echange.exemple.fr",
};

describe("écriture des réglages dans le fichier de configuration", () => {
  it("retire les réglages du cycle, commentaires compris", () => {
    // Ils ne règlent plus rien depuis 2026-045 : les laisser dans le fichier
    // ferait croire que le cycle se configure encore.
    const out = ecrireReglages(FICHIER, {
      acces: "jeton_personnel",
      identite: null,
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
    const out = ecrireReglages(FICHIER, {
      acces: "jeton_personnel",
      identite: null,
      depotsCode: [],
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
    const out = ecrireReglages(FICHIER, {
      acces: "jeton_personnel",
      identite: null,
    });
    expect(out).toContain(
      "Un texte long, que reformater changerait\n    sans que personne l'ait demandé.",
    );
  });

  it("conserve les commentaires des blocs qu’il ne touche pas", () => {
    const out = ecrireReglages(FICHIER, {
      acces: "jeton_personnel",
      identite: null,
    });
    expect(out).toContain(
      "# Configuration du projet — lue par l'application et par les Actions",
    );
  });

  it("remplace le commentaire du bloc qu’il réécrit, sans le dupliquer", () => {
    const premier = ecrireReglages(FICHIER, {
      acces: "jeton_personnel",
      identite: null,
    });
    const second = ecrireReglages(premier, { acces: "relais", identite: null });
    const occurrences =
      second.split("Comment les rédacteurs obtiennent").length - 1;
    expect(occurrences).toBe(1);
  });

  it("ajoute les blocs absents plutôt que d’échouer", () => {
    const sans = "schema_version: 1\n\nprojet:\n  nom: Neuf\n";
    const out = ecrireReglages(sans, {
      acces: "jeton_personnel",
      identite: null,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBe("jeton_personnel");
    expect(data["projet"]).toEqual({ nom: "Neuf" });
  });

  it("termine toujours par une fin de ligne", () => {
    const out = ecrireReglages("schema_version: 1", {
      acces: "jeton_personnel",
      identite: null,
    });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("écrit le mode d’accès, et le relit", () => {
    const out = ecrireReglages(FICHIER, {
      acces: "relais",
      identite: null,
    });
    expect((load(out) as Record<string, unknown>)["acces"]).toBe("relais");
  });

  it("ajoute le mode d’accès à un fichier qui n’en a pas", () => {
    // les projets existants n'ont pas cette clé : l'ajouter, pas échouer
    const out = ecrireReglages(FICHIER, {
      acces: "identite_tierce",
      identite: IDENTITE,
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["acces"]).toBe("identite_tierce");
    expect(data["schema_version"]).toBe(1);
  });

  it("écrit le bloc identite, et le relit", () => {
    const out = ecrireReglages(FICHIER, {
      acces: "identite_tierce",
      identite: IDENTITE,
    });
    expect((load(out) as Record<string, unknown>)["identite"]).toEqual(
      IDENTITE,
    );
  });

  it("retire le bloc identite quand le mode ne l’emploie plus", () => {
    // le laisser décrirait une configuration que le projet n'applique plus
    const avec = ecrireReglages(FICHIER, {
      acces: "identite_tierce",
      identite: IDENTITE,
    });
    const sans = ecrireReglages(avec, {
      acces: "jeton_personnel",
      identite: null,
    });
    const data = load(sans) as Record<string, unknown>;
    expect(data["identite"]).toBeUndefined();
    expect(data["acces"]).toBe("jeton_personnel");
    expect(sans).not.toContain("Où les identités sont vérifiées");
  });

  it("ne laisse pas de trou en retirant un bloc absent", () => {
    const out = ecrireReglages(FICHIER, {
      acces: "jeton_personnel",
      identite: null,
      depotsCode: [],
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
    const out = ecrireReglages(FICHIER, {
      ...BASE,
      depotsCode: [
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
    const out = ecrireReglages(FICHIER, {
      ...BASE,
      depotsCode: [{ repo: "orga/depot", role: "" }],
    });
    expect(load(out)).toMatchObject({ depots_code: [{ repo: "orga/depot" }] });
  });

  it("retire le bloc quand plus aucun dépôt n’est déclaré", () => {
    // Le laisser en place décrirait un projet qui n'en déclare plus.
    const avec = ecrireReglages(FICHIER, {
      ...BASE,
      depotsCode: [{ repo: "orga/depot", role: "API" }],
    });
    const sans = ecrireReglages(avec, { ...BASE, depotsCode: [] });
    expect(sans).not.toContain("depots_code");
    expect(
      (load(sans) as Record<string, unknown>)["depots_code"],
    ).toBeUndefined();
  });

  it("n’abîme pas le reste du fichier", () => {
    const out = ecrireReglages(FICHIER, {
      ...BASE,
      depotsCode: [{ repo: "orga/depot", role: "API" }],
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
    const depotsCode = [{ repo: "orga/depot", role: "API" }];
    const premier = ecrireReglages(FICHIER, { ...BASE, depotsCode });
    const second = ecrireReglages(premier, { ...BASE, depotsCode });
    expect(second).toBe(premier);
  });
});
