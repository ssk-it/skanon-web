import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Impact,
  type TargetKind,
  type ImpactOperation,
  type Specification,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import ScopingPage, { formatImpactCount } from "./ScopingPage.vue";

/**
 * La fiche d'un cadrage — RG-en-tete-cadrage et RG-sommaire-fiche-longue.
 *
 * L'en-tête dit d'un coup d'œil si le cadrage change le produit ou s'il le commente ; le sommaire garde en vue ce qu'il change, et regroupe ce qu'il ne fait que mentionner.
 */

function impact(
  target: string,
  operation: ImpactOperation,
  kind: TargetKind = "regle",
): Impact {
  return { target, rule: kind === "regle" ? target : "", kind, operation };
}

function scoping(id: string, extra: Partial<Scoping> = {}): Scoping {
  return {
    id,
    title: "Un cadrage",
    status: "livree",
    domains: [],
    links: [],
    impacts: [],
    goal: "Un objectif.",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
    ...extra,
  };
}

const MIX = [
  impact("RG-a", "cree"),
  impact("RG-t1", "touche"),
  impact("RG-b", "cree"),
  impact("RG-c", "modifie"),
  impact("RG-t2", "touche"),
];

function specification(scopings: Scoping[]): Specification {
  return {
    project: { name: "Test", description: "", codeRepos: [], prefix: null },
    settings: {
      access: "jeton_personnel",
      identity: null,
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map(),
    features: new Map(),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(scopings.map((c) => [c.id, c])),
    anomalies: [],
  };
}

/** Monte la fiche à l'adresse du cadrage `id`, le référentiel portant `cadrages`. */
async function mountAt(id: string, scopings: Scoping[]): Promise<HTMLElement> {
  const store = inject(SpecificationStore);
  store.specification.set(specification(scopings));
  store.state.set("pret");
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/org/depot/cadrages/${id}`);
  await router.isReady();
  const f = mount(ScopingPage, { global: { plugins: [router] } });
  await flushPromises();
  return f.element.parentElement ?? (f.element as HTMLElement);
}

function mountView(c: Scoping): Promise<HTMLElement> {
  return mountAt(c.id, [c]);
}

/** La valeur d'une rangée de l'en-tête, par son intitulé. */
function row(el: HTMLElement, heading: string): HTMLElement | null {
  const dt = [...el.querySelectorAll(".identite dt")].find(
    (d) => d.textContent?.trim() === heading,
  );
  return (dt?.nextElementSibling as HTMLElement) ?? null;
}

describe("Le décompte des impacts", () => {
  it("se lit par opération, dans l’ordre de ce qui change le plus", () => {
    expect(formatImpactCount(MIX)).toBe(
      "2 règles créées · 1 modifiée · 2 touchées",
    );
  });

  it("accorde au singulier et omet ce qui est à zéro", () => {
    expect(formatImpactCount([impact("RG-a", "abroge")])).toBe(
      "1 règle abrogée",
    );
  });

  it("parle de cibles quand toutes ne sont pas des règles", () => {
    expect(
      formatImpactCount([
        impact("RG-a", "cree"),
        impact("ADR-x", "cree", "adr"),
      ]),
    ).toBe("2 cibles créées");
  });

  it("ne dit rien d’un cadrage sans impact", () => {
    expect(formatImpactCount([])).toBe("");
  });
});

describe("La fiche d’un cadrage", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("dit dans l’en-tête ce que le cadrage change", async () => {
    const el = await mountView(scoping("2026-001", { impacts: MIX }));

    expect(row(el, "Impacts")?.textContent?.trim()).toBe(
      "2 règles créées · 1 modifiée · 2 touchées",
    );
  });

  it("mène à la demande de fusion d’un cadrage en cours", async () => {
    const el = await mountView(
      scoping("2026-002", {
        status: "en_relecture",
        provenance: {
          branch: "cadrage-2026-002",
          pullRequest: 9,
          draft: false,
        },
      }),
    );

    const link = row(el, "Ressources")?.querySelector<HTMLAnchorElement>(
      "a.demande",
    );
    expect(link?.textContent).toContain("Demande de fusion #9");
    expect(link?.href).toBe("https://github.com/org/depot/pull/9");
  });

  it("liste d’abord ce qui change, puis ce qui est seulement touché", async () => {
    const el = await mountView(scoping("2026-001", { impacts: MIX }));

    const order = [...el.querySelectorAll("#impacts .impact")].map((a) => a.id);
    expect(order).toEqual([
      "impact-RG-a",
      "impact-RG-b",
      "impact-RG-c",
      "impact-RG-t1",
      "impact-RG-t2",
    ]);
    const touched = el.querySelector("#impacts-touches");
    expect(touched?.querySelectorAll(".impact").length).toBe(2);
  });

  it("regroupe au sommaire les impacts « touche » en une entrée", async () => {
    const el = await mountView(scoping("2026-001", { impacts: MIX }));

    const entries = [...el.querySelectorAll(".sommaire a")].map((a) => ({
      text: a.textContent?.replace(/\s+/g, " ").trim(),
      target: a.getAttribute("href"),
    }));
    const targets = entries.map((e) => e.target);
    expect(targets).toContain("#impact-RG-a");
    expect(targets).not.toContain("#impact-RG-t1");
    expect(entries.find((e) => e.target === "#impacts-touches")?.text).toBe(
      "2 règles touchées",
    );
  });

  it("n’ouvre pas d’entrée de regroupement sans impact « touche »", async () => {
    const el = await mountView(
      scoping("2026-001", { impacts: [impact("RG-a", "cree")] }),
    );

    expect(el.querySelector('.sommaire a[href="#impacts-touches"]')).toBeNull();
    expect(el.querySelector("#impacts-touches")).toBeNull();
  });

  it("ancre et replie un impact d’architecture par sa cible", async () => {
    const el = await mountView(
      scoping("2026-003", {
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
    async function mountWithout(loadingBranches: boolean): Promise<{
      el: HTMLElement;
      store: SpecificationStore;
    }> {
      const store = inject(SpecificationStore);
      store.loadingBranches.set(loadingBranches);
      const el = await mountAt("2026-002", [scoping("2026-001")]);
      return { el, store };
    }

    it("dit que les cadrages en cours se lisent, et non que celui-ci n’existe pas", async () => {
      const { el } = await mountWithout(true);

      expect(el.textContent).not.toContain("introuvable");
      expect(el.textContent).toContain("Lecture des cadrages en cours");
    });

    it("affiche le cadrage dès que sa branche est lue", async () => {
      const { el, store } = await mountWithout(true);

      store.specification.update((r) => ({
        ...r,
        scopings: new Map(r.scopings).set(
          "2026-002",
          scoping("2026-002", {
            title: "Sur sa branche",
            status: "en_relecture",
          }),
        ),
      }));
      store.loadingBranches.set(false);
      await nextTick();

      expect(el.querySelector("h1")?.textContent).toBe("Sur sa branche");
    });

    it("le dit introuvable une fois les branches lues sans lui", async () => {
      const { el } = await mountWithout(false);

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
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("se signale sur la fiche du cadrage livré, avec son nom et un lien", async () => {
    const el = await mountView(
      scoping("2026-032", { staleBranches: ["cadrage-2026-032"] }),
    );

    const note = el.querySelector(".branches-survivantes");
    expect(note?.textContent).toContain("cadrage-2026-032");
    expect(note?.textContent).toContain("sans effet");
    expect(note?.querySelector("a")?.getAttribute("href")).toBe(
      "https://github.com/org/depot/tree/cadrage-2026-032",
    );
  });

  it("ne se montre pas quand aucune branche ne survit", async () => {
    const el = await mountView(scoping("2026-032"));

    expect(el.querySelector(".branches-survivantes")).toBeNull();
  });
});
