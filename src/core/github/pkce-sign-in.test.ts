import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inject, resetInjection } from "../injection";
import { SpecificationStore } from "../repo/specification.store";
import { IdentityService, SignInRefused } from "./identity.service";
import { TokenService, TemporaryAccess } from "./token.service";
import { githubText } from "./github.messages";

/**
 * Sign-in through the identity issuer a project declares, with PKCE: the
 * application holds no secret, so it draws a one-time one, sends only its
 * fingerprint, and reveals it at the exchange — an intercepted code is useless.
 *
 * What is checked here is what makes that true: the fingerprint is the one the
 * issuer will recompute, the state ties the return to its request, the secret
 * serves once, and each refusal is named.
 */

const SETTINGS = {
  issuer: "https://identite.exemple.test/realms/projet",
  client: "skanon",
  exchange: "https://echange.exemple.test",
};
const PENDING_KEY = "ssk-canon.identite.attente";

const ACCESS: TemporaryAccess = {
  token: "ghs_acces_temporaire",
  validUntil: "2026-10-27T12:00:00Z",
  repos: ["org/projet"],
  identity: { identifier: "u-1", name: "Alex Martin", email: null },
};

/** The fingerprint the issuer recomputes from the secret: SHA-256, base64url without padding. */
function expectedChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function declareIdentity(): void {
  const store = inject(SpecificationStore);
  const current = store.specification();
  store.specification.set({
    ...current,
    settings: { ...current.settings, identity: SETTINGS },
  });
}

function pending(): { verifier: string; state: string; returnPath: string } {
  return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
}

beforeEach(() => {
  resetInjection();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

describe("Leaving for the issuer", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assign = vi.fn();
    // jsdom does not navigate: the address the browser would be sent to is caught instead.
    vi.stubGlobal("location", {
      origin: "https://skanon.exemple.test",
      pathname: "/org/projet/referentiel",
      search: "?vue=domaines",
      assign,
    });
  });

  /** The parameters of the address the browser was sent to. */
  function sentTo(): URL {
    expect(assign).toHaveBeenCalledTimes(1);
    return new URL(assign.mock.calls[0][0] as string);
  }

  it("is refused when the project declares no issuer, and leaves nothing behind", async () => {
    await expect(inject(IdentityService).signIn()).rejects.toThrow(
      SignInRefused,
    );
    await expect(inject(IdentityService).signIn()).rejects.toThrow(
      githubText().identityNotDeclared,
    );
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("goes to the issuer's authorization endpoint, as its public client", async () => {
    declareIdentity();

    await inject(IdentityService).signIn();

    const url = sentTo();
    expect(`${url.origin}${url.pathname}`).toBe(
      `${SETTINGS.issuer}/protocol/openid-connect/auth`,
    );
    expect(url.searchParams.get("client_id")).toBe("skanon");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    // The root, not the current page: the issuer admits a fixed list of addresses.
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://skanon.exemple.test/",
    );
  });

  it("sends the fingerprint of the secret it keeps, never the secret", async () => {
    declareIdentity();

    await inject(IdentityService).signIn();

    const url = sentTo();
    const { verifier, state } = pending();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      expectedChallenge(verifier),
    );
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.toString()).not.toContain(verifier);
  });

  it("draws a secret of 32 random bytes and a state of 16, URL-safe and unpadded", async () => {
    declareIdentity();

    await inject(IdentityService).signIn();

    const { verifier, state } = pending();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("writes base64 the URL-safe way: - and _ for + and /, no = at the end", async () => {
    declareIdentity();
    vi.spyOn(crypto, "getRandomValues").mockImplementation(<T>(a: T) => {
      (a as Uint8Array).fill(0xfb);
      return a;
    });

    await inject(IdentityService).signIn();

    // 0xfb 0xfb 0xfb is "+/v7" in base64.
    expect(pending().verifier).toBe(`${"-_v7".repeat(10)}-_s`);
  });

  it("draws a new secret and state at each sign-in", async () => {
    declareIdentity();
    const identity = inject(IdentityService);

    await identity.signIn();
    const first = pending();
    await identity.signIn();
    const second = pending();

    expect(second.verifier).not.toBe(first.verifier);
    expect(second.state).not.toBe(first.state);
  });

  it("remembers the page to come back to", async () => {
    declareIdentity();

    await inject(IdentityService).signIn();

    expect(pending().returnPath).toBe("/org/projet/referentiel?vue=domaines");
  });
});

