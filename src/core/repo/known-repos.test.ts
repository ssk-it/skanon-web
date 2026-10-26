import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import {
  KnownRepo,
  KnownReposService,
  groupReposByOrganization,
} from "./known-repos.service";
import { RepoConfig } from "./repo-config";
import { TokenService } from "../github/token.service";

/**
 * The « Ouvrir un projet » screen only showed repos already opened: the
 * specifications of other organizations were checked under the token of the
 * current target, which does not reach them, and filed among repos without
 * a specification. See RG-projets-connus.
 */
describe("repos offered for opening", () => {
  const SSK_TOKEN = "ghp_ssk_aaaaaaaaaaaaaaaa";
  const WAYNE_TOKEN = "ghp_wayne_aaaaaaaaaaaaaa";

  /** What each token reaches, as GitHub would say. */
  const SCOPE: Record<string, readonly string[]> = {
    [SSK_TOKEN]: ["ssk-it/skift-cadrage", "ssk-it/skift"],
    [WAYNE_TOKEN]: ["Wayne-Corp/wayne-devis-cadrage"],
  };
  const FRAMED_REPOS = [
    "ssk-it/skift-cadrage",
    "Wayne-Corp/wayne-devis-cadrage",
  ];

  let http: HttpTestingController;
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => storage[c] ?? null,
        setItem: (c: string, v: string) => void (storage[c] = v),
        removeItem: (c: string) => void delete storage[c],
        clear: () => void (storage = {}),
      },
    });
    resetInjection();

    http = provideHttpTesting();
  });

  /**
   * Answers each call by playing GitHub: a repo out of reach of the presented
   * token is not found, as the platform says of a private repo.
   */
  async function replayGithub(): Promise<void> {
    for (let round = 0; round < 50; round++) {
      for (const query of http.match(() => true)) {
        const token =
          query.request.headers.get("Authorization")?.replace("Bearer ", "") ??
          "";
        const reached = SCOPE[token] ?? [];
        const url = query.request.url;

        if (url.includes("/user/repos")) {
          query.flush(
            reached.map((fullName) => {
              const [owner, name] = fullName.split("/");
              return { owner: { login: owner }, name };
            }),
          );
          continue;
        }

        const content =
          /\/repos\/([^/]+\/[^/]+)\/contents\/ssk-canon\.yml/.exec(url);
        if (content) {
          const name = content[1];
          if (reached.includes(name) && FRAMED_REPOS.includes(name))
            query.flush({});
          else query.flush(null, { status: 404, statusText: "Not Found" });
          continue;
        }
        throw new Error(`Appel inattendu : ${url}`);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  it("recognises the specifications of each organization, under the token that reaches it", async () => {
    const tokens = inject(TokenService);
    tokens.setForScope("ssk-it", SSK_TOKEN);
    tokens.setForScope("wayne-corp", WAYNE_TOKEN);
    // The selection screen is shown while an ssk-it project was open.
    tokens.targetRepo({ owner: "ssk-it", repo: "skift-cadrage" });

    const known = inject(KnownReposService);
    const end = known.refresh();
    await replayGithub();
    await end;

    const framedRepos = known
      .repos()
      .filter((d) => d.framed)
      .map((d) => `${d.repoRef.owner}/${d.repoRef.repo}`);
    expect(framedRepos.sort()).toEqual([...FRAMED_REPOS].sort());
    expect(known.error()).toBeNull();
    // The shared target was not moved by the check.
    expect(tokens.currentTarget()).toEqual({
      owner: "ssk-it",
      repo: "skift-cadrage",
    });
  });

  it("writes an already opened repo as GitHub names it", async () => {
    // Typed by hand in lower case: the platform does not distinguish case,
    // but two spellings of an organization would split it into two groups.
    inject(RepoConfig).rememberOpened({
      owner: "wayne-corp",
      repo: "wayne-devis-cadrage",
    });
    inject(TokenService).setForScope("wayne-corp", WAYNE_TOKEN);

    const known = inject(KnownReposService);
    const end = known.refresh();
    await replayGithub();
    await end;

    expect(known.repos()).toEqual([
      {
        repoRef: { owner: "Wayne-Corp", repo: "wayne-devis-cadrage" },
        framed: true,
        recent: true,
      },
    ]);
  });
});

describe("grouping repos by organization", () => {
  const known = (name: string, framed: boolean, recent = false): KnownRepo => {
    const [owner, repo] = name.split("/");
    return { repoRef: { owner, repo }, framed, recent };
  };

  it("sorts organizations by name, and within each the specifications first", () => {
    const groups = groupReposByOrganization([
      known("ssk-it/skift", false),
      known("Wayne-Corp/wayne-devis-cadrage", true),
      known("ssk-it/skift-cadrage", true, true),
      known("ssk-it/mnesisk-cadrage", true),
      known("Globex/site", false),
    ]);

    expect(
      groups.map((g) => [g.organization, g.repos.map((d) => d.repoRef.repo)]),
    ).toEqual([
      ["Globex", ["site"]],
      ["ssk-it", ["mnesisk-cadrage", "skift-cadrage", "skift"]],
      ["Wayne-Corp", ["wayne-devis-cadrage"]],
    ]);
  });

  it("does not split an organization in two depending on case", () => {
    const groups = groupReposByOrganization([
      known("Wayne-Corp/wayne-stock-cadrage", true),
      known("wayne-corp/wayne-chantier-cadrage", true),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].repos).toHaveLength(2);
  });
});
