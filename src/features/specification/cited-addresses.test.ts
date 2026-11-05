import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, RouterView, type Router } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type ArchitectureDecision,
  type Rule,
} from "../../core/model/model";
import { CitedSpecifications } from "../../core/repo/cited-specifications";
import { RepoConfig } from "../../core/repo/repo-config";
import { SpecificationStore } from "../../core/repo/specification.store";
import { createAppRouter } from "../../router";

/**
 * A prefixed identifier is accepted in an address — RG-prefixe-projet, as
 * scoping 2026-068 amends it.
 *
 * The prefix of a cited specification leads there: copying
 * `socle:RG-nommage-des-roles` out of a citation and opening it under the
 * citing project lands on the cited rule.
 */
const RULE: Rule = {
  id: "RG-acces",
  status: "actif",
  features: [],
  statement: "Les rôles suivent la convention du socle.",
  applies: [
    { prefix: "socle", target: "RG-nommage-des-roles", scoping: "2026-012" },
  ],
  createdBy: null,
  modifiedBy: [],
};

const DECISION: ArchitectureDecision = {
  id: "ADR-runners",
  status: "actif",
  statement: "Les runners désignés.",
  applies: [
    { prefix: "socle", target: "ADR-runners-designes", scoping: "2026-004" },
  ],
  createdBy: null,
  modifiedBy: [],
};

let router: Router;

async function open(address: string) {
  const store = inject(SpecificationStore);
  store.specification.set({
    project: {
      name: "Appli",
      description: "",
      codeRepos: [],
      prefix: "APP",
      citedRepos: [
        { prefix: "socle", repo: { owner: "org", repo: "socle-cadrage" } },
      ],
    },
    settings: { tokenProtection: "proposee", linkTags: DEFAULT_LINK_TAGS },
    domains: new Map(),
    features: new Map(),
    rules: new Map([[RULE.id, RULE]]),
    decisions: new Map([[DECISION.id, DECISION]]),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
  });
  store.state.set("pret");
  router = createAppRouter(createMemoryHistory());
  await router.push(address);
  await router.isReady();
  const view = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return view;
}

describe("addresses carrying a cited prefix", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "appli" });
    provide(CitedSpecifications, {
      read: () => new Promise(() => undefined),
    });
  });

  it("leads a cited rule to the cited specification", async () => {
    await open("/org/appli/referentiel/regle/socle:RG-nommage-des-roles");

    expect(router.currentRoute.value.path).toBe(
      "/org/socle-cadrage/referentiel/regle/RG-nommage-des-roles",
    );
  });

  it("leads a cited architecture decision to the cited specification", async () => {
    await open("/org/appli/architecture/decision/socle:ADR-runners-designes");

    expect(router.currentRoute.value.path).toBe(
      "/org/socle-cadrage/architecture/decision/ADR-runners-designes",
    );
  });

  it("leads a cited scoping to the cited specification", async () => {
    await open("/org/appli/cadrages/socle-2026-012");

    expect(router.currentRoute.value.path).toBe(
      "/org/socle-cadrage/cadrages/2026-012",
    );
  });

  it("shows a rule under the project's own prefix", async () => {
    const view = await open("/org/appli/referentiel/regle/APP:RG-acces");

    expect(router.currentRoute.value.path).toBe(
      "/org/appli/referentiel/regle/APP:RG-acces",
    );
    expect(view.text()).toContain("Les rôles suivent la convention du socle.");
  });

  it("leaves an unknown prefix unresolved", async () => {
    const view = await open("/org/appli/referentiel/regle/autre:RG-acces");

    expect(router.currentRoute.value.path).toBe(
      "/org/appli/referentiel/regle/autre:RG-acces",
    );
    expect(view.text()).toContain("Règle introuvable");
  });
});

describe("the citations on a sheet", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "appli" });
    provide(CitedSpecifications, {
      read: () => new Promise(() => undefined),
    });
  });

  it("shows what a rule applies", async () => {
    const view = await open("/org/appli/referentiel/regle/RG-acces");

    expect(view.text()).toContain("Applique");
    expect(view.text()).toContain("socle:RG-nommage-des-roles");
  });

  it("shows what an architecture decision applies", async () => {
    const view = await open("/org/appli/architecture/decision/ADR-runners");

    expect(view.text()).toContain("Applique");
    expect(view.text()).toContain("socle:ADR-runners-designes");
  });
});
