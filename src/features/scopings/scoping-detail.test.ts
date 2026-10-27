import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
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
 * A scoping's page — RG-en-tete-cadrage and RG-sommaire-fiche-longue.
 *
 * The header tells at a glance whether the scoping changes the product or comments on it; the table of contents keeps in view what it changes, and groups what it merely mentions.
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

/** Mounts the page at the address of scoping `id`, the specification carrying `scopings`. */
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

/** The value of a header row, by its label. */
function row(el: HTMLElement, heading: string): HTMLElement | null {
  const dt = [...el.querySelectorAll(".identite dt")].find(
    (d) => d.textContent?.trim() === heading,
  );
  return (dt?.nextElementSibling as HTMLElement) ?? null;
}

describe("The impact count", () => {
  it("reads by operation, in order of what changes most", () => {
    expect(formatImpactCount(MIX, "fr")).toBe(
      "2 règles créées · 1 modifiée · 2 touchées",
    );
  });

  it("agrees in the singular and omits what is zero", () => {
    expect(formatImpactCount([impact("RG-a", "abroge")], "fr")).toBe(
      "1 règle abrogée",
    );
  });

  it("speaks of targets when not all are rules", () => {
    expect(
      formatImpactCount(
        [impact("RG-a", "cree"), impact("ADR-x", "cree", "adr")],
        "fr",
      ),
    ).toBe("2 cibles créées");
  });

  it("reads in English, with the noun once", () => {
    expect(formatImpactCount(MIX, "en")).toBe(
      "2 rules created · 1 modified · 2 touched",
    );
    expect(formatImpactCount([impact("ADR-x", "abroge", "adr")], "en")).toBe(
      "1 target repealed",
    );
  });

  it("says nothing of a scoping without impacts", () => {
    expect(formatImpactCount([], "fr")).toBe("");
  });
});

