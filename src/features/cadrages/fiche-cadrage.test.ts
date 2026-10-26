import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  TAGS_LIENS_PAR_DEFAUT,
  type Cadrage,
  type Impact,
  type NatureCible,
  type OperationImpact,
  type Referentiel,
} from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import CadragePage, { formatDecompteImpacts } from "./CadragePage.vue";

/**
 * La fiche d'un cadrage — RG-en-tete-cadrage et RG-sommaire-fiche-longue.
 *
 * L'en-tête dit d'un coup d'œil si le cadrage change le produit ou s'il le commente ; le sommaire garde en vue ce qu'il change, et regroupe ce qu'il ne fait que mentionner.
 */

function impact(
  cible: string,
  operation: OperationImpact,
  nature: NatureCible = "regle",
): Impact {
  return { cible, regle: nature === "regle" ? cible : "", nature, operation };
}

function cadrage(id: string, extra: Partial<Cadrage> = {}): Cadrage {
  return {
    id,
    titre: "Un cadrage",
    statut: "livree",
    domaines: [],
    liens: [],
    impacts: [],
    objectif: "Un objectif.",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    divers: [],
    ...extra,
  };
}

const MELANGE = [
  impact("RG-a", "cree"),
  impact("RG-t1", "touche"),
  impact("RG-b", "cree"),
  impact("RG-c", "modifie"),
  impact("RG-t2", "touche"),
];

