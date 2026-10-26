# Contributing to Skanon

Thank you for your interest. Bug reports, fixes and improvements are welcome. This guide says what to read first, what a pull request goes through, and why you will be asked to sign a contributor licence agreement.

## Before you start

- **A bug or a question**: open an issue, with what you did, what you expected, and what happened. Skanon reads a scoping repo through the GitHub API: say whether it is public, and never paste a token.
- **A change of behaviour**: what Skanon does is specified, rule by rule, in [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon) — the specification of SSK Canon, written with SSK Canon. A change that contradicts a rule starts as a discussion in an issue, not as a pull request: the rule, and the scoping that settled it, say why it is the way it is.
- **The code**: start with [docs/README.md](docs/README.md), then [docs/development.md](docs/development.md). [docs/invariants.md](docs/invariants.md) lists the constraints that are not negotiable; read it before touching format reading, tokens or GitHub calls.

## The contributor licence agreement

Skanon is published under the [Functional Source License 1.1, ALv2 Future License](LICENSE.md). Its interface is also built into the Skanon desktop application, which is proprietary. A contribution received under the FSL alone could not go into it until it turns Apache-2.0, two years later. That is why **every commit author signs the [Contributor Licence Agreement](CLA.md)** before their first pull request is merged: you keep the copyright in your work, and grant a licence that allows it to be distributed under other terms, proprietary ones included, with a patent licence.

**To sign**, read the CLA, then post this comment on your pull request, alone:

```
I have read the CLA and I hereby sign it.
```

The `CLA` check of the pull request tells you who still has to sign, and turns green once everyone has. You sign once; a new version of the CLA asks again.

- **Every commit author signs**, not only the author of the pull request. A commit whose email is linked to no GitHub account cannot be signed for: link the email, or amend the commit.
- **If you contribute as part of your job**, your signature states that you are authorised to sign for your employer (CLA, Section 5.2). If your employer would rather sign a corporate agreement, open an issue to ask for one.
- Reading, using or modifying Skanon asks for no signature: the CLA concerns contributions only.

## Your pull request

- One topic per pull request, from a branch of your fork.
- **Red test first**: a fix comes with the test that failed without it. How tests are written: [docs/practices.md](docs/practices.md#tests).
- **In English**: code, comments, documentation, commit messages. Names follow [docs/conventions.md](docs/conventions.md) and [docs/glossary.md](docs/glossary.md).
- **Documentation in the same change** as the code it describes.
- **This repo is public**: no secret, token, client name or machine path, in the code, the tests or a commit message. Tests use fictitious names.

Before pushing, the checks the pull request will run:

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm test:browser && pnpm build:web
```

Browser tests run headless; nothing opens a window.
