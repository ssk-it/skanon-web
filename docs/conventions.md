# Conventions

## The rule in one sentence

**Code, identifiers, comments, documentation and commit messages are in English, domain vocabulary included, following [glossary.md](glossary.md).** A domain term — scoping, specification, rule, feature, domain, impact, decision, status, token, vault — takes the English name the glossary gives it, and only that one: a `scoping` is never also a `framing` or a `proposal`, so that a search for one word finds every use. The glossary keeps, next to each English term, the French term the format and the interface write, so that a word read on screen or in a file leads to its code.

## What stays in French

What the code does not own, and the names it shares with it.

- **What the SSK Canon format reads or writes**: YAML keys (`cree_par`, `option_retenue`, `depots_code`), status and operation values (`"brouillon"`, `"livree"`, `"cree"`, `"abroge"`), link-kind keys (`carte_trello`), folder names (`cadrages/`, `identite/` — the format's defaults, which a repo may replace in `ssk-canon.yml`, RG-noms-declares), and routes that mirror the addresses of the published site (`…/cadrages/2026-001`). The format is shared with `@ssk-it/canon-check`, the automation and every existing project repo, and its addresses are cited in issues and scopings: renaming on our side alone would make the application unable to read existing repos, and break links already written (`INV-1`, `INV-7`).
- **What the application writes into a repo**: commit messages, pull-request titles and bodies, the Markdown sections it writes (`## Énoncés`, `## Décision`), the automation's workflow, the comments of `ssk-canon.yml`. A repo is reread by its whole team, whatever the language each one displays (RG-textes-traduits). The bootstrap is the one exception: its notes, its README and its configuration comments are written in the language of the folder names proposed at creation, French or English, so that a repo does not read in two languages from its first commit (scoping 2026-062); once written, they are never translated again.
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

Everything the user reads is displayed in French or in English (RG-langue-choisie), and goes through a typed catalogue — never hard-coded in a template or a service.

- **A catalogue per component or per folder**, next to it: `legal-notice.messages.ts` beside `LegalNoticePage.vue`, `defineMessages({ fr: {…}, en: {…} })` (`src/core/i18n/language.ts`). The English catalogue must have exactly the French one's shape: a missing or extra key does not compile (RG-textes-traduits). Keys are English camelCase; a message with parameters or a plural is a function.
- **In a component**, `const t = useMessages(xMessages)` and `{{ t().key }}`; what is computed from a text reads `t()` inside a `computed`, so that it follows a language switch without remounting. Inline markup is split into pieces, never rendered with `v-html`.
- **In a service**, a message is built from its catalogue when it is created, in the language displayed then: `inject(LocaleService).messages(xMessages)()`.
- **Verification anomalies** from `@ssk-it/canon-check` are not worded here: the library returns them coded, and words them in each language (RG-anomalies-codees). The interface says them with `formaterAnomalie` / `enTexte` in the displayed language — the same anomalies as the pull request's check (RG-verification-a-la-saisie) — and never rewords them.
- **Dates and numbers** are formatted with `locale.formatLocale()`, never a fixed locale.
- **Model labels** (`SCOPING_STATUS_LABEL`, `LINK_TAG_LABEL`…) are localized, read as `X_LABEL[locale.language()][key]`. An entered link kind is recognised in the displayed language with `tagFromInput` (RG-nature-lien-normalisee): the key never derives from a translated label.
- French texts keep their typography — accents, `’`, « guillemets ». Tests read French by default (`src/test-setup.ts`); each page's test file has an English case.

## Comments

In English. They state the **why** — the constraint, the invariant, the rejected option —, never the what. A comment that paraphrases the next line is deleted. They cite the invariant (`INV-7`) or the business rule (`RG-dernier-etat-connu`) rather than rephrasing it.

## Commits

Present imperative, in English, with a scope prefix when it helps: `core:`, `ui:`, `web:`, `ci:`, `docs:`. The body says why, at 72 columns.

## Documentation

In English. Markdown files do not wrap their lines: a paragraph fits on one line. `proseWrap: "preserve"` in `.prettierrc.json`.
