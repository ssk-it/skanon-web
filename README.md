# Skanon

[![Technical debt](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=sqale_index)](https://sonarcloud.io/summary/overall?id=ssk-it_skanon-web)

[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=vulnerabilities)](https://sonarcloud.io/project/issues?id=ssk-it_skanon-web&types=VULNERABILITY) [![Bugs](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=bugs)](https://sonarcloud.io/project/issues?id=ssk-it_skanon-web&types=BUG) [![Code smells](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=code_smells)](https://sonarcloud.io/project/issues?id=ssk-it_skanon-web&types=CODE_SMELL)

[![Lines of code](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=ncloc)](https://sonarcloud.io/component_measures?id=ssk-it_skanon-web&metric=ncloc) [![Duplicated lines](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=duplicated_lines_density)](https://sonarcloud.io/component_measures?id=ssk-it_skanon-web&metric=duplicated_lines_density) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=coverage)](https://sonarcloud.io/component_measures?id=ssk-it_skanon-web&metric=coverage)

[![Maintainability](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=sqale_rating)](https://sonarcloud.io/summary/overall?id=ssk-it_skanon-web) [![Reliability](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=reliability_rating)](https://sonarcloud.io/summary/overall?id=ssk-it_skanon-web) [![Security](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=security_rating)](https://sonarcloud.io/summary/overall?id=ssk-it_skanon-web)

[![Quality gate](https://sonarcloud.io/api/project_badges/measure?project=ssk-it_skanon-web&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ssk-it_skanon-web) [![Checks](https://github.com/ssk-it/skanon-web/actions/workflows/controles.yml/badge.svg?branch=main)](https://github.com/ssk-it/skanon-web/actions/workflows/controles.yml)

**Every business rule of your product, with the decision that made it so.**

Six months after a feature ships, someone asks why it behaves the way it does. The Trello card said it in two lines, the pull request shows how it was coded, and the discussion that settled the matter took place in a meeting nobody wrote up. Skanon is where that answer stays: a specification of the product, written with the client, that keeps for each rule the reasons it was given.

**Developing**: start with [docs/README.md](docs/README.md).

## What it is about

Skanon is the application of **SSK Canon**, a way of writing down what a software product does and why. SSK Canon rests on a few terms, used throughout this repo and the interface.

- **The specification** describes the product as it is today. It is organised in **domains** (business areas), **features** (user-facing capabilities, attached to one or more domains) and **business rules** — one rule, one stable identifier (`RG-…`), one statement saying what the product does. Architecture decisions (`ADR-…`) sit alongside.
- **A scoping** is a dated unit of change (`2026-047`): what is to be done and why, the user journey, the **decisions** settled on the way with the options that were ruled out, and its **impacts** — the rules it creates, modifies, repeals, or merely touches, with their new statements.
- **Delivery** is the moment a scoping is accepted and its impacts are applied to the specification.

Both live in a **scoping repo**: one Git repo per project, next to the code repos it describes, made of Markdown files with a YAML header. Skanon reads and writes that repo; a public [GitHub Action](https://github.com/ssk-it/ssk-canon-action) checks it and keeps it consistent.

## Background

SSK Canon borrows from four established ideas.

- **Living documentation** — a specification is only worth something if it stays true to the product, which means it must change in the same movement as the product, not afterwards.
- **Architecture decision records** — a decision is recorded with its context, the options considered and the reason one was chosen, and is never rewritten: a later decision supersedes it.
- **Event sourcing** — the current state is not stored as such but derived from the log of changes that produced it. The log is the source of truth; the state is a projection of it.
- **Docs as code** — text kept in a version-controlled repo, reviewed through pull requests, gets history, attribution and review for free.

## The problem

Between the need and the code, nothing durable says what the product is supposed to do. Tickets express the need briefly and are closed once done; the code says what the product does, not what was intended, and not to someone who does not read it. The questions that come back over the life of a product — _what exactly does this feature do? why this way? who decided? is anyone already changing it?_ — end up answered from memory, or not at all.

The usual tools each cover part of it.

| Tool                                          | What it keeps                              | What it loses                                                                                      |
| --------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Tickets (Trello, Jira, issues)                | The need, at the time it was expressed     | Closed once delivered; scattered; never a picture of the whole product                             |
| Wikis (Confluence, Notion)                    | A description of the current state         | The history of decisions; and it rots as soon as nobody updates it, since nothing forces an update |
| ADRs                                          | The reasons behind technical choices       | Business rules, and any view of the current state: they are a log, not a specification             |
| Executable specifications (Gherkin, Cucumber) | Behaviour checked against the code         | The reasons; and they are written by and for developers, in a syntax the client does not read      |
| RFC and proposal processes                    | The debate and the decision on each change | The consolidated state once the proposals are accepted                                             |
| Requirements management tools                 | Rules, traceability, approval workflows    | Lightness; and the content is locked in the tool, and dies with it                                 |

What is missing is the combination: a current state anyone can read, and the history of decisions that produced it, tied together so that one cannot drift from the other.

## Skanon's position

**The specification is the projection of delivered scopings.** That is the founding choice, taken from event sourcing: the specification is never edited directly. Every change to a rule comes from a scoping that declares an impact on it, and delivery applies it. A rule can therefore always be traced back to the scoping that created it, the ones that refined it, and the decisions that explain them. This directed relation is what sets Skanon apart from a wiki, which describes the state without the history and has no reason to stay up to date.

The other choices follow from the promise of a _lasting_ specification.

- **Git is the database.** No server-side database: history, attribution and review come from the platform, and the files stay readable on GitHub if the application disappears. The record outlives the tool.
- **A scoping follows a pull request.** Each scoping is written on its own branch and delivered by merging it. Its status — draft, in review, approved, delivered — is never declared: it is read from the branch and the pull request. A delivered scoping is never modified; changing it takes a new scoping.
- **Decisions keep their rejected options.** Knowing what was ruled out, and why, is what stops a settled question from being reopened.
- **The specification has a repo of its own.** The client reads it without seeing the code, and one scoping can span several code repos.
- **Rules are written for people, not machines.** A statement is prose the client can read and settle, not a test. Checking that the code complies stays the job of the code's own tests.
- **Links, not synchronisation.** A scoping links to its Trello card, its issues and its mock-ups; it neither reads nor writes them, and so never falls out of sync with them.
- **Nothing to install.** Skanon runs in the browser, as a static web application that any file host can serve, and installs as an app from Chrome.

## How it works

1. **Set up the scoping repo.** A Git repo with an `ssk-canon.yml` declaring the project and its code repos, and the `domains/`, `features/`, `rules/`, `decisions/` and `cadrages/` folders. Skanon recognises an empty repo and offers to bootstrap it, workflows included.
2. **Write a scoping.** From the list of scopings, _New scoping_ creates the `cadrage/<id>` branch, puts the scoping on it and opens its pull request as a draft. The scoping states its goal, the user journey, its links, its decisions with their options, and its impacts, with the full text of every rule it creates or modifies.
3. **Settle it with the client.** The scoping moves to review. The client reads it in Skanon, comments, and arbitrates the open decisions; the chosen option is recorded with its reason. An approving review makes the scoping _approved_.
4. **Check it.** On every pull request, the Action verifies the scoping repo: an impact on a missing rule, a missing statement or a modified delivered scoping blocks the merge.
5. **Deliver it.** Merging the pull request delivers the scoping. The Action's propagation writes its statements into the rules and keeps their indexes up to date — which scopings created and modified each one.
6. **Read the product.** Anyone can browse the specification by domain and feature, follow the chronology of a rule, compare two states of the specification, search across rules, decisions and scopings, see the scopings still in progress — so as to know if someone is already working on a subject — and the roadmap of what is envisaged next. Every view has its own address, and a link to a rule or a scoping is shared as is.

The [ssk-canon](https://github.com/ssk-it/ssk-canon) repo is the specification of SSK Canon written with SSK Canon: every behaviour described here has its rule there, with the scoping that decided it. Its README also explains how to set up a scoping repo for a project of your own.

## Getting started

Skanon is online at [ssk-canon.s3-website.fr-par.scw.cloud](https://ssk-canon.s3-website.fr-par.scw.cloud/): open it and choose a repo. Every view has its own address, of the form `/<owner>/<repo>/<view>`.

This repo holds its code, in Vue 3. To run it locally:

```bash
pnpm install
pnpm dev:web
```

Served on `http://localhost:1430`. `pnpm build:web` builds it into `dist-web/`, which any file host can serve.

## Access to repos

A public repo can be read without signing in. A personal GitHub token — read-only as long as writing is not needed — raises the rate limits and opens private repos. Skanon keeps it in the browser's local storage, in clear or sealed by a passkey — which a project can require. Sealed tokens are unlocked once while a Skanon tab stays open: opening a project, or « Unlock », brings up the browser's passkey window, and the field marked for passkeys offers it too.

## Licence

This repo is published as source-available, under the [Functional Source License 1.1, ALv2 Future License](LICENSE.md) (FSL-1.1-ALv2): anyone may read, modify and use it, except to build a competing product or service. Each version becomes Apache-2.0 two years after its release.

Contributions are welcome under a [contributor licence agreement](CLA.md): [CONTRIBUTING.md](CONTRIBUTING.md) says why, and how to sign.
