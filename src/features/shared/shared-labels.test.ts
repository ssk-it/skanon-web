import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import OperationChip from "./OperationChip.vue";
import SideToc from "./SideToc.vue";
import StatusChip from "./StatusChip.vue";

/**
 * The small shared pieces say what they show in the displayed language; the values they show stay those of the format (RG-textes-traduits).
 */
describe("shared labels", () => {
  const request = { title: "Supprimer ?", message: "…", action: "Supprimer" };

  it("speak French by default", () => {
    expect(
      mount(StatusChip, { props: { status: "en_relecture" } }).text(),
    ).toBe("En relecture");
    expect(mount(OperationChip, { props: { operation: "cree" } }).text()).toBe(
      "crée",
    );
    expect(
      mount(ConfirmationDialog, { props: { data: request } }).text(),
    ).toContain("Annuler");
    const toc = mount(SideToc, { props: { entries: [] } });
    expect(toc.find("nav").attributes("aria-label")).toBe("Sommaire");
    expect(toc.text()).toContain("Sommaire");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("name a scoping's status and an impact's operation in English", () => {
      expect(
        mount(StatusChip, { props: { status: "en_relecture" } }).text(),
      ).toBe("In review");
      expect(
        mount(OperationChip, { props: { operation: "cree" } }).text(),
      ).toBe("creates");
    });

    it("offer to cancel a confirmation in English", () => {
      const text = mount(ConfirmationDialog, {
        props: { data: request },
      }).text();
      expect(text).toContain("Cancel");
      expect(text).not.toContain("Annuler");
    });

    it("title the table of contents in English, unless the page names it", () => {
      const toc = mount(SideToc, { props: { entries: [] } });
      expect(toc.find("nav").attributes("aria-label")).toBe("Contents");
      expect(toc.text()).toBe("Contents");
      expect(
        mount(SideToc, { props: { entries: [], title: "2026-001" } }).text(),
      ).toBe("2026-001");
    });
  });
});
