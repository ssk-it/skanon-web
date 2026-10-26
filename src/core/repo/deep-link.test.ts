import { describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createAppRouter } from "../../router";
import { parseDeepLink } from "./deep-link";

/**
 * Opening through a protocol — RG-ouverture-par-protocole.
 *
 * The browser hands the application the whole `web+canon:` link, in the
 * `lien` parameter of the reception address. This link comes from an outside
 * tool: it must only be able to lead to the application's pages,
 * and never guess a project it does not carry.
 */
describe("parsing a web+canon link", () => {
  it("reads the path of the https address, without the host", () => {
    expect(
      parseDeepLink("web+canon:ssk-it/ssk-canon/cadrages/2026-047"),
    ).toEqual({
      segments: ["ssk-it", "ssk-canon", "cadrages", "2026-047"],
      fragment: null,
    });
  });

  it("opens any view of a project, not only scopings", () => {
    expect(
      parseDeepLink(
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

  it("leaves the project-prefixed identifier to routing", () => {
    // Prefix resolution lives in the scoping page, as for a
    // typed address: the link does not have to redo it.
    expect(
      parseDeepLink("web+canon:org/prime/cadrages/PRMCO-2026-012")?.segments,
    ).toEqual(["org", "prime", "cadrages", "PRMCO-2026-012"]);
  });

  it("accepts a project alone, which routing leads to the specification", () => {
    expect(parseDeepLink("web+canon:ssk-it/ssk-canon")?.segments).toEqual([
      "ssk-it",
      "ssk-canon",
    ]);
  });

  it("tolerates leading and trailing slashes", () => {
    expect(
      parseDeepLink("web+canon:/ssk-it/ssk-canon/cadrages/")?.segments,
    ).toEqual(["ssk-it", "ssk-canon", "cadrages"]);
  });

  it("keeps the anchor, which leads to a decision in its scoping", () => {
    expect(
      parseDeepLink(
        "web+canon:ssk-it/ssk-canon/cadrages/2026-047#02-ce-que-le-lien-designe",
      ),
    ).toEqual({
      segments: ["ssk-it", "ssk-canon", "cadrages", "2026-047"],
      fragment: "02-ce-que-le-lien-designe",
    });
  });

  it("decodes the segments the https address encoded", () => {
    expect(
      parseDeepLink("web+canon:ssk-it/ssk-canon/cadrages/2026%2D047")?.segments,
    ).toEqual(["ssk-it", "ssk-canon", "cadrages", "2026-047"]);
  });

  it("recognises the scheme whatever its case", () => {
    expect(parseDeepLink("WEB+Canon:ssk-it/ssk-canon")?.segments).toEqual([
      "ssk-it",
      "ssk-canon",
    ]);
  });

  it("recognises the scheme's « + » read as a space", () => {
    // In a query string, an unencoded « + » reads as a space:
    // a link pasted as is in the address bar arrives that way.
    expect(parseDeepLink("web canon:ssk-it/ssk-canon")?.segments).toEqual([
      "ssk-it",
      "ssk-canon",
    ]);
  });

  describe("leads to the selection screen", () => {
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
    ])("%s", (_case, link) => {
      expect(parseDeepLink(link)).toBeNull();
    });
  });
});

describe("reception address /ouvrir", () => {
  let router: Router;

  async function open(address: string): Promise<string> {
    router = createAppRouter(createMemoryHistory());
    await router.push(address);
    return router.currentRoute.value.fullPath;
  }

  it("opens the page designated by the link the system encoded", async () => {
    // The whole link arrives encoded as an address component: « + », « : » and « / » as %2B, %3A, %2F.
    expect(
      await open(
        "/ouvrir?lien=web%2Bcanon%3Assk-it%2Fssk-canon%2Fcadrages%2F2026-047",
      ),
    ).toBe("/ssk-it/ssk-canon/cadrages/2026-047");
  });

  it("also opens a skanon: link", async () => {
    expect(
      await open("/ouvrir?lien=skanon%3Assk-it%2Fssk-canon%2Fcadrages"),
    ).toBe("/ssk-it/ssk-canon/cadrages");
  });

  it("carries the anchor through to the page", async () => {
    expect(
      await open(
        "/ouvrir?lien=web%2Bcanon%3Assk-it%2Fssk-canon%2Fcadrages%2F2026-047%2302-ce-que-le-lien-designe",
      ),
    ).toBe("/ssk-it/ssk-canon/cadrages/2026-047#02-ce-que-le-lien-designe");
  });

  it("brings a link that carries no project back to project selection", async () => {
    expect(await open("/ouvrir?lien=web%2Bcanon%3A2026-047")).toBe("/");
  });

  it("does not follow a host carried by the link", async () => {
    expect(
      await open(
        "/ouvrir?lien=web%2Bcanon%3Ahttps%3A%2F%2Fevil.example%2Fa%2Fb",
      ),
    ).toBe("/");
  });

  it("does not leave the reception address in the history", async () => {
    await open("/ssk-it/ssk-canon/referentiel");
    await router.push(
      "/ouvrir?lien=web%2Bcanon%3Assk-it%2Fssk-canon%2Fcadrages",
    );

    router.back();
    await new Promise<void>((r) => {
      const stop = router.afterEach(() => {
        stop();
        r();
      });
    });

    expect(router.currentRoute.value.fullPath).toBe(
      "/ssk-it/ssk-canon/referentiel",
    );
  });
});
