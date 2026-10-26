import { describe, expect, it } from "vitest";
import { domainRanks, domainStyle, domainHue } from "./couleur-domaine";

/** Les domaines du dépôt de référence. */
const REFERENCE = ["acces", "cadrage", "persistance", "referentiel"];

describe("teinteDomaine", () => {
  it("rend la même teinte pour le même ensemble de domaines", () => {
    expect(domainHue("acces", REFERENCE)).toBe(domainHue("acces", REFERENCE));
  });

  it("donne une teinte distincte à chaque domaine", () => {
    // Le défaut de la première version : « persistance » et « referentiel »
    // tombaient sur la même couleur.
    const hues = REFERENCE.map((id) => domainHue(id, REFERENCE));
    expect(new Set(hues).size).toBe(REFERENCE.length);
  });

  it("reste distinct jusqu’à un nombre élevé de domaines", () => {
    const many = Array.from({ length: 24 }, (_, i) => `domaine-${i}`);
    const hues = many.map((id) => domainHue(id, many));
    expect(new Set(hues).size).toBe(many.length);
  });

  it("ne dépend pas de l’ordre de chargement", () => {
    // L'arborescence renvoyée par la plateforme n'a pas d'ordre garanti : une
    // couleur qui en dépendrait changerait sans raison visible.
    const mix = ["referentiel", "acces", "persistance", "cadrage"];
    for (const id of REFERENCE) {
      expect(domainHue(id, mix)).toBe(domainHue(id, REFERENCE));
    }
  });

  it("garde sa teinte quand un doublon apparaît dans la liste", () => {
    const withDuplicate = [...REFERENCE, "acces"];
    for (const id of REFERENCE) {
      expect(domainHue(id, withDuplicate)).toBe(domainHue(id, REFERENCE));
    }
  });

  it("reste dans la roue des teintes", () => {
    for (const id of REFERENCE) {
      const t = domainHue(id, REFERENCE);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(360);
    }
  });

  it("évite la bande des jaunes verdâtres, quel que soit le nombre de domaines", () => {
    // Vu à l'écran : un domaine tombé sur 115° rendait un olive terne à côté
    // de ses voisins. Aucun test de DOM ne l'aurait montré.
    for (let total = 1; total <= 40; total++) {
      const ids = Array.from(
        { length: total },
        (_, i) => `d-${String(i).padStart(2, "0")}`,
      );
      for (const id of ids) {
        const t = domainHue(id, ids);
        // La borne haute est atteignable : c'est le premier degré lisible,
        // celui d'où repart la répartition.
        expect(t < 95 || t >= 155).toBe(true);
      }
    }
  });

  it("espace les teintes autant que la roue le permet", () => {
    const ids = ["a", "b", "c", "d"];
    const hues = ids.map((id) => domainHue(id, ids)).sort((x, y) => x - y);
    // Quatre domaines sur une roue de 300° utiles : au moins 60° d'écart.
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i] - hues[i - 1]).toBeGreaterThanOrEqual(60);
    }
  });

  it("rend une teinte neutre pour un domaine absent de la liste", () => {
    // Un rattachement vers un fichier manquant ne doit pas emprunter la couleur
    // d'un autre domaine.
    expect(domainHue("inconnu", REFERENCE)).toBe(235);
  });

  it("ne se divise pas par zéro sur un dépôt sans domaine", () => {
    expect(Number.isFinite(domainHue("quelconque", []))).toBe(true);
  });
});

describe("rangsDomaines", () => {
  it("ordonne par identifiant, non par ordre d’arrivée", () => {
    const ranks = domainRanks(["referentiel", "acces", "cadrage"]);
    expect(ranks.get("acces")).toBe(0);
    expect(ranks.get("cadrage")).toBe(1);
    expect(ranks.get("referentiel")).toBe(2);
  });

  it("dédoublonne", () => {
    expect(domainRanks(["a", "a", "b"]).size).toBe(2);
  });
});

describe("styleDomaine", () => {
  it("porte la teinte dans chaque variable", () => {
    const style = domainStyle("cadrage", REFERENCE);
    const t = domainHue("cadrage", REFERENCE);
    expect(style["--pc-domaine-h"]).toBe(`${t}`);
    expect(style["--pc-domaine"]).toContain(`${t}`);
    expect(style["--pc-domaine-bg"]).toContain(`${t}`);
  });
});
