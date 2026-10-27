# Invariants

The constraints Skanon does not break. They follow from verified constraints — of the GitHub platform, of storage, of the system —, not from preferences. Cite them by number, in review, in commit messages, in comments.

**Changing one** takes an explicit decision: propose it in a pull request that modifies this file and, if it touches the product, through a scoping in [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon). Never by working around it. A lifted invariant keeps its number, marked as lifted, with the date and the reason.

`INV-1` to `INV-6` come from SSK Canon, whose format and access layer Skanon inherits; they are restated here because their reason did not change with the platform.

## INV-1 — A file path is never renamed

No GitHub API follows renames: a file moved in a project repo loses all its history as seen from the application. Rules live flat in `rules/`, features flat in `features/`, and scoping folders carry the identifier alone. A repo may name these folders in `ssk-canon.yml` (RG-noms-declares): the name is chosen at creation and never changes either, and the application builds every path from the names `src/core/repo/repo-names.ts` resolves, never from a literal. Without this rule the defect is silent: the rule is displayed, but its timeline starts at the rename.

## INV-2 — History is not stored, it is derived

No `historique:` field in a frontmatter. Git already holds the history; duplicating it guarantees divergence. The `cree_par` and `modifie_par` fields are a performance index written by the automation, never a source of truth, never written by the application.

## INV-3 — Upload an attachment before committing what cites it

An attachment is stored under the SHA-256 fingerprint of its content, and only then is the Markdown that references it committed. The reverse order produces dead pointers, which nothing reports until a reader clicks.

## INV-4 — A stored object is neither modified nor deleted lightly

Content addressing makes consistency between Git and storage automatic, provided objects are immutable. Several scopings share the same object: reference counting for collection is global to the repo, never local to a scoping.

## INV-5 — Authorisations are the token's, and GitHub applies them

The application has no rights of its own: every call carries the user's personal token, and no component stands between the application and GitHub. It declares no commit author either — GitHub records the token's account (RG-auteur-reel-commit). A token is restricted to repositories and permissions, never to paths; the token dialog says so (RG-garanties-annoncees). Third-party identity and the relay were removed (2026-059/09): a hosted component, if one comes back, is designed outside this repo.

## INV-6 — Calls to GitHub are throttled by the client

The API's secondary limits — one hundred concurrent requests, five hundred writes per hour — apply to the account that holds the token, whatever project is open, and only the client sees its own calls. Two bounded queues in the access layer: six concurrent requests to the API, twenty-four to raw contents, which have no quota.

## INV-7 — Format reading is written once, in `@ssk-it/canon-check`

Frontmatter splitting, the format rules and their verification live in the library shared by the application and the automation (RG-parseur-partage). The native core of the desktop application neither reads nor verifies the format: it keeps secrets and talks to the system. Without this rule, two implementations diverge, and a repo the application accepts is rejected by the verification — or the reverse —, without either one being at fault.

## INV-8 — A token leaves the machine only towards GitHub

An access token travels through no link, no address, no log, and is displayed only by its last characters. In the desktop application it is written only to the vault the system protects, never in clear on disk; in the web version it lives in the browser's local storage — in clear, or sealed by a passkey whose key never leaves the user's keychain —, and the interface says which. A project that requires the passkey never sees its token kept in clear: without the passkey, the token is valid for the tab only (RG-protection-du-jeton-par-projet, scoping 2026-055). The key that opens sealed tokens lives in memory only: it passes from an open tab to the tabs opened afterwards, never through any storage, and is only ever obtained from the passkey after a user gesture — never by a request forced on load (scoping 2026-065).

## INV-9 — One interface codebase for both deliverables

The desktop application and the web version are built from the same sources. What differs from one system to another goes through the ports of `src/platform/ports.ts`; what belongs to the deliverable, through the extensions of `src/extension/`. Each deliverable has its composition root — `src/main.ts` for the web, the desktop application's in its repo —, the only place that chooses its adapters and its extensions. Without this rule, a view tested in one breaks in the other, and comparing the two deliverables no longer measures the same product.

## INV-10 — Shared code names no extension

The shared interface declares extension points and renders what is put in them; it does not know who fills them. No file in this repo imports the desktop application's code, or names what it sells — its update service, its licence, its causes —, and no view tests for the presence of an extension. A point is named after the place in the interface, never after a feature. Without this rule, the public repo would carry commercial logic it has no business carrying, and each change to the paid offer would require a public merge (ADR-extensions-commerciales). `src/layers.test.ts` enforces it.
