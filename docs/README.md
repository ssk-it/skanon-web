# Skanon documentation

## Reading order

1. [development.md](development.md) — the source tree, the commands, the tooling pitfalls. Keep it open.
2. [invariants.md](invariants.md) — `INV-1`…`INV-10`, the non-negotiable constraints. Reread them.
3. [practices.md](practices.md) — the boundary with the system, the test levels, errors, page layout, the delivery cycle.
4. [clean-code.md](clean-code.md) — how the inside of a unit is written, and what the tooling enforces.
5. [conventions.md](conventions.md) — naming, language, comments, commits.
6. [glossary.md](glossary.md) — each domain term, as the format writes it and as the code names it.
7. [deployment.md](deployment.md) — deploying the web version, and its protected environment.

## By task

| To…                                     | Open                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Add a view or a route                   | [development.md](development.md#adding-a-view)                          |
| Talk to the system (secret, link, file) | [practices.md](practices.md#the-boundary-with-the-system)               |
| Write a test                            | [practices.md](practices.md#tests)                                      |
| Run a single test, or in watch mode     | [development.md](development.md#everyday-tasks)                         |
| Consume this repo as a package          | [development.md](development.md#the-package)                            |
| Add an extension point                  | [practices.md](practices.md#what-belongs-to-the-deliverable-extensions) |
| Name a domain concept                   | [glossary.md](glossary.md)                                              |
| Contribute from outside, sign the CLA   | [CONTRIBUTING.md](../CONTRIBUTING.md)                                   |
| Change the CLA check                    | [development.md](development.md#the-cla-check)                          |
| Deploy the web version                  | [deployment.md](deployment.md)                                          |

## What is not here

- **Product decisions**: the SSK Canon specification, [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon), described in its own format. Consult it through the `consulter-referentiel` skill before any functional change. Skanon is the product there: the delivered scoping [ssk-canon#2026-051](https://ssk-canon.s3-website.fr-par.scw.cloud/ssk-it/ssk-canon/cadrages/2026-051) makes it the application that replaces ssk-canon-pwa, under the single name Skanon (`ADR-application-de-bureau`).
- **The desktop application**: its native core, its adapter, its extensions and its publishing live in a private repo, which consumes this repo as a pinned package (ADR-extensions-commerciales). The web version is deployed from here: [deployment.md](deployment.md).
- **Reading the format**: the [`@ssk-it/canon-check`](https://github.com/ssk-it/ssk-canon-action) library, shared by the application and the automation (`INV-7`).
