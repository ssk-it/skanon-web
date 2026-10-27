import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, type Router } from "vue-router";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import ScopingsPage from "./ScopingsPage.vue";

/**
 * The scopings list — RG-liste-cadrages-sobre and RG-liste-cadrages-filtrable.
 *
 * What is tested here is that a row says only what distinguishes it, and that the list can be browsed by a word or a domain without losing its order.
 */

function scoping(
  id: string,
  title: string,
  extra: Partial<Scoping> = {},
): Scoping {
  return {
    id,
    title,
    status: "livree",
    domains: [],
    links: [],
    impacts: [],
    goal: "",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
    ...extra,
  };
}

function impacts(n: number): Scoping["impacts"] {
  return Array.from({ length: n }, (_, i) => ({
    target: `RG-${i}`,
    rule: `RG-${i}`,
    kind: "regle" as const,
    operation: "cree" as const,
  }));
}

function decisions(n: number): Scoping["decisions"] {
  return Array.from({ length: n }, (_, i) => ({
    id: `0${i + 1}-d`,
    title: "Une question ?",
    status: "retenue" as const,
    chosenOption: null,
    description: "",
    options: [],
    body: "",
  }));
}

const SCOPINGS: Scoping[] = [
  scoping("2026-005", "Alléger la barre sur écran étroit", {
    status: "en_relecture",
    domains: ["referentiel"],
    provenance: {
      branch: "cadrage-2026-005",
      pullRequest: 9,
      draft: false,
    },
  }),
  scoping("2026-004", "Rendre les diagrammes écrits", {
    domains: ["referentiel", "cadrage"],
    impacts: impacts(3),
    decisions: decisions(2),
  }),
  scoping("2026-003", "Chiffrer les pièces jointes", {
    domains: ["persistance"],
    impacts: impacts(1),
    decisions: decisions(1),
  }),
];

function specification(): Specification {
  const domain = (id: string, name: string) =>
    [id, { id, name: name, description: "" }] as const;
  return {
    project: { name: "Test", description: "", codeRepos: [], prefix: null },
    settings: {
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map([
      domain("cadrage", "Cadrage"),
      domain("persistance", "Persistance"),
      domain("referentiel", "Référentiel"),
    ]),
    features: new Map(),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(SCOPINGS.map((c) => [c.id, c])),
    anomalies: [],
  };
}

let http: HttpTestingController;
let router: Router;

async function mountView(): Promise<VueWrapper> {
  const f = mount(ScopingsPage, { global: { plugins: [router] } });
  await nextTick();
  return f;
}

function el(f: VueWrapper): HTMLElement {
  return f.element.parentElement ?? (f.element as HTMLElement);
}

function lines(f: VueWrapper): string[] {
  return [...el(f).querySelectorAll(".ligne .cid")].map(
    (c) => c.textContent?.trim() ?? "",
  );
}

async function typeText(f: VueWrapper, text: string): Promise<void> {
  const field = el(f).querySelector<HTMLInputElement>(".filtre input")!;
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await nextTick();
}

function domain(f: VueWrapper, name: string): HTMLButtonElement {
  return [
    ...el(f).querySelectorAll<HTMLButtonElement>(".filtre button.domaine"),
  ].find((b) => b.textContent?.includes(name))!;
}

/** Makes in-flight date reads fail: each then returns `null`. */
async function denyDates(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await Promise.resolve();
    for (const r of http.match((r) => r.url.includes("/commits"))) {
      r.flush("Not Found", { status: 404, statusText: "Not Found" });
    }
  }
  await new Promise((r) => setTimeout(r, 0));
}

