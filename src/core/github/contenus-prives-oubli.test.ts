import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "./token.service";
import { ContenusCache, FABRIQUE_INDEXEDDB } from "../repo/contenus-cache";

/**
 * RG-contenus-prives-au-repos : les contenus d'un dépôt privé ne survivent pas
 * à l'accès qui les a lus. La mémoire de l'onglet suffit à l'éprouver : le
 * stockage du navigateur suit les mêmes effacements, vérifiés à part.
 */
describe("oubli d’un accès et contenus privés", () => {
  const PRIVE = { owner: "org", repo: "prive" };
  const AUTRE = { owner: "autre", repo: "prive" };
  const PUBLIC = { owner: "org", repo: "public" };

  let tokens: TokenService;
  let cache: ContenusCache;

  beforeEach(async () => {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, null);
    tokens = inject(TokenService);
    cache = inject(ContenusCache);
    await cache.saveContenu(PRIVE, "a1", "privé", {
      prive: true,
      persister: true,
    });
    await cache.saveContenu(AUTRE, "a1", "autre", {
      prive: true,
      persister: true,
    });
    await cache.saveContenu(PUBLIC, "a1", "public", {
      prive: false,
      persister: true,
    });
  });

  it("efface tous les contenus privés à la déconnexion", async () => {
    tokens.effacer();
    await new Promise((r) => setTimeout(r, 0));

    expect(await cache.loadContenu(PRIVE, "a1")).toBeNull();
    expect(await cache.loadContenu(AUTRE, "a1")).toBeNull();
    expect(await cache.loadContenu(PUBLIC, "a1")).toBe("public");
  });

  it("n’efface, à l’oubli d’une portée, que les dépôts qu’elle couvrait", async () => {
    tokens.definirPourPortee("org", "ghp_jetonDeTestSuffisammentLong");
    tokens.oublierPortee("org");
    await new Promise((r) => setTimeout(r, 0));

    expect(await cache.loadContenu(PRIVE, "a1")).toBeNull();
    expect(await cache.loadContenu(AUTRE, "a1")).toBe("autre");
    expect(await cache.loadContenu(PUBLIC, "a1")).toBe("public");
  });
});
