import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";
import { ContentCache, INDEXEDDB_FACTORY } from "../repo/content-cache";

/**
 * RG-contenus-prives-au-repos: a private repo's contents do not outlive
 * the access that read them. The tab's memory is enough to test it: the
 * browser storage follows the same erasures, verified separately.
 */
describe("forgetting an access and private contents", () => {
  const PRIVATE = { owner: "org", repo: "prive" };
  const OTHER = { owner: "autre", repo: "prive" };
  const PUBLIC = { owner: "org", repo: "public" };

  let tokens: TokenService;
  let cache: ContentCache;

  beforeEach(async () => {
    resetInjection();
    provide(INDEXEDDB_FACTORY, null);
    tokens = inject(TokenService);
    cache = inject(ContentCache);
    await cache.saveContent(PRIVATE, "a1", "privé", {
      private: true,
      persist: true,
    });
    await cache.saveContent(OTHER, "a1", "autre", {
      private: true,
      persist: true,
    });
    await cache.saveContent(PUBLIC, "a1", "public", {
      private: false,
      persist: true,
    });
  });

  it("erases all private contents on sign-out", async () => {
    tokens.erase();
    await new Promise((r) => setTimeout(r, 0));

    expect(await cache.loadContent(PRIVATE, "a1")).toBeNull();
    expect(await cache.loadContent(OTHER, "a1")).toBeNull();
    expect(await cache.loadContent(PUBLIC, "a1")).toBe("public");
  });

  it("erases, when a scope is forgotten, only the repos it covered", async () => {
    tokens.setForScope("org", "ghp_jetonDeTestSuffisammentLong");
    tokens.forgetScope("org");
    await new Promise((r) => setTimeout(r, 0));

    expect(await cache.loadContent(PRIVATE, "a1")).toBeNull();
    expect(await cache.loadContent(OTHER, "a1")).toBe("autre");
    expect(await cache.loadContent(PUBLIC, "a1")).toBe("public");
  });
});
