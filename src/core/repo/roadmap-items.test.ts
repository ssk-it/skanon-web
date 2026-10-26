import { beforeEach, describe, expect, it } from "vitest";
import {
  HttpTestingController,
  provideHttpTesting,
  settle,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { Scoping, ExternalLink, ScopingStatus } from "../model/model";
import {
  groupByHorizon,
  RoadmapItemIssue,
  RoadmapItemsService,
  linkedRoadmapItems,
} from "./roadmap-items.service";

/**
 * Une piste est une issue du dépôt de référentiel étiquetée `piste` (cadrage
 * 2026-058). Elle n'entre jamais dans le référentiel : l'application la lit à
 * part, et seulement là où un lecteur la demande.
 *
 * Ce qui est éprouvé ici : la lecture des issues, les trois issues d'un appel
 * — des pistes, aucune, un droit manquant —, le rattachement par étiquettes,
 * l'horizon par jalon, et l'état « en cours » déduit des cadrages.
 */
const REPO = { owner: "org", repo: "projet" };
const ISSUES_URL =
  "https://api.github.com/repos/org/projet/issues?labels=piste&state=open&per_page=100";

function rawIssue(
  number: number,
  labels: string[],
  milestone: string | null = null,
  pr = false,
) {
  return {
    number: number,
    title: `Piste ${number}`,
    html_url: `https://github.com/org/projet/issues/${number}`,
    labels: labels.map((name) => ({ name })),
    milestone: milestone ? { title: milestone } : null,
    ...(pr ? { pull_request: {} } : {}),
  };
}

function roadmapItem(
  number: number,
  labels: string[],
  milestone: string | null = null,
): RoadmapItemIssue {
  return {
    number,
    title: `Piste ${number}`,
    url: `https://github.com/org/projet/issues/${number}`,
    labels: ["piste", ...labels],
    milestone,
  };
}

function scoping(
  id: string,
  status: ScopingStatus,
  links: ExternalLink[],
): Scoping {
  return { id, status: status, links: links } as unknown as Scoping;
}

describe("lecture des pistes", () => {
  let http: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    http = provideHttpTesting();
  });

  it("lit les issues ouvertes étiquetées piste, sans les demandes de fusion", async () => {
    const service = inject(RoadmapItemsService);
    const pending = service.load(REPO);
    await settle();

    http
      .expectOne(`${ISSUES_URL}&page=1`)
      .flush([
        rawIssue(12, ["piste", "domaine/cadrage"], "ensuite"),
        rawIssue(13, ["piste"], null, true),
      ]);
    await pending;

    expect(service.state()).toBe("pret");
    expect(service.issues().map((i) => i.number)).toEqual([12]);
    expect(service.issues()[0]).toEqual(
      roadmapItem(12, ["domaine/cadrage"], "ensuite"),
    );
  });

  it("suit les pages tant qu'elles sont pleines", async () => {
    const service = inject(RoadmapItemsService);
    const pending = service.load(REPO);
    await settle();

    const full = Array.from({ length: 100 }, (_, i) =>
      rawIssue(i + 1, ["piste"]),
    );
    http.expectOne(`${ISSUES_URL}&page=1`).flush(full);
    await settle();
    http.expectOne(`${ISSUES_URL}&page=2`).flush([rawIssue(101, ["piste"])]);
    await pending;

    expect(service.issues()).toHaveLength(101);
  });

  it("ne relit pas les issues d'un projet déjà chargé", async () => {
    const service = inject(RoadmapItemsService);
    const first = service.load(REPO);
    await settle();
    http.expectOne(`${ISSUES_URL}&page=1`).flush([]);
    await first;

    await service.load(REPO);
    await settle();
    http.verify();
    expect(service.state()).toBe("pret");
  });

  it("dit le droit manquant quand le jeton ne lit pas les issues", async () => {
    // Un jeton à droits fins sans « Issues » : la plateforme répond 403 sans
    // que le quota soit épuisé. Une section vide dirait « rien n'est envisagé ».
    const service = inject(RoadmapItemsService);
    const pending = service.load(REPO);
    await settle();

    http
      .expectOne(`${ISSUES_URL}&page=1`)
      .flush(
        { message: "Resource not accessible by personal access token" },
        { status: 403, statusText: "Forbidden" },
      );
    await pending;

    expect(service.state()).toBe("droit-manquant");
    expect(service.issues()).toEqual([]);
  });

  it("distingue une panne d'un droit manquant", async () => {
    const service = inject(RoadmapItemsService);
    const pending = service.load(REPO);
    await settle();

    http.expectOne(`${ISSUES_URL}&page=1`).error(new ProgressEvent("error"));
    await pending;

    expect(service.state()).toBe("erreur");
    expect(service.error()).toContain("injoignable");
  });
});

