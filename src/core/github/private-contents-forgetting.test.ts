import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";
import { ContentCache, INDEXEDDB_FACTORY } from "../repo/content-cache";

/**
 * RG-contenus-prives-au-repos : les contenus d'un dépôt privé ne survivent pas
 * à l'accès qui les a lus. La mémoire de l'onglet suffit à l'éprouver : le
 * stockage du navigateur suit les mêmes effacements, vérifiés à part.
 */
describe("oubli d’un accès et contenus privés", () => {
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

  it("efface tous les contenus privés à la déconnexion", async () => {
    tokens.erase();
    await new Promise((r) => setTimeout(r, 0));

    expect(await cache.loadContent(PRIVATE, "a1")).toBeNull();
    expect(await cache.loadContent(OTHER, "a1")).toBeNull();
    expect(await cache.loadContent(PUBLIC, "a1")).toBe("public");
  });

  it("n’efface, à l’oubli d’une portée, que les dépôts qu’elle couvrait", async () => {
    tokens.setForScope("org", "ghp_jetonDeTestSuffisammentLong");
    tokens.forgetScope("org");
    await new Promise((r) => setTimeout(r, 0));

    expect(await cache.loadContent(PRIVATE, "a1")).toBeNull();
    expect(await cache.loadContent(OTHER, "a1")).toBe("autre");
    expect(await cache.loadContent(PUBLIC, "a1")).toBe("public");
  });
});
