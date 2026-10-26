# Practices

## Layers

| Layer                              | May import                                                                        | May not import                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/features/` (views), `App.vue` | `core/`, `extension/`, `platform/ports.ts`, `platform/platform-token.ts`, Vue     | a composition root, `platform/web*.ts`                                          |
| `src/core/`                        | `core/`, `platform/ports.ts`, `platform/platform-token.ts`, `@ssk-it/canon-check` | Vue (except `@vue/reactivity` in `signals.ts`), a composition root, `features/` |
| `src/extension/`                   | `core/injection.ts`, `core/i18n/language.ts`, Vue                                 | everything else                                                                 |
| `src/platform/web*.ts`             | `platform/ports.ts`, the browser                                                  | `core/`, `features/`                                                            |
| `src/web/`                         | `extension/`                                                                      | everything else                                                                 |
| `src/main.ts`                      | the browser adapters, `web/`, `startup.ts`                                        | nothing else                                                                    |

`platform/platform-token.ts` holds the `PLATFORM` token, which the core and the views request; its default value, the one tests use, is the browser platform. `src/layers.test.ts` reads the imports of the sources and enforces the table: the core, the views and the kit choose no adapter; no file imports the desktop application's native core, or names what it sells.

Dependencies always point towards the core: a view reads a service, a service reads a port, an adapter implements a port.

## What belongs to the deliverable: extensions

Skanon is published as two repos (ADR-extensions-commerciales): this one, the shared interface and the web version, source-available; and the desktop application, private, which consumes this repo as a pinned package ([development.md](development.md#the-package)). This repo does not know what the desktop application adds to it.

**System or deliverable.** What differs from one system to another — where tokens live, how a deep link arrives, what a relaunch does — goes through the ports (below), and its texts stay in the shared interface. What belongs to the deliverable — who hosts it, where its versions come from, under what licence they are obtained, what it presents to the publisher, what it sells — goes through an extension of its root: `src/web/extension.ts` for the web version; the desktop application brings its own from its repo.

**An extension fills extension points** that `src/extension/extension.ts` declares, and `compose()` (`src/extension/composer.ts`) gathers them; the shell and the pages read the result under `COMPOSITION`, without knowing what they render. The existing points: `toolbarActions`, `banners` (a text, which the shell renders in its own style), `help` per section, `legalNotice` (host, data, ownership). A wrong composition — two equal identifiers, two hosts — throws in `compose()`, hence at the first test. Every phrase an extension brings is `Localized` — one value per language, all required by the type —, and the shell and the pages show it in the displayed language (RG-textes-traduits): a language the extension forgets does not compile.

**Adding an extension point**, when an extension needs one and not before:

1. name it after the place in the interface, never after the feature that uses it — `settingsSections`, not `exportSettings`;
2. declare it in `extension.ts`, gather it in `compose()`, with its test;
3. exercise it in the test of the view that renders it, through a fake extension;
4. only then, fill it in the extension that needed it.

**What another deliverable uses from this repo is an API**, declared in the `exports` field of `package.json`. Adding an entry widens the package's contract: a decision, not a convenience. Removing one, or changing what it exports, is a breaking change, which the private repo learns through its tests against the latest public version before raising its pin. Services and adapters specific to one deliverable do not go through the shared platform: its root provides them under their own token.

## The boundary with the system

Skanon touches the system — a secret vault, deep links, opening an address in the browser — and targets three systems. Hence a hexagonal architecture: here, the ports and the browser adapter; in the desktop application's repo, its adapter and its native core.

**In the interface**, `src/platform/ports.ts` declares what the interface asks for, in the product's vocabulary: keeping tokens (`TokenVault`), opening an address outside (`ExternalOpener`), receiving a deep link (`LinkReceiver`), learning that a version is ready or why none is (`VersionAnnouncer`), sealing tokens with a passkey (`TokenSealing`, absent on desktop, where the system vault is enough). `web.ts` implements them with the browser — the vault and its sealing in `web-vault.ts` and `web-sealing.ts` —; the desktop application, with its native core, in its repo. Each deliverable's composition root chooses them: `src/main.ts` for the web.

What these adapters store on the machine is a persisted format, which outlives any renaming in the code: the sealed text keeps its field names `general` and `parPortee` (`src/platform/web-sealing.ts`), and the content cache stays at IndexedDB version 3 (`src/core/repo/content-cache.ts`). Renaming either would make users lose what they had already stored.

**The domain names no system**: not in the code, not in errors, not in displayed texts. We say "the system vault", never the name of one system's mechanism.

## Tests

**Red test first.** A test that has never failed has proven nothing.

**During the work, windowless tests:**

| Level     | Tool                                          | What it exercises                                         | What it does not see |
| --------- | --------------------------------------------- | --------------------------------------------------------- | -------------------- |
| Interface | Vitest, jsdom (`*.test.ts`)                   | Services, stores, components mounted by `@vue/test-utils` | Page layout          |
| Browser   | Vitest, headless WebKit (`*.browser.test.ts`) | Layout, scrolling, fonts                                  | Classic scrollbars   |
| Tooling   | Vitest, Node (`tools/**/*.test.mjs`)          | The logic of the repo's workflows, against a fake GitHub  | GitHub itself        |

**Every external boundary** has at least three cases: the expected response, absence, refusal — leading to three distinct states. The HTTP fake (`src/core/http/http-testing.ts`) produces them: `flush(body)`, `flush(null, { status: 404 })`, `error(…)` for no response. The passkey is faked by `FakeAuthenticator` (`src/platform/authenticator-testing.ts`), which, like a real one, returns the same 32 bytes for a given passkey and salt; the encryption itself is the real one, WebCrypto's. The WebAuthn call is exercised only at the end of the work, in a real browser.

## Web application versions

**The service worker never reloads a page.** A new version of Skanon installs alongside and waits; only the banner button makes it serve, then reloads (RG-nouvelle-version-proposee). The SSK Canon handover reloads nothing either: a tab of the old application left open keeps reading its files from the hosting, which keeps them next to Skanon's. A deployment that removed the old application's files would break those tabs at the first view they loaded.

**A page is served by one version only.** `index.html` comes from the cache of the version serving the page, and so do its scripts: never an `index.html` from the network with scripts from the cache. A file under `/assets/` that neither the cache nor the hosting serves signals the lost version (RG-version-perdue-signalee); being offline does not signal it.

## Errors

An error carries what the caller needs to decide without reading the message: the HTTP status (`HttpErrorResponse.status`, 0 for no response), the nature of the failure. **A failure is distinct from emptiness**: a missing secret reads as `null`, an unavailable vault is an error. No silent `catch`, except where failure is the intended behaviour, and the comment says so. A vault that refuses the write lets the secret hold for the session, but the adapter says so (`VaultWrite`) and the interface shows it: a token that will not be found at the next launch is not discovered at the next launch.

**One cause per refusal** (RG-message-nomme-la-cause): two causes share no text. When no version is announced, it is the deliverable that phrases the cause; the shared interface receives it opaque (`NoVersionCause`), and phrases only the failure of an installation, which it observes itself.

## Page layout

**Every block that scrolls vertically carries `scrollbar-gutter: stable`.** With classic scrollbars — macOS with a mouse, Windows, Linux —, the bar appears only when the content overflows, and takes its width from the content: everything the block contains shrinks, and under a hover, the appear-disappear cycle makes the view flicker (ssk-it/skift#73). The defect is invisible with a trackpad, as in a headless browser. Outside the rule: a block that scrolls only horizontally, and the page itself. `src/gutter.test.ts` enforces it: it reads the `.css` files, the `<style>` blocks and the `style="…"` attributes of components, and fails on any scrolling block without a gutter — the kit's included, dialogs, menus and option lists.

## The delivery cycle

One linked worktree per topic, started from `origin/main`; one pull request; rebase onto `origin/main` and green CI **on the rebased branch** before merging. A commit does not mix a change of form and a change of behaviour ([clean-code.md](clean-code.md#refactoring)).