describe("Coming back from the issuer", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    declareIdentity();
  });

  function returnFromIssuer(query = "?code=le-code&state=etat-attendu"): void {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        verifier: "le-secret-a-usage-unique",
        state: "etat-attendu",
        returnPath: "/",
      }),
    );
    history.replaceState(null, "", `/${query}`);
  }

  function respond(status: number, body?: unknown): Response {
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
    });
  }

  it("does nothing on an address without a code", async () => {
    returnFromIssuer("?state=etat-attendu");

    expect(await inject(IdentityService).completeReturn()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it("does nothing without a sign-in of its own in progress", async () => {
    history.replaceState(null, "", "/?code=le-code&state=etat-attendu");

    expect(await inject(IdentityService).completeReturn()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reveals the secret at the exchange, then trades the identity for access", async () => {
    returnFromIssuer();
    fetchMock
      .mockResolvedValueOnce(respond(200, { access_token: "jeton-identite" }))
      .mockResolvedValueOnce(respond(200, ACCESS));
    const identity = inject(IdentityService);

    expect(await identity.completeReturn()).toBe(true);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe(`${SETTINGS.issuer}/protocol/openid-connect/token`);
    expect(tokenInit?.method).toBe("POST");
    expect(Object.fromEntries(tokenInit?.body as URLSearchParams)).toEqual({
      grant_type: "authorization_code",
      client_id: "skanon",
      code: "le-code",
      redirect_uri: `${location.origin}/`,
      code_verifier: "le-secret-a-usage-unique",
    });

    const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[1];
    expect(exchangeUrl).toBe(`${SETTINGS.exchange}/jeton`);
    expect(exchangeInit?.method).toBe("POST");
    expect(new Headers(exchangeInit?.headers).get("Authorization")).toBe(
      "Bearer jeton-identite",
    );

    expect(inject(TokenService).identity()).toEqual(ACCESS.identity);
    expect(identity.error()).toBeNull();
    expect(identity.inProgress()).toBe(false);
  });

  it("uses the secret once: the same return cannot be replayed", async () => {
    returnFromIssuer();
    fetchMock
      .mockResolvedValueOnce(respond(200, { access_token: "jeton-identite" }))
      .mockResolvedValueOnce(respond(200, ACCESS));
    const identity = inject(IdentityService);
    await identity.completeReturn();

    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(await identity.completeReturn()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says it is in progress while the exchange runs", async () => {
    returnFromIssuer();
    let answer: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const identity = inject(IdentityService);

    const completing = identity.completeReturn();
    await Promise.resolve();
    expect(identity.inProgress()).toBe(true);

    answer(respond(400));
    await completing;
    expect(identity.inProgress()).toBe(false);
  });

  it("refuses a return of another request without calling anyone, and forgets the secret", async () => {
    returnFromIssuer("?code=le-code&state=autre");
    const identity = inject(IdentityService);

    expect(await identity.completeReturn()).toBe(true);
    expect(identity.error()).toBe(githubText().signInStateMismatch);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it.each([
    [
      "the issuer refuses the code",
      () => [respond(400, { error: "invalid_grant" })],
      () => githubText().issuerRefused,
    ],
    [
      "the issuer returns no identity",
      () => [respond(200, {})],
      () => githubText().issuerNoIdentity,
    ],
    [
      "the exchange refuses, and says why",
      () => [
        respond(200, { access_token: "jeton-identite" }),
        respond(403, { erreur: "Aucun projet ouvert pour cette identité." }),
      ],
      () => "Aucun projet ouvert pour cette identité.",
    ],
    [
      "the exchange refuses without saying why",
      () => [respond(200, { access_token: "jeton-identite" }), respond(502)],
      () => githubText().accessRefused,
    ],
  ])(
    "names the refusal when %s, and grants no access",
    async (_l, responses, message) => {
      returnFromIssuer();
      for (const r of responses()) fetchMock.mockResolvedValueOnce(r);
      const identity = inject(IdentityService);

      expect(await identity.completeReturn()).toBe(true);
      expect(identity.error()).toBe(message());
      expect(inject(TokenService).identity()).toBeNull();
      expect(identity.inProgress()).toBe(false);
    },
  );
});
