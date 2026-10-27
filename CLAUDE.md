# For the agent

Skanon: the Vue 3 interface of SSK Canon and its static web version, source-available (FSL-1.1-ALv2). This repo is also the `@ssk-it/skanon` package, which the desktop application consumes from a private repo: nothing that concerns the desktop application alone goes in here ([docs/practices.md](docs/practices.md#what-belongs-to-the-deliverable-extensions)).

## What to read, and when

| Before…                                            | Read                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scoping or developing a functional change          | The specification [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon), through the `consulter-referentiel` skill |
| Touching the code                                  | [docs/development.md](docs/development.md)                                                                           |
| Touching format reading, tokens, GitHub calls      | [docs/invariants.md](docs/invariants.md) — **mandatory**                                                             |
| Talking to the system, creating a module or a test | [docs/practices.md](docs/practices.md)                                                                               |
| Writing a function                                 | [docs/clean-code.md](docs/clean-code.md)                                                                             |
| Naming anything                                    | [docs/conventions.md](docs/conventions.md), [docs/glossary.md](docs/glossary.md)                                     |
| Creating or changing a view, a component, a style  | [docs/accessibility.md](docs/accessibility.md) — WCAG 2.2 AA                                                         |

The full index: [docs/README.md](docs/README.md).

## Expected behaviour

**Verify rather than assume.** Never announce that something works without having run it.

**Red test first.** A test that has never failed has proven nothing.

**Port without changing.** A service or a view ported from `ssk-it/ssk-canon-pwa` keeps its behaviour and its tests; a defect found on the way is fixed separately, and reported.

**Do not work around an invariant.** Cite invariants by number (`INV-1`…`INV-10`); if one gets in the way, say so.

**Run nothing that opens a window during the work**: browser tests run headless. A visible browser only at the end of the work, with the user's consent, or at their request.

**The repo is public.** No client name, no machine path, no secret — not in the code, not in the tests, not in a commit message: fictitious names in tests.

**pnpm, never npm.**

**Do not commit to `main`.** One linked worktree per topic, one pull request.

**Scope the loop that is ending.** When a phase completes or a technical choice is settled, invoke the `cadrer-la-boucle` skill: it asks whether the decisions taken should be recorded in `ssk-it/ssk-canon`. A scoping tool that does not scope its own decisions does not keep its promise.

**Keep the documentation up to date** in the same change as the code: a command cited in `docs/` exists in `package.json`, a reference points to a real file.

**Exchanges with the maintainer are in French; code, comments, documentation and commits are in English** ([docs/conventions.md](docs/conventions.md)).
