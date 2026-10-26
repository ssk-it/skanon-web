import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";

/**
 * After a save, the reading view showed the previous state for several
 * minutes: `raw` serves with `max-age: 300`, and a branch's URL does not
 * change when its content changes. Reading at the commit SHA — which the tree
 * call already returns — gives a fresh URL on every write, so never served
 * from a cache.
 */
describe("reading contents at the commit", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();

    httpMock = provideHttpTesting();
  });

  it("requests the file at the resolved commit, not by the branch name", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "cadrage-2026-006",
    });

    const tree = httpMock.expectOne(
      "https://api.github.com/repos/org/projet/git/trees/cadrage-2026-006?recursive=1",
    );
    tree.flush({
      sha: "c0mm17",
      truncated: false,
      tree: [{ path: "rules/RG-exemple.md", sha: "b10b", type: "blob" }],
    });

    // Loading contents starts only once the tree is returned: let the queue run
    // before claiming the next request.
    await new Promise((r) => setTimeout(r, 0));

    const content = httpMock.expectOne(
      "https://raw.githubusercontent.com/org/projet/c0mm17/rules/RG-exemple.md",
    );
    content.flush("---\nid: RG-exemple\nstatut: actif\n---\n\nUn énoncé.\n");

    const specification = await expected;
    expect(specification.rules.get("RG-exemple")).toBeTruthy();
    httpMock.verify();
  });
});
