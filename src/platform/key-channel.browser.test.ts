import { beforeEach, describe, expect, it } from "vitest";
import { FakeAuthenticator } from "./authenticator-testing";
import { BrowserSealedVault, browserKeyChannel } from "./web-sealing";

const TOKENS = { general: "github_pat_11AAAAAAA0secretdurouge", byScope: [] };

/**
 * jsdom does not say whether a non-extractable key crosses a real `BroadcastChannel`: WebKit does. Two channels of the same name in one page talk to each other as two tabs would.
 */
describe("the key between tabs, in a real browser", () => {
  beforeEach(() => localStorage.clear());

  it("hands a non-extractable key to a new tab, which opens its tokens with it", async () => {
    const auth = new FakeAuthenticator();
    await new BrowserSealedVault(auth, browserKeyChannel()).sealTokens(TOKENS);

    const newTab = new BrowserSealedVault(auth, browserKeyChannel());
    expect(newTab.state).toBe("verrouille");
    expect(await newTab.joinOpenTabs()).toEqual({
      issue: "ouvert",
      tokens: TOKENS,
    });
  });
});