function referentiel(cadrages: Cadrage[]): Referentiel {
  return {
    projet: { nom: "Test", description: "", depotsCode: [], prefixe: null },
    reglages: {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map(),
    fonctionnalites: new Map(),
    regles: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(cadrages.map((c) => [c.id, c])),
    anomalies: [],
  };
}

/** Monte la fiche à l'adresse du cadrage `id`, le référentiel portant `cadrages`. */
async function monterA(id: string, cadrages: Cadrage[]): Promise<HTMLElement> {
  const store = inject(ReferentielStore);
  store.referentiel.set(referentiel(cadrages));
  store.etat.set("pret");
  const router = createRouteur(createMemoryHistory());
  await router.push(`/org/depot/cadrages/${id}`);
  await router.isReady();
  const f = mount(CadragePage, { global: { plugins: [router] } });
  await flushPromises();
  return f.element.parentElement ?? (f.element as HTMLElement);
}

function monter(c: Cadrage): Promise<HTMLElement> {
  return monterA(c.id, [c]);
}

/** La valeur d'une rangée de l'en-tête, par son intitulé. */
function rangee(el: HTMLElement, intitule: string): HTMLElement | null {
  const dt = [...el.querySelectorAll(".identite dt")].find(
    (d) => d.textContent?.trim() === intitule,
  );
  return (dt?.nextElementSibling as HTMLElement) ?? null;
}

describe("Le décompte des impacts", () => {
  it("se lit par opération, dans l’ordre de ce qui change le plus", () => {
    expect(formatDecompteImpacts(MELANGE)).toBe(
      "2 règles créées · 1 modifiée · 2 touchées",
    );
  });

  it("accorde au singulier et omet ce qui est à zéro", () => {
    expect(formatDecompteImpacts([impact("RG-a", "abroge")])).toBe(
      "1 règle abrogée",
    );
  });

  it("parle de cibles quand toutes ne sont pas des règles", () => {
    expect(
      formatDecompteImpacts([
        impact("RG-a", "cree"),
        impact("ADR-x", "cree", "adr"),
      ]),
    ).toBe("2 cibles créées");
  });

  it("ne dit rien d’un cadrage sans impact", () => {
    expect(formatDecompteImpacts([])).toBe("");
  });
});

describe("La fiche d’un cadrage", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  it("dit dans l’en-tête ce que le cadrage change", async () => {
    const el = await monter(cadrage("2026-001", { impacts: MELANGE }));

    expect(rangee(el, "Impacts")?.textContent?.trim()).toBe(
      "2 règles créées · 1 modifiée · 2 touchées",
    );
  });

  it("mène à la demande de fusion d’un cadrage en cours", async () => {
    const el = await monter(
      cadrage("2026-002", {
        statut: "en_relecture",
        provenance: {
          branche: "cadrage-2026-002",
          pullRequest: 9,
          brouillon: false,
        },
      }),
    );

    const lien = rangee(el, "Ressources")?.querySelector<HTMLAnchorElement>(
      "a.demande",
    );
    expect(lien?.textContent).toContain("Demande de fusion #9");
    expect(lien?.href).toBe("https://github.com/org/depot/pull/9");
  });

  it("liste d’abord ce qui change, puis ce qui est seulement touché", async () => {
    const el = await monter(cadrage("2026-001", { impacts: MELANGE }));

    const ordre = [...el.querySelectorAll("#impacts .impact")].map((a) => a.id);
    expect(ordre).toEqual([
      "impact-RG-a",
      "impact-RG-b",
      "impact-RG-c",
      "impact-RG-t1",
      "impact-RG-t2",
    ]);
    const touches = el.querySelector("#impacts-touches");
    expect(touches?.querySelectorAll(".impact").length).toBe(2);
  });

  it("regroupe au sommaire les impacts « touche » en une entrée", async () => {
    const el = await monter(cadrage("2026-001", { impacts: MELANGE }));

    const entrees = [...el.querySelectorAll(".sommaire a")].map((a) => ({
      texte: a.textContent?.replace(/\s+/g, " ").trim(),
      cible: a.getAttribute("href"),
    }));
    const cibles = entrees.map((e) => e.cible);
    expect(cibles).toContain("#impact-RG-a");
    expect(cibles).not.toContain("#impact-RG-t1");
    expect(entrees.find((e) => e.cible === "#impacts-touches")?.texte).toBe(
      "2 règles touchées",
    );
  });

  it("n’ouvre pas d’entrée de regroupement sans impact « touche »", async () => {
    const el = await monter(
      cadrage("2026-001", { impacts: [impact("RG-a", "cree")] }),
    );

    expect(el.querySelector('.sommaire a[href="#impacts-touches"]')).toBeNull();
    expect(el.querySelector("#impacts-touches")).toBeNull();
  });

  it("ancre et replie un impact d’architecture par sa cible", async () => {
    const el = await monter(
      cadrage("2026-003", {
        impacts: [
          impact("ADR-x", "cree", "adr"),
          impact("ADR-y", "modifie", "adr"),
        ],
      }),
    );

    // le champ `regle` est vide pour une cible d'architecture : s'en servir donnait aux deux impacts la même ancre, et un repli qui ne repliait rien
    expect(
      [...el.querySelectorAll("#impacts .impact")].map((a) => a.id),
    ).toEqual(["impact-ADR-x", "impact-ADR-y"]);
    el.querySelector<HTMLButtonElement>("#impact-ADR-x .i-bascule")!.click();
    await nextTick();
    expect(el.querySelector("#corps-impact-ADR-x")).toBeNull();
    expect(el.querySelector("#corps-impact-ADR-y")).not.toBeNull();
  });

  describe("ouverte sur un cadrage en cours, avant que les branches soient lues", () => {
    /** La branche principale est lue ; le cadrage demandé, lui, vit sur une branche. */
    async function monterSansLui(branchesEnChargement: boolean): Promise<{
      el: HTMLElement;
      store: ReferentielStore;
    }> {
      const store = inject(ReferentielStore);
      store.branchesEnChargement.set(branchesEnChargement);
      const el = await monterA("2026-002", [cadrage("2026-001")]);
      return { el, store };
    }

    it("dit que les cadrages en cours se lisent, et non que celui-ci n’existe pas", async () => {
      const { el } = await monterSansLui(true);

      expect(el.textContent).not.toContain("introuvable");
      expect(el.textContent).toContain("Lecture des cadrages en cours");
    });

    it("affiche le cadrage dès que sa branche est lue", async () => {
      const { el, store } = await monterSansLui(true);

      store.referentiel.update((r) => ({
        ...r,
        cadrages: new Map(r.cadrages).set(
          "2026-002",
          cadrage("2026-002", {
            titre: "Sur sa branche",
            statut: "en_relecture",
          }),
        ),
      }));
      store.branchesEnChargement.set(false);
      await nextTick();

      expect(el.querySelector("h1")?.textContent).toBe("Sur sa branche");
    });

    it("le dit introuvable une fois les branches lues sans lui", async () => {
      const { el } = await monterSansLui(false);

      expect(el.textContent).toContain("Cadrage introuvable : 2026-002");
    });
  });
});

/**
 * RG-branches-survivantes-signalees : une branche qui porte encore un cadrage
 * livré est signalée sur lui, avec son nom. Le signalement informe, et
 * n'interdit rien.
 */
describe("Une branche survivante", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  it("se signale sur la fiche du cadrage livré, avec son nom et un lien", async () => {
    const el = await monter(
      cadrage("2026-032", { branchesSurvivantes: ["cadrage-2026-032"] }),
    );

    const note = el.querySelector(".branches-survivantes");
    expect(note?.textContent).toContain("cadrage-2026-032");
    expect(note?.textContent).toContain("sans effet");
    expect(note?.querySelector("a")?.getAttribute("href")).toBe(
      "https://github.com/org/depot/tree/cadrage-2026-032",
    );
  });

  it("ne se montre pas quand aucune branche ne survit", async () => {
    const el = await monter(cadrage("2026-032"));

    expect(el.querySelector(".branches-survivantes")).toBeNull();
  });
});
