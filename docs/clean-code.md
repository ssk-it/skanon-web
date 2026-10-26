# Clean code

This document governs the inside of a unit. The boundaries between layers live in [practices.md](practices.md#layers), naming in [conventions.md](conventions.md).

## Readability

**A name states the intent, and carries its unit.** `delaySeconds`, `quotaRemaining`; never `tmp`, `data2`. A literal value that decides something is named: the two queues of `GithubClient` are not written `new RateLimiter(6)` without the comment that says why six.

**A side effect is visible from the call.** The verb says it: `load` reads, `save` writes, `find` returns `null`, `get` throws ([conventions.md](conventions.md#methods-and-functions)). A `findScoping` that created the missing folder is the costliest defect, because nobody rereads the body of an accessor.

**No boolean flag.** `open(true)` says nothing at the call site. Two functions, or a named value — `TokenVault` has three methods rather than one `write(tokens, erase?)`.

**Return early rather than nest.** The system vault's `saveTokens` handles the empty case first, then writes.

## Design

**One reason to change.** `platform/web.ts` changes when the browser changes; `core/` when the product changes. A service that did both — reading a repo and putting a token in local storage — gets split.

**Depend on an abstraction.** A service asks for `inject(HttpClient)`, never `fetch`: that is what lets a test answer through the fake, and the target change transport without rewriting the service.

**Do not generalise before the third case.** Except at the boundary with the system, where the second case — the fake — exists from day one.

## Refactoring

**A change of form is never mixed with a change of behaviour.** Two commits: first the form, tests unchanged; then the behaviour. The sign that they were mixed: a test had to change in a commit that claimed to change nothing.

**Porting from SSK Canon is a change of form.** A ported service keeps its tests, translated without changing their expectations; a defect found on the way is fixed in a separate commit, which says so.

**Debt is named** by a `// Debt:` comment that states the reason and what will lift it.

## What the tooling enforces

The configuration is authoritative: `eslint.config.js` and `tsconfig.json`. Every warning blocks in CI.

| Rule                                                   | Tool       | Why                                              |
| ------------------------------------------------------ | ---------- | ------------------------------------------------ |
| typescript-eslint `strict` set, Vue `flat/recommended` | ESLint     | The known traps of the language and of templates |
| `no-console`                                           | ESLint     | A forgotten trace ends up in the user's console  |
| `strict`, `noUnusedLocals`, `noUnusedParameters`       | TypeScript | The leftovers of interrupted work                |

The interface's complexity thresholds — `complexity`, `max-depth`, `max-params` — will be set on the ported code, just above what it already does, then tightened. None is configured today.

Every exception carries its reason on the line that declares it.
