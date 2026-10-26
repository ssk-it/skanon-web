import { describe, expect, it } from "vitest";
import { parseAccessMode, parseIdentity } from "./repo-loader";
import { isOnItsBranch } from "./redaction.service";

describe("mode d’accès déclaré par le projet", () => {
  it("retient le jeton personnel quand rien n’est déclaré", () => {
    // c'est le seul mode qui ne demande rien à héberger : un projet qui ne
    // règle rien doit fonctionner
    const { access, anomaly } = parseAccessMode(undefined);
    expect(access).toBe("jeton_personnel");
    expect(anomaly).toBeNull();
  });

  it("lit un mode connu", () => {
    expect(parseAccessMode("relais").access).toBe("relais");
    expect(parseAccessMode("identite_tierce").access).toBe("identite_tierce");
  });

  it("signale un mode inconnu plutôt que de le subir", () => {
    // le taire laisserait croire au projet qu'il applique un réglage qu'il
    // n'applique pas
    const { access, anomaly } = parseAccessMode("oauth");
    expect(access).toBe("jeton_personnel");
    expect(anomaly).toContain("oauth");
  });

  it("nomme les modes attendus dans l’anomalie", () => {
    expect(parseAccessMode("inventé").anomaly).toContain("jeton_personnel");
  });
});

describe("paramètres de l’identité tierce", () => {
  // Le bloc `identite` tel que le fichier de configuration l'écrit, en français, et ce que la lecture en fait.
  const BLOCK = {
    emetteur: "http://localhost:8088/realms/ssk-canon",
    client: "ssk-canon-pwa",
    echange: "http://localhost:8790",
  };
  const COMPLETE = {
    issuer: BLOCK.emetteur,
    client: BLOCK.client,
    exchange: BLOCK.echange,
  };

  it("rend null quand rien n’est déclaré", () => {
    const { identity, anomalies } = parseIdentity(undefined);
    expect(identity).toBeNull();
    expect(anomalies).toEqual([]);
  });

  it("lit un bloc complet", () => {
    expect(parseIdentity(BLOCK).identity).toEqual(COMPLETE);
  });

  it("retire une barre finale, qui doublerait les séparateurs", () => {
    const { identity } = parseIdentity({
      ...BLOCK,
      emetteur: BLOCK.emetteur + "/",
    });
    expect(identity?.issuer).toBe(COMPLETE.issuer);
  });

  it("rend null sur un bloc incomplet, plutôt qu’un objet à trous", () => {
    // la connexion échouerait de toute façon ; échouer au chargement laisse au
    // moins le référentiel lisible et l'anomalie visible
    const { identity, anomalies } = parseIdentity({
      emetteur: BLOCK.emetteur,
    });
    expect(identity).toBeNull();
    expect(anomalies.length).toBe(2);
  });

  it("nomme le champ manquant", () => {
    const { anomalies } = parseIdentity({ ...BLOCK, client: "" });
    expect(anomalies.some((a) => a.includes("identite.client"))).toBe(true);
  });

  it("refuse une adresse mal formée", () => {
    // elle se découvrirait sinon au moment de la connexion, loin de sa cause
    const { identity, anomalies } = parseIdentity({
      ...BLOCK,
      emetteur: "keycloak",
    });
    expect(identity).toBeNull();
    expect(anomalies.some((a) => a.includes("adresse valide"))).toBe(true);
  });

  it("n’exige pas que le client soit une adresse", () => {
    expect(parseIdentity(BLOCK).anomalies).toEqual([]);
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
    expect(isOnItsBranch("cadrage-2026-002", "main")).toBe(true);
  });

  it("reconnaît une branche nommée « cadrage/<id> »", () => {
    expect(isOnItsBranch("cadrage/2026-002", "main")).toBe(true);
  });

  it("reconnaît une branche nommée tout autrement", () => {
    expect(isOnItsBranch("brouillon-de-sebastien", "main")).toBe(true);
  });

  it("refuse la branche principale, quel que soit son nom", () => {
    expect(isOnItsBranch("main", "main")).toBe(false);
    expect(isOnItsBranch("master", "master")).toBe(false);
  });

  it("refuse quand la branche ou la principale est inconnue", () => {
    // proposer une transition qu'on ne peut pas situer vaut moins que rien
    expect(isOnItsBranch(undefined, "main")).toBe(false);
    expect(isOnItsBranch("cadrage-2026-002", "")).toBe(false);
  });
});
