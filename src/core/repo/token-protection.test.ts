import { beforeEach, describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { TokenService } from "../github/token.service";
import { parseTokenProtection, RepoLoader } from "./repo-loader";
import { SpecificationStore } from "./specification.store";
import { writeSettings } from "./config-writer";

/**
 * Un projet règle s'il exige que le jeton qui l'ouvre soit gardé sous passkey (RG-protection-du-jeton-par-projet). Le réglage vit dans `ssk-canon.yml`, comme le mode d'accès.
 */
describe("protection du jeton déclarée par le projet", () => {
  it("propose la passkey quand rien n’est déclaré", () => {
    // un projet qui ne règle rien fonctionne comme avant
    const { protection, anomaly } = parseTokenProtection(undefined);
    expect(protection).toBe("proposee");
    expect(anomaly).toBeNull();
  });

  it("lit les deux valeurs connues", () => {
    expect(parseTokenProtection("exigee").protection).toBe("exigee");
    expect(parseTokenProtection("proposee").protection).toBe("proposee");
  });

  it("signale une valeur inconnue, et s’en tient à la proposition", () => {
    // le taire laisserait croire au projet qu'il exige ce qu'il n'exige pas
    const { protection, anomaly } = parseTokenProtection("obligatoire");
    expect(protection).toBe("proposee");
    expect(anomaly).toContain("obligatoire");
    expect(anomaly).toContain("exigee");
  });
});

const FILE = `schema_version: 1

# Comment les rédacteurs obtiennent l'accès au dépôt.
acces: jeton_personnel
`;

const BASE = { access: "jeton_personnel" as const, identity: null };

describe("écriture de la protection du jeton", () => {
  it("écrit l’exigence, et la relit", () => {
    const out = writeSettings(FILE, {
      ...BASE,
      tokenProtection: "exigee",
    });
    const data = load(out) as Record<string, unknown>;
    expect(data["protection_du_jeton"]).toBe("exigee");
    expect(parseTokenProtection(data["protection_du_jeton"]).protection).toBe(
      "exigee",
    );
  });

  it("retire le bloc quand le projet ne fait plus que proposer", () => {
    // la valeur par défaut n'a pas à s'écrire : un fichier qui ne dit rien la vaut
    const withValue = writeSettings(FILE, {
      ...BASE,
      tokenProtection: "exigee",
    });
    const without = writeSettings(withValue, {
      ...BASE,
      tokenProtection: "proposee",
    });
    expect(
      (load(without) as Record<string, unknown>)["protection_du_jeton"],
    ).toBe(undefined);
    expect(without).not.toContain("passkey");
  });

  it("laisse le fichier tel quel quand le réglage n’est pas fourni", () => {
    const out = writeSettings(FILE, BASE);
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
  async function respond(config: string): Promise<void> {
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
    const expected = inject(RepoLoader).loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
    await respond("schema_version: 1\nprotection_du_jeton: exigee\n");
    expect((await expected).settings.tokenProtection).toBe("exigee");
  });

  it("la transmet au jeton dès que le projet est lu", async () => {
    const tokens = inject(TokenService);
    const loaded = inject(SpecificationStore).loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
    await respond("schema_version: 1\nprotection_du_jeton: exigee\n");
    await loaded;
    expect(tokens.protectionRequired()).toBe(true);
  });
});
