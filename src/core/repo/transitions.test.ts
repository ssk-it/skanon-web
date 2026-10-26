import { describe, expect, it } from "vitest";
import { parseModeAcces, parseIdentite } from "./repo-loader";
import { estSurSaBranche } from "./redaction.service";

describe("mode d’accès déclaré par le projet", () => {
  it("retient le jeton personnel quand rien n’est déclaré", () => {
    // c'est le seul mode qui ne demande rien à héberger : un projet qui ne
    // règle rien doit fonctionner
    const { acces, anomalie } = parseModeAcces(undefined);
    expect(acces).toBe("jeton_personnel");
    expect(anomalie).toBeNull();
  });

  it("lit un mode connu", () => {
    expect(parseModeAcces("relais").acces).toBe("relais");
    expect(parseModeAcces("identite_tierce").acces).toBe("identite_tierce");
  });

  it("signale un mode inconnu plutôt que de le subir", () => {
    // le taire laisserait croire au projet qu'il applique un réglage qu'il
    // n'applique pas
    const { acces, anomalie } = parseModeAcces("oauth");
    expect(acces).toBe("jeton_personnel");
    expect(anomalie).toContain("oauth");
  });

  it("nomme les modes attendus dans l’anomalie", () => {
    expect(parseModeAcces("inventé").anomalie).toContain("jeton_personnel");
  });
});

describe("paramètres de l’identité tierce", () => {
  const COMPLET = {
    emetteur: "http://localhost:8088/realms/ssk-canon",
    client: "ssk-canon-pwa",
    echange: "http://localhost:8790",
  };

  it("rend null quand rien n’est déclaré", () => {
    const { identite, anomalies } = parseIdentite(undefined);
    expect(identite).toBeNull();
    expect(anomalies).toEqual([]);
  });

  it("lit un bloc complet", () => {
    expect(parseIdentite(COMPLET).identite).toEqual(COMPLET);
  });

  it("retire une barre finale, qui doublerait les séparateurs", () => {
    const { identite } = parseIdentite({
      ...COMPLET,
      emetteur: COMPLET.emetteur + "/",
    });
    expect(identite?.emetteur).toBe(COMPLET.emetteur);
  });

  it("rend null sur un bloc incomplet, plutôt qu’un objet à trous", () => {
    // la connexion échouerait de toute façon ; échouer au chargement laisse au
    // moins le référentiel lisible et l'anomalie visible
    const { identite, anomalies } = parseIdentite({
      emetteur: COMPLET.emetteur,
    });
    expect(identite).toBeNull();
    expect(anomalies.length).toBe(2);
  });

  it("nomme le champ manquant", () => {
    const { anomalies } = parseIdentite({ ...COMPLET, client: "" });
    expect(anomalies.some((a) => a.includes("identite.client"))).toBe(true);
  });

  it("refuse une adresse mal formée", () => {
    // elle se découvrirait sinon au moment de la connexion, loin de sa cause
    const { identite, anomalies } = parseIdentite({
      ...COMPLET,
      emetteur: "keycloak",
    });
    expect(identite).toBeNull();
    expect(anomalies.some((a) => a.includes("adresse valide"))).toBe(true);
  });

  it("n’exige pas que le client soit une adresse", () => {
    expect(parseIdentite(COMPLET).anomalies).toEqual([]);
  });
});

/**
 * Le cadrage se reconnaît à sa branche, jamais au nom de celle-ci.
 *
 * Ces cas viennent d'un défaut constaté : les transitions de statut étaient
 * invisibles sur tous les cadrages réels. Le test portait sur le préfixe
 * « cadrage/ » que l'application emploie à la création, alors que les branches
 * existantes suivent toutes « cadrage-<id> » — voir RG-branche-par-cadrage.
 */
describe("reconnaître la branche d’un cadrage", () => {
  it("reconnaît une branche nommée « cadrage-<id> »", () => {
    expect(estSurSaBranche("cadrage-2026-002", "main")).toBe(true);
  });

  it("reconnaît une branche nommée « cadrage/<id> »", () => {
    expect(estSurSaBranche("cadrage/2026-002", "main")).toBe(true);
  });

  it("reconnaît une branche nommée tout autrement", () => {
    expect(estSurSaBranche("brouillon-de-sebastien", "main")).toBe(true);
  });

  it("refuse la branche principale, quel que soit son nom", () => {
    expect(estSurSaBranche("main", "main")).toBe(false);
    expect(estSurSaBranche("master", "master")).toBe(false);
  });

  it("refuse quand la branche ou la principale est inconnue", () => {
    // proposer une transition qu'on ne peut pas situer vaut moins que rien
    expect(estSurSaBranche(undefined, "main")).toBe(false);
    expect(estSurSaBranche("cadrage-2026-002", "")).toBe(false);
  });
});
