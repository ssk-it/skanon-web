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
 * A roadmap item is an issue of the specification repo labelled `piste`
 * (scoping 2026-058). It never enters the specification: the application
 * reads it separately, and only where a reader asks for it.
 *
 * What is tested here: reading issues, the three outcomes of a call —
 * roadmap items, none, a missing right —, attachment by labels, horizon by
 * milestone, and the « en cours » state derived from scopings.
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

describe("reading roadmap items", () => {
  let http: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    http = provideHttpTesting();
  });

  it("reads open issues labelled piste, without pull requests", async () => {
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

  it("follows pages as long as they are full", async () => {
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

  it("does not re-read the issues of an already loaded project", async () => {
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

  it("states the missing right when the token cannot read issues", async () => {
    // A fine-grained token without « Issues »: the platform responds 403
    // without the quota being exhausted. An empty section would say « rien
    // n'est envisagé ».
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

  it("tells an outage from a missing right", async () => {
    const service = inject(RoadmapItemsService);
    const pending = service.load(REPO);
    await settle();

    http.expectOne(`${ISSUES_URL}&page=1`).error(new ProgressEvent("error"));
    await pending;

    expect(service.state()).toBe("erreur");
    expect(service.error()).toContain("injoignable");
  });
});

describe("attaching roadmap items", () => {
  const issues = [
    roadmapItem(1, ["domaine/cadrage"]),
    roadmapItem(2, ["fonctionnalite/recherche"]),
    roadmapItem(3, ["domaine/referentiel", "fonctionnalite/recherche"]),
  ];

  it("keeps a domain's roadmap items by their label", () => {
    const views = linkedRoadmapItems(issues, "domains", "cadrage", [], REPO);
    expect(views.map((p) => p.number)).toEqual([1]);
  });

  it("keeps a feature's roadmap items by their label", () => {
    const views = linkedRoadmapItems(issues, "features", "recherche", [], REPO);
    expect(views.map((p) => p.number)).toEqual([2, 3]);
  });

  it("marks as in progress a roadmap item an undelivered scoping cites", () => {
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

  it("does not consider in progress a roadmap item cited by a delivered scoping, or by another link", () => {
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

describe("horizon of roadmap items", () => {
  it("groups by milestone, now then next then later, unclassified last", () => {
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

  it("announces no empty group", () => {
    const groups = groupByHorizon([
      { ...roadmapItem(1, [], "ensuite"), scopingsInProgress: [] },
    ]);
    expect(groups.map((g) => g.horizon)).toEqual(["ensuite"]);
  });
});
