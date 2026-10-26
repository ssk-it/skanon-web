import { beforeEach, describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { TokenService } from "../github/token.service";
import { parseProtectionDuJeton, RepoLoader } from "./repo-loader";
import { ReferentielStore } from "./referentiel.store";
import { ecrireReglages } from "./config-ecriture";

/**
 * Un projet règle s'il exige que le jeton qui l'ouvre soit gardé sous passkey (RG-protection-du-jeton-par-projet). Le réglage vit dans `ssk-canon.yml`, comme le mode d'accès.
 */
describe("protection du jeton déclarée par le projet", () => {
  it("propose la passkey quand rien n’est déclaré", () => {
    // un projet qui ne règle rien fonctionne comme avant
    const { protection, anomalie } = parseProtectionDuJeton(undefined);
    expect(protection).toBe("proposee");
    expect(anomalie).toBeNull();
  });

  it("lit les deux valeurs connues", () => {
    expect(parseProtectionDuJeton("exigee").protection).toBe("exigee");
    expect(parseProtectionDuJeton("proposee").protection).toBe("proposee");
  });

  it("signale une valeur inconnue, et s’en tient à la proposition", () => {
    // le taire laisserait croire au projet qu'il exige ce qu'il n'exige pas
    const { protection, anomalie } = parseProtectionDuJeton("obligatoire");
    expect(protection).toBe("proposee");
    expect(anomalie).toContain("obligatoire");
    expect(anomalie).toContain("exigee");
  });
});

const FICHIER = `schema_version: 1

# Comment les rédacteurs obtiennent l'accès au dépôt.
acces: jeton_personnel
`;

const BASE = { acces: "jeton_personnel" as const, identite: null };

describe("écriture de la protection du jeton", () => {
  it("écrit l’exigence, et la relit", () => {
    const out = ecrireReglages(FICHIER, {
      ...BASE,
      protectionDuJeton: "exigee",
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["protection_du_jeton"]).toBe("exigee");
    expect(parseProtectionDuJeton(data["protection_du_jeton"]).protection).toBe(
      "exigee",
    );
  });

  it("retire le bloc quand le projet ne fait plus que proposer", () => {
    // la valeur par défaut n'a pas à s'écrire : un fichier qui ne dit rien la vaut
    const avec = ecrireReglages(FICHIER, {
      ...BASE,
      protectionDuJeton: "exigee",
    });
    const sans = ecrireReglages(avec, {
      ...BASE,
      protectionDuJeton: "proposee",
    });
    expect((load(sans) as Record<string, unknown>)["protection_du_jeton"]).toBe(
      undefined,
    );
    expect(sans).not.toContain("passkey");
  });

  it("laisse le fichier tel quel quand le réglage n’est pas fourni", () => {
    const out = ecrireReglages(FICHIER, BASE);
    expect(out).not.toContain("protection_du_jeton");
  });
});

describe("le projet ouvert dit au jeton ce qu’il exige", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    httpMock = provideHttpTesting();
  });

  /** Répond au chargement d'un dépôt qui ne porte que sa configuration ; les autres requêtes — branches, demandes de fusion — restent sans réponse, ce qui ne gêne pas la lecture principale. */
  async function repondre(config: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: [{ path: "ssk-canon.yml", sha: "b10b", type: "blob" }],
      });
    await new Promise((r) => setTimeout(r, 0));
    httpMock.expectOne((r) => r.url.endsWith("/ssk-canon.yml")).flush(config);
  }

  it("lit l’exigence dans la configuration du projet", async () => {
    const attendu = inject(RepoLoader).loadReferentiel({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
    await repondre("schema_version: 1\nprotection_du_jeton: exigee\n");
    expect((await attendu).reglages.protectionDuJeton).toBe("exigee");
  });

  it("la transmet au jeton dès que le projet est lu", async () => {
    const tokens = inject(TokenService);
    const charge = inject(ReferentielStore).loadReferentiel({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
    await repondre("schema_version: 1\nprotection_du_jeton: exigee\n");
    await charge;
    expect(tokens.protectionExigee()).toBe(true);
  });
});
