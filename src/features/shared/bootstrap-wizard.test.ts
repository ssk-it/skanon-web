import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubError } from "../../core/github/github-client";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide, resetInjection } from "../../core/injection";
import {
  BootstrapService,
  proposedNames,
  type NewProject,
} from "../../core/repo/bootstrap.service";
import {
  AutomationRefused,
  AutomationService,
} from "../../core/repo/automation.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import BootstrapWizard from "./BootstrapWizard.vue";

/**
 * The bootstrap assistant (RG-amorcage-depot, RG-amorcage-explique, scoping
 * 2026-062): only the name is required, every other step may be skipped, and
 * each notion is explained at the step whose question it bears on.
 */
describe("The bootstrap assistant", () => {
  let created: NewProject[];
  let installs: number;
  let installFails: boolean;
  let reloads: number;

  beforeEach(() => {
    resetInjection();
    created = [];
    installs = 0;
    installFails = false;
    reloads = 0;
    provide(SpecificationStore, {
      repoRef: () => ({ owner: "org", repo: "atlas-cadrage" }),
      loadSpecification: async () => void reloads++,
    });
    provide(BootstrapService, {
      plannedFiles: (p: NewProject) => [
        { path: "ssk-canon.yml", content: "" },
        {
          path: `${(p.names ?? proposedNames(p.language)).dossiers.regles}/README.md`,
          content: "",
        },
      ],
      bootstrapProject: async (p: NewProject) => void created.push(p),
    });
    provide(AutomationService, {
      install: async () => {
        installs++;
        if (installFails) throw new AutomationRefused();
        reloads++;
      },
    });
  });

  function render(): VueWrapper {
    return mount(BootstrapWizard, { attachTo: document.body });
  }

  function button(view: VueWrapper, label: string) {
    const found = view.findAll("button").find((b) => b.text().trim() === label);
    if (!found) throw new Error(`no button « ${label} »`);
    return found;
  }

  async function click(view: VueWrapper, label: string): Promise<void> {
    await button(view, label).trigger("click");
    await flushPromises();
  }

  async function goToSummary(view: VueWrapper): Promise<void> {
    await click(view, "Suivant");
    await click(view, "Passer");
    await click(view, "Passer");
    await click(view, "Passer");
  }

  it("starts at the project, the repo being already chosen", () => {
    const view = render();
    expect(view.find(".etapes .faite").text()).toContain("Dépôt");
    expect(view.find(".etapes .courante").text()).toContain("Projet");
    expect(
      (view.find('input[name="nomProjet"]').element as HTMLInputElement).value,
    ).toBe("atlas-cadrage");
  });

  it("requires the name, and nothing else", async () => {
    const view = render();
    await view.find('input[name="nomProjet"]').setValue("  ");
    expect(button(view, "Suivant").attributes("disabled")).toBeDefined();
    expect(view.findAll("button").some((b) => b.text() === "Passer")).toBe(
      false,
    );
    await view.find('input[name="nomProjet"]').setValue("Atlas");
    expect(button(view, "Suivant").attributes("disabled")).toBeUndefined();
  });

  it("explains each notion at the step that needs it, not before", async () => {
    const view = render();
    expect(view.text()).toContain(
      "Un référentiel décrit ce que fait le produit",
    );
    expect(view.text()).not.toContain("Un domaine");
    await click(view, "Suivant");
    expect(view.text()).toContain("Un domaine");
    expect(view.text()).not.toContain("Un cadrage");
    await click(view, "Passer");
    expect(view.text()).toContain("Un cadrage");
    expect(view.text()).toContain("propagation");
    await click(view, "Passer");
    expect(view.text()).toContain("dépôts de code");
  });

  it("skipping everything gives today's bootstrap, with its automation", async () => {
    const view = render();
    await goToSummary(view);
    await click(view, "Créer le référentiel");
    expect(created).toEqual([
      {
        name: "atlas-cadrage",
        description: "",
        language: "fr",
        names: proposedNames("fr"),
        codeRepos: [],
        linkTags: [],
      },
    ]);
    expect(installs).toBe(1);
    expect(reloads).toBe(1);
  });

  it("lists the files before writing them", async () => {
    const view = render();
    await goToSummary(view);
    expect(view.text()).toContain("ssk-canon.yml");
    expect(view.text()).toContain("regles/README.md");
    expect(view.text()).toContain(".github/workflows/");
    expect(created).toEqual([]);
  });

  it("proposes the folder names in the interface's language, and keeps the ones chosen", async () => {
    const view = render();
    await click(view, "Suivant");
    const rules = view.find('input[name="dossier-regles"]');
    expect((rules.element as HTMLInputElement).value).toBe("regles");
    await rules.setValue("rg");
    await click(view, "Suivant");
    await click(view, "Passer");
    await click(view, "Passer");
    expect(view.text()).toContain("rg/README.md");
    await click(view, "Créer le référentiel");
    expect(created[0].names?.dossiers.regles).toBe("rg");
  });

  it("refuses a faulty name before writing anything", async () => {
    const view = render();
    await click(view, "Suivant");
    await view.find('input[name="dossier-regles"]').setValue(".cache");
    expect(view.text()).toContain("regles");
    expect(view.find(".anomalies").exists()).toBe(true);
    expect(button(view, "Suivant").attributes("disabled")).toBeDefined();
  });

  it("does not install the automation when unticked", async () => {
    const view = render();
    await click(view, "Suivant");
    await click(view, "Passer");
    await view.find('input[type="checkbox"]').setValue(false);
    await click(view, "Suivant");
    await click(view, "Passer");
    expect(view.text()).not.toContain(".github/workflows/");
    await click(view, "Créer le référentiel");
    expect(installs).toBe(0);
    expect(reloads).toBe(1);
  });

  it("writes the code repos and link kinds declared", async () => {
    const view = render();
    await click(view, "Suivant");
    await click(view, "Passer");
    await click(view, "Passer");
    await view
      .find('textarea[name="depotsCode"]')
      .setValue("org/atlas-front Application web\n\norg/atlas-back\n");
    await view
      .find('input[name="naturesLien"]')
      .setValue("Issue GitHub, maquette");
    await click(view, "Suivant");
    await click(view, "Créer le référentiel");
    expect(created[0].codeRepos).toEqual([
      { repo: "org/atlas-front", role: "Application web" },
      { repo: "org/atlas-back", role: "" },
    ]);
    expect(created[0].linkTags).toEqual(["issue_github", "maquette"]);
  });

  it("refuses a code repo it cannot read", async () => {
    const view = render();
    await click(view, "Suivant");
    await click(view, "Passer");
    await click(view, "Passer");
    await view.find('textarea[name="depotsCode"]').setValue("atlas-front");
    expect(view.text()).toContain("atlas-front");
    expect(button(view, "Suivant").attributes("disabled")).toBeDefined();
  });

  it("names the refused automation, the specification being created", async () => {
    installFails = true;
    const view = render();
    await goToSummary(view);
    await click(view, "Créer le référentiel");
    expect(created).toHaveLength(1);
    expect(view.text()).toContain("Workflows");
    // The refusal stays on screen until the author opens the specification.
    expect(reloads).toBe(0);
    await click(view, "Ouvrir le référentiel");
    expect(reloads).toBe(1);
  });

  it("says why the creation failed", async () => {
    provide(BootstrapService, {
      plannedFiles: () => [],
      bootstrapProject: async () => {
        throw new GithubError("Cet accès ne permet pas d’écrire.", 403);
      },
    });
    const view = render();
    await goToSummary(view);
    await click(view, "Créer le référentiel");
    expect(view.text()).toContain("Cet accès ne permet pas d’écrire.");
    expect(installs).toBe(0);
    expect(reloads).toBe(0);
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("speaks English and proposes English names", async () => {
      const view = render();
      expect(view.text()).toContain(
        "A specification describes what the product does",
      );
      await click(view, "Next");
      expect(
        (view.find('input[name="dossier-regles"]').element as HTMLInputElement)
          .value,
      ).toBe("rules");
      await click(view, "Skip");
      await click(view, "Skip");
      await click(view, "Skip");
      await click(view, "Create the specification");
      expect(created[0].language).toBe("en");
      expect(created[0].names).toEqual(proposedNames("en"));
    });
  });
});
