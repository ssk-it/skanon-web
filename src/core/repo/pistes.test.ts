import { beforeEach, describe, expect, it } from "vitest";
import {
  HttpTestingController,
  provideHttpTesting,
  settle,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { Cadrage, LienExterne, StatutCadrage } from "../model/model";
import {
  grouperParHorizon,
  IssuePiste,
  PistesService,
  pistesRattachees,
} from "./pistes.service";

/**
 * Une piste est une issue du dépôt de référentiel étiquetée `piste` (cadrage
 * 2026-058). Elle n'entre jamais dans le référentiel : l'application la lit à
 * part, et seulement là où un lecteur la demande.
 *
 * Ce qui est éprouvé ici : la lecture des issues, les trois issues d'un appel
 * — des pistes, aucune, un droit manquant —, le rattachement par étiquettes,
 * l'horizon par jalon, et l'état « en cours » déduit des cadrages.
 */
const DEPOT = { owner: "org", repo: "projet" };
const URL_ISSUES =
  "https://api.github.com/repos/org/projet/issues?labels=piste&state=open&per_page=100";

function issueBrute(
  numero: number,
  etiquettes: string[],
  jalon: string | null = null,
  pr = false,
) {
  return {
    number: numero,
    title: `Piste ${numero}`,
    html_url: `https://github.com/org/projet/issues/${numero}`,
    labels: etiquettes.map((name) => ({ name })),
    milestone: jalon ? { title: jalon } : null,
    ...(pr ? { pull_request: {} } : {}),
  };
}

function piste(
  numero: number,
  etiquettes: string[],
  jalon: string | null = null,
): IssuePiste {
  return {
    numero,
    titre: `Piste ${numero}`,
    url: `https://github.com/org/projet/issues/${numero}`,
    etiquettes: ["piste", ...etiquettes],
    jalon,
  };
}

function cadrage(
  id: string,
  statut: StatutCadrage,
  liens: LienExterne[],
): Cadrage {
  return { id, statut, liens } as unknown as Cadrage;
}

describe("lecture des pistes", () => {
  let http: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    http = provideHttpTesting();
  });

  it("lit les issues ouvertes étiquetées piste, sans les demandes de fusion", async () => {
    const service = inject(PistesService);
    const attente = service.charger(DEPOT);
    await settle();

    http
      .expectOne(`${URL_ISSUES}&page=1`)
      .flush([
        issueBrute(12, ["piste", "domaine/cadrage"], "ensuite"),
        issueBrute(13, ["piste"], null, true),
      ]);
    await attente;

    expect(service.etat()).toBe("pret");
    expect(service.issues().map((i) => i.numero)).toEqual([12]);
    expect(service.issues()[0]).toEqual(
      piste(12, ["domaine/cadrage"], "ensuite"),
    );
  });

  it("suit les pages tant qu'elles sont pleines", async () => {
    const service = inject(PistesService);
    const attente = service.charger(DEPOT);
    await settle();

    const pleine = Array.from({ length: 100 }, (_, i) =>
      issueBrute(i + 1, ["piste"]),
    );
    http.expectOne(`${URL_ISSUES}&page=1`).flush(pleine);
    await settle();
    http.expectOne(`${URL_ISSUES}&page=2`).flush([issueBrute(101, ["piste"])]);
    await attente;

    expect(service.issues()).toHaveLength(101);
  });

  it("ne relit pas les issues d'un projet déjà chargé", async () => {
    const service = inject(PistesService);
    const premier = service.charger(DEPOT);
    await settle();
    http.expectOne(`${URL_ISSUES}&page=1`).flush([]);
    await premier;

    await service.charger(DEPOT);
    await settle();
    http.verify();
    expect(service.etat()).toBe("pret");
  });

  it("dit le droit manquant quand le jeton ne lit pas les issues", async () => {
    // Un jeton à droits fins sans « Issues » : la plateforme répond 403 sans
    // que le quota soit épuisé. Une section vide dirait « rien n'est envisagé ».
    const service = inject(PistesService);
    const attente = service.charger(DEPOT);
    await settle();

    http
      .expectOne(`${URL_ISSUES}&page=1`)
      .flush(
        { message: "Resource not accessible by personal access token" },
        { status: 403, statusText: "Forbidden" },
      );
    await attente;

    expect(service.etat()).toBe("droit-manquant");
    expect(service.issues()).toEqual([]);
  });

  it("distingue une panne d'un droit manquant", async () => {
    const service = inject(PistesService);
    const attente = service.charger(DEPOT);
    await settle();

    http.expectOne(`${URL_ISSUES}&page=1`).error(new ProgressEvent("error"));
    await attente;

    expect(service.etat()).toBe("erreur");
    expect(service.erreur()).toContain("injoignable");
  });
});

