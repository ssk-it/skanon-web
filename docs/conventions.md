# Conventions

## The rule in one sentence

**Code, identifiers, comments, documentation and commit messages are in English, domain vocabulary included, following [glossary.md](glossary.md).** A domain term — scoping, specification, rule, feature, domain, impact, decision, status, token, vault — takes the English name the glossary gives it, and only that one: a `scoping` is never also a `framing` or a `proposal`, so that a search for one word finds every use. The glossary keeps, next to each English term, the French term the format and the interface write, so that a word read on screen or in a file leads to its code.

## What stays in French

What the code does not own, and the names it shares with it.

- **What the user reads**: interface texts, in templates, until internationalisation. They are the product's text, addressed to French-speaking authors; translating them is a product decision, which will come with an i18n mechanism, not a by-product of renaming.
- **What the SSK Canon format reads or writes**: YAML keys (`cree_par`, `option_retenue`, `depots_code`), status and operation values (`"brouillon"`, `"livree"`, `"cree"`, `"abroge"`), folder names (`cadrages/`, `identite/`), and routes that mirror the addresses of the published site (`…/cadrages/2026-001`). The format is shared with `@ssk-it/canon-check`, the automation and every existing project repo, and its addresses are cited in issues and scopings: renaming on our side alone would make the application unable to read existing repos, and break links already written (`INV-1`, `INV-7`).
- **Slot names and union-type values shared with the format** — the values of `ScopingStatus`, `ImpactOperation`, `HelpSection`, `VaultWrite`, the `"bureau"` / `"web"` target. They are the format's values, or are compared with them; a later pass may translate those that do not leave the code, with a mapping at the edge.

The persisted formats on the user's machine also keep their names ([practices.md](practices.md#the-boundary-with-the-system)): renaming them would lose what is already stored.

## Methods and functions

`englishVerb` + `DomainTerm`, in camelCase: `loadSpecification()`, `findRule(id)`, `saveTokens(tokens)`. A verb without a domain complement stays on its own: `retry()`, `open(url)`.

Chosen verbs: `load` (read from GitHub, storage or the vault), `parse` / `serialize`, `build` (assemble in memory), `find` (returns `null` if absent), `get` (throws if absent), `list` (returns an array), `save` / `commit` (write), `delete`, `upload`, `apply`, `validate` (returns errors), `assert` (throws), `format`, `is` / `has`, `to` (conversion), `create` (make a new object), `listen`.

## Types and fields

- Domain types: the glossary term in PascalCase — `Scoping`, `Rule`, `TokenVault`. Technical types: as the platform names them — `HttpClient`, `HttpErrorResponse`.
- Fields: those of the frontmatter they describe, under their glossary name, in camelCase (`cree_par` → `createdBy`). The mapping between the YAML key and the field is made where the file is read and written, never elsewhere.
- **No accents or cedillas in identifiers.** Accents are for content and labels.

## Files

- Vue components: PascalCase, with a role suffix — `ScopingPage.vue`, `StatusChip.vue`.
- Everything else: kebab-case — `github-client.ts`, `specification.store.ts`. A test sits next to what it exercises: `known-repos.test.ts` beside `known-repos.service.ts`.

## Interface

Everything the user reads is in French, accents included, in templates — never hard-coded in a service's logic.

## Comments

In English. They state the **why** — the constraint, the invariant, the rejected option —, never the what. A comment that paraphrases the next line is deleted. They cite the invariant (`INV-7`) or the business rule (`RG-dernier-etat-connu`) rather than rephrasing it.

## Commits

Present imperative, in English, with a scope prefix when it helps: `core:`, `ui:`, `web:`, `ci:`, `docs:`. The body says why, at 72 columns.

## Documentation

In English. Markdown files do not wrap their lines: a paragraph fits on one line. `proseWrap: "preserve"` in `.prettierrc.json`.
