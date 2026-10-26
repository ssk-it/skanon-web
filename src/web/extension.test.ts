import { describe, expect, it } from "vitest";
import { mountPage, pageText } from "../test-pages";
import { webExtension } from "./extension";

/**
 * What the web version says about itself, in help and the legal notice: its hosting, its service worker and its licence — RG-aide-fidele, RG-mentions-legales, ADR-extensions-commerciales.
 */
describe("the web version's extension", () => {
  it("names, in help, the site it is served from", async () => {
    const text = await pageText("/aide", "web", [webExtension()]);
    expect(text).toContain("Le site d’où Skanon est servi");
  });

  it("says, in help, that the browser keeps the application to open offline", async () => {
    const text = await pageText("/aide", "web", [webExtension()]);
    expect(text).toContain(
      "gardée par le navigateur, pour s’ouvrir hors ligne",
    );
  });

  it("names its host in the legal notice", async () => {
    const text = await pageText("/mentions-legales", "web", [webExtension()]);
    expect(text).toContain("SCALEWAY SAS, BP 438, 75366 Paris Cedex 08");
  });

  it("says, in the legal notice, that the interface and the web version are source-available, with the link to their sources", async () => {
    const page = await mountPage("/mentions-legales", "web", [webExtension()]);
    expect(page.text()).toContain(
      "L’interface de Skanon et sa version web sont publiées en source disponible, sous la licence FSL-1.1-ALv2",
    );
    const sources = page.get('a[href="https://github.com/ssk-it/skanon-web"]');
    expect(sources.text()).toBe("ssk-it/skanon-web");
  });
});
