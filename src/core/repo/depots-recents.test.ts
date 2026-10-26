import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoConfig, memeDepot, DEPOT_DEFAUT } from "./repo-config";

/**
 * La liste des dépôts déjà ouverts vit dans le navigateur. Ces cas portent sur
 * ce qui doit rester vrai quand on passe d'un projet à l'autre, et sur ce que
 * le stockage peut rendre de tordu.
 */
describe("dépôts déjà ouverts", () => {
  let config: RepoConfig;

  // Le banc d'essai ne fournit qu'un `localStorage` incomplet, sans `clear` ni
  // `removeItem`. On en substitue un vrai : ce qui est éprouvé ici est la
  // mémoire des dépôts, pas la capacité du navigateur à stocker.
  let stockage: Record<string, string>;

  beforeEach(() => {
    stockage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => stockage[c] ?? null,
        setItem: (c: string, v: string) => void (stockage[c] = v),
        removeItem: (c: string) => void delete stockage[c],
        clear: () => void (stockage = {}),
      },
    });
    resetInjection();
    config = inject(RepoConfig);
  });

  it("ne retient rien tant qu’aucun dépôt n’a été ouvert", () => {
    expect(config.recents()).toEqual([]);
  });

  it("retient un dépôt effectivement ouvert", () => {
    config.memoriserOuvert({ owner: "ssk-it", repo: "ssk-canon" });
    expect(config.recents()).toEqual([{ owner: "ssk-it", repo: "ssk-canon" }]);
  });

  it("remonte un dépôt rouvert plutôt que de le dupliquer", () => {
    config.memoriserOuvert({ owner: "a", repo: "un" });
    config.memoriserOuvert({ owner: "b", repo: "deux" });
    config.memoriserOuvert({ owner: "a", repo: "un" });

    expect(config.recents().map((d) => d.repo)).toEqual(["un", "deux"]);
  });

  it("reconnaît le même dépôt quelle que soit la casse", () => {
    // La plateforme ne distingue pas la casse : deux entrées pour un seul dépôt
    // proposeraient deux fois la même chose.
    config.memoriserOuvert({ owner: "SSK-IT", repo: "ssk-canon" });
    config.memoriserOuvert({ owner: "ssk-it", repo: "SSK-Canon" });
    expect(config.recents().length).toBe(1);
  });

  it("oublie un dépôt sans toucher aux autres", () => {
    config.memoriserOuvert({ owner: "a", repo: "un" });
    config.memoriserOuvert({ owner: "b", repo: "deux" });
    config.oublier({ owner: "a", repo: "un" });
    expect(config.recents().map((d) => d.repo)).toEqual(["deux"]);
  });

  it("borne la liste, les plus anciens sortant", () => {
    for (let i = 0; i < 20; i++)
      config.memoriserOuvert({ owner: "o", repo: `d${i}` });
    expect(config.recents().length).toBe(12);
    expect(config.recents()[0].repo).toBe("d19");
  });

  it("survit à un stockage corrompu, sans empêcher l’application de démarrer", () => {
    stockage["ssk-canon.depots-recents"] = "ceci n’est pas du JSON";
    resetInjection();
    expect(inject(RepoConfig).recents()).toEqual([]);
  });

  it("écarte les entrées incomplètes qu’une ancienne version aurait laissées", () => {
    stockage["ssk-canon.depots-recents"] = JSON.stringify([
      { owner: "ssk-it" },
      { owner: "ssk-it", repo: "ssk-canon" },
    ]);
    resetInjection();
    expect(inject(RepoConfig).recents()).toEqual([
      { owner: "ssk-it", repo: "ssk-canon" },
    ]);
  });

  it("garde le dépôt par défaut quand rien n’est mémorisé", () => {
    expect(config.depot()).toEqual(DEPOT_DEFAUT);
  });
});

describe("identité d’un dépôt", () => {
  it("ignore la casse des deux côtés", () => {
    expect(
      memeDepot({ owner: "A", repo: "B" }, { owner: "a", repo: "b" }),
    ).toBe(true);
    expect(
      memeDepot({ owner: "a", repo: "b" }, { owner: "a", repo: "c" }),
    ).toBe(false);
  });
});
