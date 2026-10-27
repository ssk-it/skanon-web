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
 * A project sets whether it requires the token that opens it to be kept under a passkey (RG-protection-du-jeton-par-projet). The setting lives in `ssk-canon.yml`.
 */
describe("token protection declared by the project", () => {
  it("offers the passkey when nothing is declared", () => {
    // a project that sets nothing works as before
    const { protection, anomaly } = parseTokenProtection(undefined);
    expect(protection).toBe("proposee");
    expect(anomaly).toBeNull();
  });

  it("reads the two known values", () => {
    expect(parseTokenProtection("exigee").protection).toBe("exigee");
    expect(parseTokenProtection("proposee").protection).toBe("proposee");
  });

  it("reports an unknown value, and sticks to the proposal", () => {
    // keeping quiet would let the project believe it requires what it does not
    const { protection, anomaly } = parseTokenProtection("obligatoire");
    expect(protection).toBe("proposee");
    expect(anomaly).toContain("obligatoire");
    expect(anomaly).toContain("exigee");
  });
});

const FILE = `schema_version: 1
`;

const BASE = {};

describe("writing the token protection", () => {
  it("writes the requirement, and reads it back", () => {
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

  it("removes the block when the project only proposes", () => {
    // the default value need not be written: a file that says nothing amounts to it
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

  it("leaves the file as is when the setting is not provided", () => {
    const out = writeSettings(FILE, BASE);
    expect(out).not.toContain("protection_du_jeton");
  });
});

describe("the open project tells the token what it requires", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    httpMock = provideHttpTesting();
  });

  /** Responds to the load of a repo that carries only its configuration; the other requests — branches, pull requests — stay unanswered, which does not hinder the main read. */
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

  it("reads the requirement in the project's configuration", async () => {
    const expected = inject(RepoLoader).loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });
    await respond("schema_version: 1\nprotection_du_jeton: exigee\n");
    expect((await expected).settings.tokenProtection).toBe("exigee");
  });

  it("passes it to the token as soon as the project is read", async () => {
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
