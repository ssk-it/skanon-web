import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, type Router } from "vue-router";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../routeur";
import ScopingsPage from "./CadragesPage.vue";

/**
 * La liste des cadrages — RG-liste-cadrages-sobre et RG-liste-cadrages-filtrable.
 *
 * Ce qui est éprouvé ici, c'est qu'une ligne ne dit que ce qui la distingue, et que la liste se parcourt par un mot ou un domaine sans perdre son ordre.
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
      access: "jeton_personnel",
      identity: null,
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

/** Fait échouer les lectures de dates en vol : chacune rend alors `null`. */
async function denyDates(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await Promise.resolve();
    for (const r of http.match((r) => r.url.includes("/commits"))) {
      r.flush("Not Found", { status: 404, statusText: "Not Found" });
    }
  }
  await new Promise((r) => setTimeout(r, 0));
}

describe("La liste des cadrages", () => {
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

  describe("une ligne sobre", () => {
    it("nomme ses compteurs", async () => {
      const text = el(await mountView()).textContent ?? "";

      expect(text).toContain("2 décisions · 3 impacts");
      expect(text).toContain("1 décision · 1 impact");
    });

    it("ne répète pas le statut des livrés, et garde celui des en cours", async () => {
      const f = await mountView();

      const bullets = [...el(f).querySelectorAll(".ligne .statut-chip")];
      expect(bullets.length).toBe(1);
      expect(bullets[0].closest(".ligne")?.textContent).toContain("2026-005");
    });

    it("garde l’identifiant affiché sur chaque ligne", async () => {
      expect(lines(await mountView())).toEqual([
        "2026-005",
        "2026-004",
        "2026-003",
      ]);
    });

    it("réunit les livrés sous « Livrés » tant qu’aucun n’est daté", async () => {
      const groups = [...el(await mountView()).querySelectorAll(".groupe")].map(
        (g) => g.firstChild?.textContent?.trim(),
      );

      expect(groups).toEqual(["En cours", "Livrés"]);
    });

    it("dit une fois, avec sa cause, que les dates n’ont pas pu être lues", async () => {
      const f = await mountView();
      await denyDates();
      await flushPromises();

      const notes = el(f).querySelectorAll(".note-dates");
      expect(notes.length).toBe(1);
      expect(notes[0].textContent).toContain("n’ont pas pu être lues");
      // sans jeton, la cause probable est la limite des requêtes anonymes
      expect(notes[0].textContent).toContain("Se connecter");
    });
  });

  describe("un filtre", () => {
    it("réduit la liste à un mot du titre, dans le même ordre", async () => {
      const f = await mountView();
      await typeText(f, "diagrammes");

      expect(lines(f)).toEqual(["2026-004"]);
      expect(el(f).querySelector(".compte")?.textContent).toContain(
        "1 cadrage sur 3",
      );
    });

    it("retient les cadrages des domaines choisis, en cours compris", async () => {
      const f = await mountView();
      domain(f, "Référentiel").click();
      await nextTick();

      expect(lines(f)).toEqual(["2026-005", "2026-004"]);
      expect(domain(f, "Référentiel").getAttribute("aria-pressed")).toBe(
        "true",
      );
    });

    it("dit quand il ne retient rien, et s’efface", async () => {
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

    it("se conserve au retour d’une fiche", async () => {
      const first = await mountView();
      await typeText(first, "pièces");
      first.unmount();

      const returnPath = await mountView();
      expect(lines(returnPath)).toEqual(["2026-003"]);
      expect(
        el(returnPath).querySelector<HTMLInputElement>(".filtre input")!.value,
      ).toBe("pièces");
    });

    it("ne suit pas le lecteur dans un autre projet", async () => {
      const first = await mountView();
      await typeText(first, "pièces");
      first.unmount();

      inject(RepoConfig).saveRepo({ owner: "org", repo: "autre" });
      expect(lines(await mountView()).length).toBe(3);
    });
  });
});
