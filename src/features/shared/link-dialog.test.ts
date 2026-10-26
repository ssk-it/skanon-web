import { mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import type { ExternalLink } from "../../core/model/model";
import LinkDialog from "./LinkDialog.vue";

/**
 * Entering an external link: the kind is entered by its label, in the displayed language, and written by its key (RG-nature-lien-normalisee).
 */
async function fill(
  view: VueWrapper,
  url: string,
  tag: string,
): Promise<ExternalLink | undefined> {
  const [address, , kind] = view.findAll("input");
  await address!.setValue(url);
  await kind!.setValue(tag);
  await view.findAll("button").at(-1)!.trigger("click");
  return view.emitted("close")?.[0]?.[0] as ExternalLink | undefined;
}

describe("LinkDialog", () => {
  it("writes the key of a kind entered by its French label", async () => {
    const view = mount(LinkDialog);
    const link = await fill(view, "https://trello.com/c/abc", "Carte Trello");
    expect(link?.tag).toBe("carte_trello");
  });

  it("writes a new kind in its reduced form", async () => {
    const view = mount(LinkDialog);
    const link = await fill(view, "https://example.org/x", "Ticket Jira");
    expect(link?.tag).toBe("ticket_jira");
  });

  it("shows the label of the corrected link's kind", () => {
    const view = mount(LinkDialog, {
      props: {
        data: {
          tag: "carte_trello",
          url: "https://trello.com/c/abc",
          name: "",
        },
      },
    });
    expect(view.text()).toContain("Modifier le lien");
    expect(view.findAll("input")[2]!.element.value).toBe("Carte Trello");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("writes carte_trello for « Trello card », never trello_card", async () => {
      const view = mount(LinkDialog);
      const link = await fill(view, "https://trello.com/c/abc", "Trello card");
      expect(link?.tag).toBe("carte_trello");
    });

    it("shows the corrected link's kind by its English label", () => {
      const view = mount(LinkDialog, {
        props: {
          data: { tag: "piste", url: "https://example.org/x", name: "" },
        },
      });
      expect(view.findAll("input")[2]!.element.value).toBe("Roadmap item");
    });

    it("speaks English, not French", () => {
      const text = mount(LinkDialog).text();
      expect(text).toContain("Add a link");
      expect(text).toContain("Cancel");
      for (const french of ["Ajouter un lien", "Annuler", "Adresse", "Nature"])
        expect(text).not.toContain(french);
    });

    it("says in English why a kind cannot be written", async () => {
      const view = mount(LinkDialog);
      await view.findAll("input")[2]!.setValue("…");
      expect(view.text()).toContain(
        "A kind is written with letters or digits.",
      );
    });
  });
});
