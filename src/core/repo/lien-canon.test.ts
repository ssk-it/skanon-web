import { describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createRouteur } from "../../routeur";
import { parseLienCanon } from "./lien-canon";

/**
 * L'ouverture par protocole — RG-ouverture-par-protocole.
 *
 * Le navigateur confie à l'application le lien `web+canon:` entier, dans le
 * paramètre `lien` de l'adresse de réception. Ce lien vient d'un outil
 * extérieur : il ne doit pouvoir conduire que vers les pages de l'application,
 * et jamais deviner un projet qu'il ne porte pas.
 */
describe("analyse d’un lien web+canon", () => {
  it("lit le chemin de l’adresse https, sans l’hôte", () => {
    expect(
      parseLienCanon("web+canon:ssk-it/ssk-canon/cadrages/2026-047"),
    ).toEqual({
      segments: ["ssk-it", "ssk-canon", "cadrages", "2026-047"],
      fragment: null,
    });
  });

  it("ouvre toute vue d’un projet, pas seulement les cadrages", () => {
    expect(
      parseLienCanon(
        "web+canon:ssk-it/ssk-canon/referentiel/regle/RG-prefixe-projet",
      ),
    )?.toEqual({
      segments: [
        "ssk-it",
        "ssk-canon",
        "referentiel",
        "regle",
        "RG-prefixe-projet",
      ],
      fragment: null,
    });
  });

  it("laisse au routage l’identifiant préfixé par le projet", () => {
    // La résolution du préfixe vit dans la page du cadrage, comme pour une
    // adresse tapée : le lien n'a pas à la refaire.
    expect(
      parseLienCanon("web+canon:org/prime/cadrages/PRMCO-2026-012")?.segments,
    ).toEqual(["org", "prime", "cadrages", "PRMCO-2026-012"]);
  });

  it("accepte un projet seul, que le routage mène au référentiel", () => {
    expect(parseLienCanon("web+canon:ssk-it/ssk-canon")?.segments).toEqual([
      "ssk-it",
      "ssk-canon",
    ]);
  });

  it("tolère les barres obliques de tête et de fin", () => {
    expect(
      parseLienCanon("web+canon:/ssk-it/ssk-canon/cadrages/")?.segments,
    ).toEqual(["ssk-it", "ssk-canon", "cadrages"]);
  });

  it("garde l’ancre, qui mène à une décision dans son cadrage", () => {
    expect(
      parseLienCanon(
        "web+canon:ssk-it/ssk-canon/cadrages/2026-047#02-ce-que-le-lien-designe",
      ),
    ).toEqual({
      segments: ["ssk-it", "ssk-canon", "cadrages", "2026-047"],
      fragment: "02-ce-que-le-lien-designe",
    });
  });

  it("décode les segments que l’adresse https encodait", () => {
    expect(
      parseLienCanon("web+canon:ssk-it/ssk-canon/cadrages/2026%2D047")
        ?.segments,
    ).toEqual(["ssk-it", "ssk-canon", "cadrages", "2026-047"]);
  });

  it("reconnaît le schéma quel que soit sa casse", () => {
    expect(parseLienCanon("WEB+Canon:ssk-it/ssk-canon")?.segments).toEqual([
      "ssk-it",
      "ssk-canon",
    ]);
  });

  it("reconnaît le « + » du schéma lu comme une espace", () => {
    // Dans une chaîne de requête, un « + » non encodé se lit comme une espace :
    // un lien collé tel quel dans la barre d'adresse arrive ainsi.
    expect(parseLienCanon("web canon:ssk-it/ssk-canon")?.segments).toEqual([
      "ssk-it",
      "ssk-canon",
    ]);
  });

  describe("mène à l’écran de choix", () => {
    it.each([
      ["un paramètre absent", null],
      ["un paramètre vide", ""],
      ["un autre schéma", "mailto:ssk-it/ssk-canon"],
      ["un lien sans projet", "web+canon:"],
      ["un lien sans dépôt", "web+canon:ssk-it"],
      ["un identifiant seul", "web+canon:2026-047"],
      [
        "une adresse complète",
        "web+canon:https://evil.example/ssk-it/ssk-canon",
      ],
      ["un autre schéma imbriqué", "web+canon:javascript:alert(1)"],
      ["un hôte sans schéma", "web+canon://evil.example/ssk-it/ssk-canon"],
      [
        "un hôte derrière une contre-oblique",
        "web+canon:\\\\evil.example/ssk-it/ssk-canon",
      ],
      ["un segment parent", "web+canon:ssk-it/ssk-canon/../../evil"],
      ["un segment parent encodé", "web+canon:ssk-it/%2E%2E/ssk-canon"],
      ["un segment courant", "web+canon:ssk-it/./ssk-canon"],
      ["un encodage invalide", "web+canon:ssk-it/ssk-canon/%E0%A4%A"],
      [
        "une barre oblique encodée dans un segment",
        "web+canon:ssk-it%2Fssk-canon/cadrages",
      ],
    ])("%s", (_cas, lien) => {
      expect(parseLienCanon(lien)).toBeNull();
    });
  });
});

describe("adresse de réception /ouvrir", () => {
  let router: Router;

  async function ouvrir(adresse: string): Promise<string> {
    router = createRouteur(createMemoryHistory());
    await router.push(adresse);
    return router.currentRoute.value.fullPath;
  }

  it("ouvre la page désignée par le lien que le système a encodé", async () => {
    // Le lien entier arrive encodé comme un composant d'adresse : « + », « : » et « / » en %2B, %3A, %2F.
    expect(
      await ouvrir(
        "/ouvrir?lien=web%2Bcanon%3Assk-it%2Fssk-canon%2Fcadrages%2F2026-047",
      ),
    ).toBe("/ssk-it/ssk-canon/cadrages/2026-047");
  });

  it("ouvre aussi un lien skanon:", async () => {
    expect(
      await ouvrir("/ouvrir?lien=skanon%3Assk-it%2Fssk-canon%2Fcadrages"),
    ).toBe("/ssk-it/ssk-canon/cadrages");
  });

  it("porte l’ancre jusqu’à la page", async () => {
    expect(
      await ouvrir(
        "/ouvrir?lien=web%2Bcanon%3Assk-it%2Fssk-canon%2Fcadrages%2F2026-047%2302-ce-que-le-lien-designe",
      ),
    ).toBe("/ssk-it/ssk-canon/cadrages/2026-047#02-ce-que-le-lien-designe");
  });

  it("ramène au choix du projet un lien qui n’en porte pas", async () => {
    expect(await ouvrir("/ouvrir?lien=web%2Bcanon%3A2026-047")).toBe("/");
  });

  it("ne suit pas un hôte porté par le lien", async () => {
    expect(
      await ouvrir(
        "/ouvrir?lien=web%2Bcanon%3Ahttps%3A%2F%2Fevil.example%2Fa%2Fb",
      ),
    ).toBe("/");
  });

  it("ne laisse pas l’adresse de réception dans l’historique", async () => {
    await ouvrir("/ssk-it/ssk-canon/referentiel");
    await router.push(
      "/ouvrir?lien=web%2Bcanon%3Assk-it%2Fssk-canon%2Fcadrages",
    );

    router.back();
    await new Promise<void>((r) => {
      const arret = router.afterEach(() => {
        arret();
        r();
      });
    });

    expect(router.currentRoute.value.fullPath).toBe(
      "/ssk-it/ssk-canon/referentiel",
    );
  });
});
