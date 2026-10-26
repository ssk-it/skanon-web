import { afterEach, describe, expect, it } from "vitest";
import { inject } from "../injection";
import { LocaleService } from "../i18n/locale.service";
import { IdentityService } from "./identity.service";

/**
 * A return from the issuer that answers another request is refused, and the
 * reason is displayed on the home page: it is said in the displayed language.
 */
describe("A return from the issuer that does not match the request", () => {
  afterEach(() => history.replaceState(null, "", "/"));

  function returnWithAnotherState(): void {
    sessionStorage.setItem(
      "ssk-canon.identite.attente",
      JSON.stringify({ verifier: "v", state: "attendu", returnPath: "/" }),
    );
    history.replaceState(null, "", "/?code=c&state=autre");
  }

  it("is refused, in French", async () => {
    returnWithAnotherState();
    const identity = inject(IdentityService);

    expect(await identity.completeReturn()).toBe(true);
    expect(identity.error()).toBe("La réponse ne correspond pas à la demande.");
  });

  it("is refused, in English", async () => {
    inject(LocaleService).choice.set("en");
    returnWithAnotherState();
    const identity = inject(IdentityService);

    expect(await identity.completeReturn()).toBe(true);
    expect(identity.error()).toBe("The response does not match the request.");
  });
});
