# Skanon

A scoping tool and a lasting home for the specification, shared between the client and the development team. It fills the gap between Trello, where the need is expressed briefly, and GitHub, where development happens — keeping, over time, the record of what each feature does, and why it does it that way.

Skanon is the SSK Canon product: a desktop application and, from the same interface code, an installable web application. This repo holds the shared interface, in Vue 3, and the web version; the desktop application lives in a private repo, which consumes this one as a package. It replaces [ssk-canon-pwa](https://github.com/ssk-it/ssk-canon-pwa), the first web application, written in Angular, whose behaviour it took over and whose place it takes at the same address ([ssk-canon#2026-051](https://ssk-canon.s3-website.fr-par.scw.cloud/ssk-it/ssk-canon/cadrages/2026-051), `ADR-application-de-bureau`).

**Developing**: start with [docs/README.md](docs/README.md).

## The principle

The **specification** — domains, features, business rules — describes the current state of the product. **Scopings** are the dated units of change that transform it. The specification is the projection of delivered scopings.

Everything lives in Git: one repo per project, Markdown files with YAML frontmatter. The application reads and writes through the GitHub API; history, attribution and review are provided by the platform — the record outlives the tool.

## Getting started

```bash
pnpm install
pnpm dev:web
```

The web version, served on `http://localhost:1430`. `pnpm build:web` builds it into `dist-web/`, which any file host can serve.

## Access to repos

A public repo can be read without signing in. A personal GitHub token — read-only as long as writing is not needed — raises the rate limits and opens private repos. The desktop application keeps it in the system keychain; the web version, in the browser's local storage, in clear or sealed by a passkey — which a project can require.

## Licence

The interface and the web version are published as source-available, under the [Functional Source License 1.1, ALv2 Future License](LICENSE.md) (FSL-1.1-ALv2): anyone may read, modify and use them, except to build a competing product or service. Each version becomes Apache-2.0 two years after its release. The desktop application is proprietary.