describe("rattachement des pistes", () => {
  const issues = [
    roadmapItem(1, ["domaine/cadrage"]),
    roadmapItem(2, ["fonctionnalite/recherche"]),
    roadmapItem(3, ["domaine/referentiel", "fonctionnalite/recherche"]),
  ];

  it("retient les pistes d'un domaine par leur étiquette", () => {
    const views = linkedRoadmapItems(issues, "domains", "cadrage", [], REPO);
    expect(views.map((p) => p.number)).toEqual([1]);
  });

  it("retient les pistes d'une fonctionnalité par leur étiquette", () => {
    const views = linkedRoadmapItems(issues, "features", "recherche", [], REPO);
    expect(views.map((p) => p.number)).toEqual([2, 3]);
  });

  it("dit en cours une piste qu'un cadrage non livré cite", () => {
    const scopings = [
      scoping("2026-071", "brouillon", [
        {
          tag: "piste",
          url: "https://github.com/org/projet/issues/1",
          name: "",
        },
      ]),
    ];
    const [view] = linkedRoadmapItems(
      issues,
      "domains",
      "cadrage",
      scopings,
      REPO,
    );
    expect(view.scopingsInProgress).toEqual(["2026-071"]);
  });

  it("ne tient pas pour en cours une piste citée par un cadrage livré, ou par un autre lien", () => {
    const scopings = [
      scoping("2026-060", "livree", [
        {
          tag: "piste",
          url: "https://github.com/org/projet/issues/1",
          name: "",
        },
      ]),
      scoping("2026-061", "en_relecture", [
        {
          tag: "issue_github",
          url: "https://github.com/org/projet/issues/1",
          name: "",
        },
      ]),
      scoping("2026-062", "brouillon", [
        {
          tag: "piste",
          url: "https://github.com/org/autre/issues/1",
          name: "",
        },
      ]),
    ];
    const [view] = linkedRoadmapItems(
      issues,
      "domains",
      "cadrage",
      scopings,
      REPO,
    );
    expect(view.scopingsInProgress).toEqual([]);
  });
});

describe("horizon des pistes", () => {
  it("range par jalon, maintenant puis ensuite puis plus tard, les non classées en dernier", () => {
    const groups = groupByHorizon([
      { ...roadmapItem(1, []), scopingsInProgress: [] },
      { ...roadmapItem(2, [], "Plus tard"), scopingsInProgress: [] },
      { ...roadmapItem(3, [], "maintenant"), scopingsInProgress: [] },
      { ...roadmapItem(4, [], "Ensuite"), scopingsInProgress: [] },
      { ...roadmapItem(5, [], "T4 2027"), scopingsInProgress: [] },
    ]);

    expect(
      groups.map((g) => [g.horizon, g.roadmapItems.map((p) => p.number)]),
    ).toEqual([
      ["maintenant", [3]],
      ["ensuite", [4]],
      ["plus-tard", [2]],
      ["non-classee", [1, 5]],
    ]);
  });

  it("n'annonce aucun groupe vide", () => {
    const groups = groupByHorizon([
      { ...roadmapItem(1, [], "ensuite"), scopingsInProgress: [] },
    ]);
    expect(groups.map((g) => g.horizon)).toEqual(["ensuite"]);
  });
});