describe("A scoping's page", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("says in the header what the scoping changes", async () => {
    const el = await mountView(scoping("2026-001", { impacts: MIX }));

    expect(row(el, "Impacts")?.textContent?.trim()).toBe(
      "2 règles créées · 1 modifiée · 2 touchées",
    );
  });

  it("leads to the pull request of a scoping in progress", async () => {
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

  it("lists first what changes, then what is only touched", async () => {
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

  it("groups the « touche » impacts into one table-of-contents entry", async () => {
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

  it("does not open a grouping entry without a « touche » impact", async () => {
    const el = await mountView(
      scoping("2026-001", { impacts: [impact("RG-a", "cree")] }),
    );

    expect(el.querySelector('.sommaire a[href="#impacts-touches"]')).toBeNull();
    expect(el.querySelector("#impacts-touches")).toBeNull();
  });

  it("anchors and collapses an architecture impact by its target", async () => {
    const el = await mountView(
      scoping("2026-003", {
        impacts: [
          impact("ADR-x", "cree", "adr"),
          impact("ADR-y", "modifie", "adr"),
        ],
      }),
    );

    // the `rule` field is empty for an architecture target: using it gave both impacts the same anchor, and a collapse that collapsed nothing
    expect(
      [...el.querySelectorAll("#impacts .impact")].map((a) => a.id),
    ).toEqual(["impact-ADR-x", "impact-ADR-y"]);
    el.querySelector<HTMLButtonElement>("#impact-ADR-x .i-bascule")!.click();
    await nextTick();
    expect(el.querySelector("#corps-impact-ADR-x")).toBeNull();
    expect(el.querySelector("#corps-impact-ADR-y")).not.toBeNull();
  });

  describe("opened on a scoping in progress, before the branches are read", () => {
    /** The main branch is read; the requested scoping, though, lives on a branch. */
    async function mountWithout(loadingBranches: boolean): Promise<{
      el: HTMLElement;
      store: SpecificationStore;
    }> {
      const store = inject(SpecificationStore);
      store.loadingBranches.set(loadingBranches);
      const el = await mountAt("2026-002", [scoping("2026-001")]);
      return { el, store };
    }

    it("says that scopings in progress are being read, not that this one does not exist", async () => {
      const { el } = await mountWithout(true);

      expect(el.textContent).not.toContain("introuvable");
      expect(el.textContent).toContain("Lecture des cadrages en cours");
    });

    it("displays the scoping as soon as its branch is read", async () => {
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

    it("says it is not found once the branches are read without it", async () => {
      const { el } = await mountWithout(false);

      expect(el.textContent).toContain("Cadrage introuvable : 2026-002");
    });
  });
});

/**
 * RG-branches-survivantes-signalees: a branch still carrying a delivered
 * scoping is flagged on it, with its name. The flag informs, and forbids
 * nothing.
 */
describe("A stale branch", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("is flagged on the delivered scoping's page, with its name and a link", async () => {
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

  it("does not show when no branch remains", async () => {
    const el = await mountView(scoping("2026-032"));

    expect(el.querySelector(".branches-survivantes")).toBeNull();
  });
});

describe("A scoping's page, in English", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    inject(LocaleService).choice.set("en");
  });

  it("labels its header, its sections and its table of contents in English", async () => {
    const el = await mountView(
      scoping("2026-002", {
        status: "en_relecture",
        impacts: MIX,
        journey: "Un parcours.",
        provenance: {
          branch: "cadrage-2026-002",
          pullRequest: 9,
          draft: false,
        },
      }),
    );

    expect(el.querySelector(".retour")?.textContent?.trim()).toContain(
      "Scopings",
    );
    expect(
      [...el.querySelectorAll(".identite dt")].map((d) =>
        d.textContent?.trim(),
      ),
    ).toEqual(["Scoping", "Impacts", "Resources"]);
    expect(row(el, "Impacts")?.textContent?.trim()).toBe(
      "2 rules created · 1 modified · 2 touched",
    );
    expect(row(el, "Resources")?.textContent).toContain("Pull request #9");
    expect(row(el, "Resources")?.textContent).toContain("Add a link");
    expect(el.querySelector(".editer")?.textContent?.trim()).toContain(
      "Resume",
    );
    expect(
      [...el.querySelectorAll("h2.section")].map((h) => h.textContent?.trim()),
    ).toEqual(["Goal", "User journey", "Impacts on business rules"]);
    expect(el.querySelector("#impacts-touches h3")?.textContent).toBe(
      "2 rules touched",
    );
    const text = el.textContent ?? "";
    for (const french of ["Objectif", "Ressources", "Demande de fusion"])
      expect(text).not.toContain(french);
  });

  it("names the state of each decision in English", async () => {
    const el = await mountView(
      scoping("2026-001", {
        decisions: [
          {
            id: "01-a",
            title: "Où ranger ?",
            status: "retenue",
            chosenOption: "a",
            description: "",
            options: [
              {
                id: "a",
                title: "Ici",
                chosen: true,
                body: "**Retenue.** Simple.",
              },
            ],
            body: "",
          },
          {
            id: "02-b",
            title: "Quand ?",
            status: "annulee",
            chosenOption: null,
            description: "",
            options: [],
            body: "",
          },
        ],
      }),
    );

    expect(el.querySelector(".d-statut.retenue")?.textContent?.trim()).toBe(
      "settled",
    );
    expect(el.querySelector(".d-statut.annulee")?.textContent?.trim()).toBe(
      "cancelled",
    );
    expect(el.querySelector(".o-marque")?.textContent?.trim()).toBe("chosen");
    expect(el.querySelector(".p-titre")?.textContent?.trim()).toBe(
      "Settled decisions",
    );
  });

  it("flags a stale branch in English", async () => {
    const el = await mountView(
      scoping("2026-032", { staleBranches: ["cadrage-2026-032"] }),
    );

    const note = el.querySelector(".branches-survivantes")?.textContent ?? "";
    expect(note).toContain("still carries this scoping");
    expect(note).not.toContain("sans effet");
  });

  it("says in English that a scoping is being read, then not found", async () => {
    const store = inject(SpecificationStore);
    store.loadingBranches.set(true);
    const el = await mountAt("2026-002", [scoping("2026-001")]);
    expect(el.textContent).toContain("Reading scopings in progress…");

    store.loadingBranches.set(false);
    await nextTick();
    expect(el.textContent).toContain("Scoping not found: 2026-002");
  });
});