describe("The scopings list", () => {
  beforeEach(async () => {
    http = provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    const store = inject(SpecificationStore);
    store.specification.set(specification());
    store.state.set("pret");
    router = createAppRouter(createMemoryHistory());
    await router.push("/org/depot/cadrages");
    await router.isReady();
  });

  describe("a plain row", () => {
    it("names its counters", async () => {
      const text = el(await mountView()).textContent ?? "";

      expect(text).toContain("2 décisions · 3 impacts");
      expect(text).toContain("1 décision · 1 impact");
    });

    it("does not repeat the status of delivered ones, and keeps that of in-progress ones", async () => {
      const f = await mountView();

      const bullets = [...el(f).querySelectorAll(".ligne .statut-chip")];
      expect(bullets.length).toBe(1);
      expect(bullets[0].closest(".ligne")?.textContent).toContain("2026-005");
    });

    it("keeps the identifier displayed on each row", async () => {
      expect(lines(await mountView())).toEqual([
        "2026-005",
        "2026-004",
        "2026-003",
      ]);
    });

    it("gathers delivered ones under « Livrés » as long as none is dated", async () => {
      const groups = [...el(await mountView()).querySelectorAll(".groupe")].map(
        (g) => g.firstChild?.textContent?.trim(),
      );

      expect(groups).toEqual(["En cours", "Livrés"]);
    });

    it("says once, with its cause, that the dates could not be read", async () => {
      const f = await mountView();
      await denyDates();
      await flushPromises();

      const notes = el(f).querySelectorAll(".note-dates");
      expect(notes.length).toBe(1);
      expect(notes[0].textContent).toContain("n’ont pas pu être lues");
      // without a token, the likely cause is the anonymous request limit
      expect(notes[0].textContent).toContain("Se connecter");
    });
  });

  describe("a filter", () => {
    it("narrows the list to a word of the title, in the same order", async () => {
      const f = await mountView();
      await typeText(f, "diagrammes");

      expect(lines(f)).toEqual(["2026-004"]);
      expect(el(f).querySelector(".compte")?.textContent).toContain(
        "1 cadrage sur 3",
      );
    });

    it("keeps the scopings of the chosen domains, in-progress ones included", async () => {
      const f = await mountView();
      domain(f, "Référentiel").click();
      await nextTick();

      expect(lines(f)).toEqual(["2026-005", "2026-004"]);
      expect(domain(f, "Référentiel").getAttribute("aria-pressed")).toBe(
        "true",
      );
    });

    it("says when it keeps nothing, and clears", async () => {
      const f = await mountView();
      await typeText(f, "introuvable");

      const empty = el(f).querySelector(".vide");
      expect(empty?.textContent).toContain("Aucun cadrage ne correspond");
      empty!.querySelector("button")!.click();
      await nextTick();

      expect(lines(f).length).toBe(3);
      expect(
        el(f).querySelector<HTMLInputElement>(".filtre input")!.value,
      ).toBe("");
    });

    it("is kept when coming back from a scoping page", async () => {
      const first = await mountView();
      await typeText(first, "pièces");
      first.unmount();

      const returnPath = await mountView();
      expect(lines(returnPath)).toEqual(["2026-003"]);
      expect(
        el(returnPath).querySelector<HTMLInputElement>(".filtre input")!.value,
      ).toBe("pièces");
    });

    it("does not follow the reader into another project", async () => {
      const first = await mountView();
      await typeText(first, "pièces");
      first.unmount();

      inject(RepoConfig).saveRepo({ owner: "org", repo: "autre" });
      expect(lines(await mountView()).length).toBe(3);
    });
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("titles the page, its counts and its groups in English", async () => {
      const f = await mountView();
      const text = el(f).textContent ?? "";

      expect(el(f).querySelector("h1")?.textContent).toBe("Scopings");
      expect(text).toContain("New scoping");
      expect(text).toContain("3 scopings · 1 in progress");
      expect(text).toContain("2 decisions · 3 impacts");
      expect(text).toContain("1 decision · 1 impact");
      expect(
        [...el(f).querySelectorAll(".groupe")].map((g) =>
          g.firstChild?.textContent?.trim(),
        ),
      ).toEqual(["In progress", "Delivered"]);
      for (const french of ["Nouveau cadrage", "en cours", "Livrés"])
        expect(text).not.toContain(french);
    });

    it("names the filter field and its empty result in English", async () => {
      const f = await mountView();
      expect(
        el(f).querySelector<HTMLInputElement>(".filtre input")!.placeholder,
      ).toBe("Filter by identifier or title");
      expect(el(f).querySelector(".filtre")!.getAttribute("aria-label")).toBe(
        "Filter scopings",
      );

      await typeText(f, "introuvable");
      expect(el(f).querySelector(".compte")?.textContent).toContain(
        "0 scopings of 3",
      );
      expect(el(f).querySelector(".vide")?.textContent).toContain(
        "No scoping matches this filter.",
      );
    });

    it("says in English that the dates could not be read", async () => {
      const f = await mountView();
      await denyDates();
      await flushPromises();

      const note = el(f).querySelector(".note-dates")?.textContent ?? "";
      expect(note).toContain("Creation dates could not be read.");
      expect(note).toContain("Sign in");
    });
  });
});
