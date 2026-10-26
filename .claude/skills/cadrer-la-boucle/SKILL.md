---
name: cadrer-la-boucle
description: At the end of a work loop on Skanon — a batch of decisions taken, a phase completed, a technical choice settled — ask the user whether this loop should be recorded in the scoping repo ssk-it/ssk-canon. Triggers when work has just completed and decisions were taken, not in the middle of a task.
---

# Scope the loop that has just ended

Skanon is a scoping tool: `ssk-it/ssk-canon` is its own specification,
described in its own format. Every structuring decision taken during
development must be recorded there as a scoping — otherwise the tool does not
keep the promise it makes to its users.

It is easy to forget: the work is done, the tests pass, we move on. This skill
exists so that the question gets asked.

## When to trigger

At the **end of a work loop**, that is, when:

- a phase of the roadmap is completed;
- a technical choice has been settled, especially if it rests on a measurement
  or a verified fact;
- an assumption turned out to be wrong and changed the design;
- an option was explicitly rejected, with a reason.

**Do not trigger** in the middle of a task, nor for a bug fix with no
consequence on the expected behaviour, nor for pure form work.

## What to do

1. **Summarise the decisions** taken during the loop, one line each.
   Distinguish what is a decision — a choice between options, with a
   reason — from what is execution.

2. **Ask the user** whether this loop should be recorded in
   `ssk-it/ssk-canon`, proposing a concrete form:
   - a **new scoping** if the loop produced a coherent set of decisions;
   - **decisions added to an existing scoping** if they complete a topic
     already open;
   - **modified rules** if the expected behaviour has changed;
   - **nothing**, if the loop produced only execution.

   Ask the question, do not decide alone: the user is the one who knows
   whether a choice deserves to be recorded for the long run.

   To propose the right form, first apply the `consulter-referentiel` skill,
   passing it the summary: a scoping still in progress or an existing rule on
   the same topic calls for a complement or a modification, not a new scoping
   that would duplicate them.

3. **If the answer is yes**, invoke the `cadrage-canon` skill, which writes to
   `ssk-it/ssk-canon` by preparing a linked worktree — never write by hand in
   a clone. The format it applies:
   - identifier `<year>-<3-digit sequence>`, never reused;
   - goal, user journey, declared impacts;
   - an `## Énoncés` section carrying the text of each rule created or
     modified, under a level-3 heading naming the rule;
   - the decisions in `decisions/`, with **the rejected options and their
     reason** — that is what has the most value six months later;
   - the status matching the actual state of the work.

4. **Check integrity** before concluding, from the linked worktree that
   `cadrage-canon` prepared:

   ```bash
   node actions/src/check.mjs <linked-worktree>
   ```

5. **Also record it in this repo's `docs/`** if the decision touches the
   architecture of the product itself. The two are not duplicates: `docs/`
   is addressed to a developer taking over the code, `ssk-it/ssk-canon`
   describes the product's behaviour.

   `example-repo/` is not a target: it is a test fixture, not Skanon's
   specification.

## Format pitfalls

- A `cree` or `modifie` impact **must** have its statement, otherwise the
  verification fails.
- A scoping carries the statement **as of its delivery**, not the current
  state: do not rewrite the statements of old scopings.
- The `cree_par` and `modifie_par` fields are derived from the impacts of
  delivered scopings. The verification recomputes them: filling them in by
  hand inconsistently makes the check fail.
- A rule created by an undelivered scoping does not exist yet in `rules/` —
  that is normal and tolerated.