describe("rattachement des pistes", () => {
  const issues = [
    piste(1, ["domaine/cadrage"]),
    piste(2, ["fonctionnalite/recherche"]),
    piste(3, ["domaine/referentiel", "fonctionnalite/recherche"]),
  ];

  it("retient les pistes d'un domaine par leur étiquette", () => {
    const vues = pistesRattachees(issues, "domains", "cadrage", [], DEPOT);
    expect(vues.map((p) => p.numero)).toEqual([1]);
  });

  it("retient les pistes d'une fonctionnalité par leur étiquette", () => {
    const vues = pistesRattachees(issues, "features", "recherche", [], DEPOT);
    expect(vues.map((p) => p.numero)).toEqual([2, 3]);
  });

  it("dit en cours une piste qu'un cadrage non livré cite", () => {
    const cadrages = [
      cadrage("2026-071", "brouillon", [
        {
          tag: "piste",
          url: "https://github.com/org/projet/issues/1",
          nom: "",
        },
      ]),
    ];
    const [vue] = pistesRattachees(
      issues,
      "domains",
      "cadrage",
      cadrages,
      DEPOT,
    );
    expect(vue.cadragesEnCours).toEqual(["2026-071"]);
  });

  it("ne tient pas pour en cours une piste citée par un cadrage livré, ou par un autre lien", () => {
    const cadrages = [
      cadrage("2026-060", "livree", [
        {
          tag: "piste",
          url: "https://github.com/org/projet/issues/1",
          nom: "",
        },
      ]),
      cadrage("2026-061", "en_relecture", [
        {
          tag: "issue_github",
          url: "https://github.com/org/projet/issues/1",
          nom: "",
        },
      ]),
      cadrage("2026-062", "brouillon", [
        { tag: "piste", url: "https://github.com/org/autre/issues/1", nom: "" },
      ]),
    ];
    const [vue] = pistesRattachees(
      issues,
      "domains",
      "cadrage",
      cadrages,
      DEPOT,
    );
    expect(vue.cadragesEnCours).toEqual([]);
  });
});

describe("horizon des pistes", () => {
  it("range par jalon, maintenant puis ensuite puis plus tard, les non classées en dernier", () => {
    const groupes = grouperParHorizon([
      { ...piste(1, []), cadragesEnCours: [] },
      { ...piste(2, [], "Plus tard"), cadragesEnCours: [] },
      { ...piste(3, [], "maintenant"), cadragesEnCours: [] },
      { ...piste(4, [], "Ensuite"), cadragesEnCours: [] },
      { ...piste(5, [], "T4 2027"), cadragesEnCours: [] },
    ]);

    expect(
      groupes.map((g) => [g.horizon, g.pistes.map((p) => p.numero)]),
    ).toEqual([
      ["maintenant", [3]],
      ["ensuite", [4]],
      ["plus-tard", [2]],
      ["non-classee", [1, 5]],
    ]);
  });

  it("n'annonce aucun groupe vide", () => {
    const groupes = grouperParHorizon([
      { ...piste(1, [], "ensuite"), cadragesEnCours: [] },
    ]);
    expect(groupes.map((g) => g.horizon)).toEqual(["ensuite"]);
  });
});
