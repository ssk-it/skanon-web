import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  TAGS_LIENS_PAR_DEFAUT,
  type ModeAcces,
  type ProtectionDuJeton,
  type Referentiel,
} from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { ReglagesService } from "../../core/repo/reglages.service";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import ReglagesPage from "./ReglagesPage.vue";

function referentiel(
  protectionDuJeton: ProtectionDuJeton,
  acces: ModeAcces = "jeton_personnel",
): Referentiel {
  return {
    projet: { nom: "Test", description: "", depotsCode: [], prefixe: null },
    reglages: {
      acces,
      identite:
        acces === "identite_tierce"
          ? { emetteur: "https://e", client: "c", echange: "https://x" }
          : null,
      protectionDuJeton,
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map(),
    fonctionnalites: new Map(),
    regles: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(),
    anomalies: [],
  };
}

async function monter(
  protection: ProtectionDuJeton = "proposee",
  acces: ModeAcces = "jeton_personnel",
) {
  const store = inject(ReferentielStore);
  store.referentiel.set(referentiel(protection, acces));
  store.etat.set("pret");
  const routeur = createRouteur(createMemoryHistory());
  await routeur.push("/org/depot/reglages");
  await routeur.isReady();
  const vue = mount(ReglagesPage, { global: { plugins: [routeur] } });
  await flushPromises();
  return vue;
}

/**
 * Le réglage de la protection du jeton, et la description de chaque façon de le garder — RG-protection-du-jeton-par-projet, RG-garanties-annoncees.
 */
describe("Réglages : la protection du jeton", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  const section = (vue: Awaited<ReturnType<typeof monter>>) =>
    vue.find(".protection-du-jeton");

  const choix = (vue: Awaited<ReturnType<typeof monter>>, valeur: string) =>
    section(vue).find(`input[type=radio][value=${valeur}]`);

  it("propose la passkey par défaut, sans l’exiger", async () => {
    const vue = await monter();
    expect((choix(vue, "proposee").element as HTMLInputElement).checked).toBe(
      true,
    );
    expect((choix(vue, "exigee").element as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("montre l’exigence que le projet déclare", async () => {
    const vue = await monter("exigee");
    expect((choix(vue, "exigee").element as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("décrit chaque façon de garder le jeton, ce qu’elle protège et ce qu’elle laisse", async () => {
    const texte = section(await monter()).text();
    expect(texte).toContain("En clair, dans le navigateur");
    expect(texte).toContain("Sous passkey, dans le navigateur");
    expect(texte).toContain("Dans le coffre du système");
    expect(texte).toContain("Pour la session seulement");
    // ce qui ne change pas, quelle que soit la forme
    expect(texte).toContain("script");
    expect(texte).toContain("révocation");
  });

  it("dit que l’exigence est celle de l’application, non de GitHub", async () => {
    const texte = section(await monter()).text();
    expect(texte).toContain("non de GitHub");
    expect(texte).toContain("durée de vie");
  });

  it("propose l’exigence par une demande de fusion", async () => {
    const proposer = vi
      .spyOn(inject(ReglagesService), "proposerReglages")
      .mockResolvedValue({
        branche: "reglages",
        pullRequest: 7,
        url: "https://github.com/org/depot/pull/7",
      });
    const vue = await monter();
    await choix(vue, "exigee").setValue(true);
    await vue
      .findAll("button")
      .find((b) => b.text() === "Proposer ces réglages")!
      .trigger("click");
    await flushPromises();
    expect(proposer).toHaveBeenCalledWith(
      expect.objectContaining({ protectionDuJeton: "exigee" }),
    );
  });

  it("ne se montre pas sous une identité tierce, dont l’accès ne dure que la session", async () => {
    const vue = await monter("proposee", "identite_tierce");
    expect(section(vue).exists()).toBe(false);
  });
});
