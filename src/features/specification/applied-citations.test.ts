import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type ArchitectureDecision,
  type Citation,
  type Rule,
  type Specification,
} from "../../core/model/model";
import {
  CitedSpecifications,
  type CitedRead,
} from "../../core/repo/cited-specifications";
import { RepoConfig } from "../../core/repo/repo-config";
import { SpecificationStore } from "../../core/repo/specification.store";
import { createAppRouter } from "../../router";
import AppliedCitations from "./AppliedCitations.vue";

/**
 * What a rule or an architecture decision applies from another specification —
 * RG-regle-du-socle-citee, RG-citation-signalee-chez-le-citant.
 *
 * Each citation shows its prefixed identifier, the cited scoping taken into
 * account, a way to the target, and the state the check warns about. A cited
 * specification the reader cannot open reads as an identifier without content,
 * which says why — never as an error page.
 */
const SOCLE = { owner: "org", repo: "socle-cadrage" };

function cited(
  rules: Partial<Rule>[] = [],
  decisions: Partial<ArchitectureDecision>[] = [],
): CitedRead {
  return {
    kind: "lu",
    specification: {
      rules: new Map(rules.map((r) => [r.id!, r as Rule])),
      decisions: new Map(
        decisions.map((d) => [d.id!, d as ArchitectureDecision]),
      ),
    } as unknown as Specification,
  };
}

function citation(target: string, scoping = "2026-012"): Citation {
  return { prefix: "socle", target, scoping };
}

let answer: CitedRead;

async function mountCitations(citations: Citation[]) {
  const store = inject(SpecificationStore);
  store.specification.set({
    project: {
      name: "Appli",
      description: "",
      codeRepos: [],
      prefix: null,
      citedRepos: [{ prefix: "socle", repo: SOCLE }],
    },
    settings: { tokenProtection: "proposee", linkTags: DEFAULT_LINK_TAGS },
    domains: new Map(),
    features: new Map(),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
  });
  store.state.set("pret");
  const router = createAppRouter(createMemoryHistory());
  await router.push("/org/appli/referentiel");
  await router.isReady();
  const view = mount(AppliedCitations, {
    props: { citations },
    global: { plugins: [router] },
  });
  await flushPromises();
  return view;
}

describe("the citations of a rule", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "appli" });
    answer = cited();
    provide(CitedSpecifications, { read: () => Promise.resolve(answer) });
  });

  it("shows nothing when the rule applies nothing", async () => {
    const view = await mountCitations([]);

    expect(view.find("section").exists()).toBe(false);
  });

  it("names the target with its prefix, under a heading, in a list", async () => {
    answer = cited([
      { id: "RG-nommage-des-roles", status: "actif", modifiedBy: [] },
    ]);
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    expect(view.get("h2").text()).toBe("Applique");
    expect(view.findAll("ul > li")).toHaveLength(1);
    expect(view.get("li").text()).toContain("socle:RG-nommage-des-roles");
  });

  it("leads to the cited rule in the cited specification", async () => {
    answer = cited([
      { id: "RG-nommage-des-roles", status: "actif", modifiedBy: [] },
    ]);
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    const link = view.get("a.cible");
    expect(link.attributes("href")).toBe(
      "/org/socle-cadrage/referentiel/regle/RG-nommage-des-roles",
    );
    expect(link.text()).toBe("socle:RG-nommage-des-roles");
  });

  it("leads to a cited architecture decision", async () => {
    answer = cited(
      [],
      [{ id: "ADR-runners", status: "actif", modifiedBy: [] }],
    );
    const view = await mountCitations([citation("ADR-runners")]);

    expect(view.get("a.cible").attributes("href")).toBe(
      "/org/socle-cadrage/architecture/decision/ADR-runners",
    );
  });

  it("names the cited scoping taken into account, and leads to it", async () => {
    answer = cited([
      { id: "RG-nommage-des-roles", status: "actif", modifiedBy: [] },
    ]);
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    const scoping = view.get("a.cadrage");
    expect(scoping.text()).toBe("socle-2026-012");
    expect(scoping.attributes("href")).toBe(
      "/org/socle-cadrage/cadrages/2026-012",
    );
    expect(view.get("li").text()).toContain("pris en compte");
  });

  it("says the target is current", async () => {
    answer = cited([
      {
        id: "RG-nommage-des-roles",
        status: "actif",
        createdBy: "2026-003",
        modifiedBy: ["2026-012"],
      },
    ]);
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    expect(view.get(".etat").text()).toContain("À jour");
  });

  it("says the target was modified since, and by which scoping", async () => {
    answer = cited([
      {
        id: "RG-nommage-des-roles",
        status: "actif",
        createdBy: "2026-003",
        modifiedBy: ["2026-031"],
      },
    ]);
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    const state = view.get(".etat");
    expect(state.text()).toContain("Modifiée depuis");
    expect(state.get("a").text()).toBe("socle-2026-031");
    expect(state.get("a").attributes("href")).toBe(
      "/org/socle-cadrage/cadrages/2026-031",
    );
  });

  it("says the target is repealed, and still leads to it", async () => {
    answer = cited([
      { id: "RG-nommage-des-roles", status: "abroge", modifiedBy: [] },
    ]);
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    expect(view.get(".etat").text()).toContain("Abrogée");
    expect(view.find("a.cible").exists()).toBe(true);
  });

  it("says the target is missing, without a dead link", async () => {
    const view = await mountCitations([citation("RG-disparue")]);

    expect(view.get(".etat").text()).toContain("Absente");
    expect(view.find("a.cible").exists()).toBe(false);
    expect(view.get(".cible").text()).toBe("socle:RG-disparue");
  });

  it("reads as an identifier without content when the access does not open the cited specification", async () => {
    answer = { kind: "illisible", reason: "sans-acces" };
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    expect(view.find("a").exists()).toBe(false);
    expect(view.get(".cible").text()).toBe("socle:RG-nommage-des-roles");
    const state = view.get(".etat").text();
    expect(state).toContain("Non vérifiée");
    expect(state).toContain("org/socle-cadrage");
  });

  it("says when the cited specification did not respond", async () => {
    answer = { kind: "illisible", reason: "injoignable" };
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    expect(view.get(".etat").text()).toContain("n’a pas répondu");
  });

  it("says when the prefix designates no cited specification", async () => {
    const view = await mountCitations([
      { prefix: "autre", target: "RG-x", scoping: "2026-001" },
    ]);

    expect(view.find("a").exists()).toBe(false);
    expect(view.get(".etat").text()).toContain("« autre »");
  });

  it("announces the states in a status region present before they arrive", async () => {
    // 4.1.3: the states arrive after the page, without moving focus.
    let release!: (r: CitedRead) => void;
    provide(CitedSpecifications, {
      read: () => new Promise<CitedRead>((r) => (release = r)),
    });
    const view = await mountCitations([citation("RG-nommage-des-roles")]);

    const region = view.get("[role=status]");
    expect(region.text()).toContain("Lecture");
    release(cited());
    await flushPromises();
    expect(view.get("[role=status]").element).toBe(region.element);
  });
});
