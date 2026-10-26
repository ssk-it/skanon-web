import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import {
  HttpTestingController,
  provideHttpTesting,
  settle,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { TAGS_LIENS_PAR_DEFAUT, type Cadrage } from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import DomainePage from "./DomainePage.vue";
import FonctionnalitePage from "./FonctionnalitePage.vue";
import PistesSection from "./PistesSection.vue";

/**
 * La section « À venir » d'un domaine ou d'une fonctionnalité —
 * RG-pistes-a-part (cadrage 2026-058).
 *
 * Ce qui est éprouvé : qu'elle reste repliée et à part de l'effectif, qu'elle
 * range ses pistes par horizon sous un libellé qui dit que rien n'est décidé,
 * qu'une piste en cours mène à son cadrage, et que le vide comme le droit
 * manquant se disent au lieu de se taire.
 */
const URL_ISSUES =
  "https://api.github.com/repos/org/depot/issues?labels=piste&state=open&per_page=100&page=1";

function issue(numero: number, etiquettes: string[], jalon: string | null) {
  return {
    number: numero,
    title: `Commenter un cadrage ${numero}`,
    html_url: `https://github.com/org/depot/issues/${numero}`,
    labels: ["piste", ...etiquettes].map((name) => ({ name })),
    milestone: jalon ? { title: jalon } : null,
  };
}

const EN_COURS: Cadrage = {
  id: "2026-071",
  titre: "Commenter",
  statut: "brouillon",
  domaines: ["cadrage"],
  liens: [
    { tag: "piste", url: "https://github.com/org/depot/issues/12", nom: "" },
  ],
  impacts: [],
  objectif: "",
  parcours: "",
  enonces: new Map(),
  decisions: [],
  piecesJointes: [],
  divers: [],
};

let http: HttpTestingController;

async function preparer() {
  const store = inject(ReferentielStore);
  store.referentiel.set({
    projet: { nom: "Test", description: "", depotsCode: [], prefixe: null },
    reglages: {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map([
      ["cadrage", { id: "cadrage", nom: "Cadrage", description: "" }],
    ]),
    fonctionnalites: new Map([
      [
        "redaction",
        {
          id: "redaction",
          nom: "Rédaction",
          domaines: ["cadrage"],
          description: "",
        },
      ],
    ]),
    regles: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map([[EN_COURS.id, EN_COURS]]),
    anomalies: [],
  });
  store.etat.set("pret");
  const routeur = createRouteur(createMemoryHistory());
  await routeur.push("/org/depot/referentiel");
  await routeur.isReady();
  return routeur;
}

async function monterSection(
  reponse: (r: ReturnType<HttpTestingController["expectOne"]>) => void,
) {
  const routeur = await preparer();
  const vue = mount(PistesSection, {
    props: { collection: "domains", id: "cadrage" },
    global: { plugins: [routeur] },
  });
  await settle();
  reponse(http.expectOne(URL_ISSUES));
  await flushPromises();
  return vue;
}

describe("La section « À venir »", () => {
  beforeEach(() => {
    http = provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  it("se présente repliée, avec le nombre de pistes", async () => {
    const vue = await monterSection((r) =>
      r.flush([
        issue(12, ["domaine/cadrage"], "ensuite"),
        issue(13, ["domaine/cadrage"], null),
        issue(14, ["domaine/autre"], null),
      ]),
    );

    const bascule = vue.get("button.bascule");
    expect(bascule.text()).toContain("À venir");
    expect(bascule.text()).toContain("2");
    expect(bascule.attributes("aria-expanded")).toBe("false");
    expect(vue.find(".piste").exists()).toBe(false);
  });

  it("dépliée, range les pistes par horizon et dit que rien n'y est décidé", async () => {
    const vue = await monterSection((r) =>
      r.flush([
        issue(13, ["domaine/cadrage"], null),
        issue(12, ["domaine/cadrage"], "Maintenant"),
      ]),
    );
    await vue.get("button.bascule").trigger("click");

    expect(vue.text()).toContain("rien n’y est décidé");
    const horizons = vue.findAll(".horizon").map((h) => h.text());
    expect(horizons).toEqual(["Maintenant", "Non classées"]);
    const liens = vue.findAll(".piste a.issue");
    expect(liens.map((a) => a.attributes("href"))).toEqual([
      "https://github.com/org/depot/issues/12",
      "https://github.com/org/depot/issues/13",
    ]);
  });

  it("mène une piste en cours au cadrage qui la traite", async () => {
    const vue = await monterSection((r) =>
      r.flush([issue(12, ["domaine/cadrage"], "ensuite")]),
    );
    await vue.get("button.bascule").trigger("click");

    const cadrage = vue.get(".piste a.cadrage");
    expect(cadrage.text()).toContain("2026-071");
    expect(cadrage.attributes("href")).toBe("/org/depot/cadrages/2026-071");
  });

  it("sans piste, dit ce qu'elle accueillerait", async () => {
    const vue = await monterSection((r) => r.flush([]));
    await vue.get("button.bascule").trigger("click");

    expect(vue.text()).toContain("Aucune piste");
    expect(vue.text()).toContain("domaine/cadrage");
  });

  it("nomme le droit manquant quand le jeton ne lit pas les issues", async () => {
    const vue = await monterSection((r) =>
      r.flush({ message: "Resource not accessible" }, { status: 403 }),
    );
    await vue.get("button.bascule").trigger("click");

    expect(vue.text()).toContain("Issues");
    expect(vue.text()).not.toContain("Aucune piste");
  });
});

describe("La place de la section", () => {
  beforeEach(() => {
    http = provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  it("vient en dernier dans un domaine", async () => {
    const routeur = await preparer();
    await routeur.push("/org/depot/referentiel/domaine/cadrage");
    const vue = mount(DomainePage, { global: { plugins: [routeur] } });
    await flushPromises();

    const sections = vue.findAll("h2, .pistes");
    expect(sections.at(-1)?.classes()).toContain("pistes");
  });

  it("vient en dernier dans une fonctionnalité", async () => {
    const routeur = await preparer();
    await routeur.push("/org/depot/referentiel/fonctionnalite/redaction");
    const vue = mount(FonctionnalitePage, { global: { plugins: [routeur] } });
    await flushPromises();

    const sections = vue.findAll("h2, .pistes");
    expect(sections.at(-1)?.classes()).toContain("pistes");
  });
});
