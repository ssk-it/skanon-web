import { describe, expect, it } from "vitest";
import { montePage, textePage } from "../test-pages";
import { extensionWeb } from "./extension";

/**
 * Ce que la version web dit d'elle-même, dans l'aide et les mentions : son hébergement, son service worker et sa licence — RG-aide-fidele, RG-mentions-legales, ADR-extensions-commerciales.
 */
describe("l'extension de la version web", () => {
  it("nomme, dans l'aide, le site d'où elle est servie", async () => {
    const texte = await textePage("/aide", "web", [extensionWeb()]);
    expect(texte).toContain("Le site d’où Skanon est servi");
  });

  it("dit, dans l'aide, que le navigateur garde l'application pour s'ouvrir hors ligne", async () => {
    const texte = await textePage("/aide", "web", [extensionWeb()]);
    expect(texte).toContain(
      "gardée par le navigateur, pour s’ouvrir hors ligne",
    );
  });

  it("nomme son hébergeur dans les mentions", async () => {
    const texte = await textePage("/mentions-legales", "web", [extensionWeb()]);
    expect(texte).toContain("SCALEWAY SAS, BP 438, 75366 Paris Cedex 08");
  });

  it("dit, dans les mentions, que l'interface et la version web sont en source disponible, avec le lien vers leurs sources", async () => {
    const page = await montePage("/mentions-legales", "web", [extensionWeb()]);
    expect(page.text()).toContain(
      "L’interface de Skanon et sa version web sont publiées en source disponible, sous la licence FSL-1.1-ALv2",
    );
    const sources = page.get('a[href="https://github.com/ssk-it/skanon-web"]');
    expect(sources.text()).toBe("ssk-it/skanon-web");
  });
});
