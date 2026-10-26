import { inject } from "../injection";
import { CommitDate, GithubClient, RepoRef } from "../github/github-client";
import { RepoLoader } from "./repo-loader";
import { Specification, Rule } from "../model/model";
import { LocaleService } from "../i18n/locale.service";
import { repoText } from "./repo.messages";

/** What happened to a rule between two dates. */
export type Evolution = "ajoutee" | "modifiee" | "abrogee" | "retiree";

export interface ComparedRule {
  readonly id: string;
  readonly evolution: Evolution;
  /** State at the start date. Absent if the rule did not exist yet. */
  readonly before: Rule | null;
  /** State at the end date. Absent if the rule disappeared from the specification. */
  readonly after: Rule | null;
}

export interface Comparison {
  readonly departure: ComparisonBound;
  readonly arrival: ComparisonBound;
  readonly rules: readonly ComparedRule[];
  /** Scopings delivered between the two bounds, which explain the differences. */
  readonly deliveredScopings: readonly string[];
}

export interface ComparisonBound {
  readonly date: Date;
  readonly commit: CommitDate;
  readonly specification: Specification;
}

/**
 * Comparison of the specification between two dates.
 *
 * Each bound is rebuilt in two counted calls: one to resolve the
 * date to a commit, one for the tree at that commit. Contents are served
 * outside the quota, including when addressed by a past commit — measured, that is what makes
 * the operation affordable whatever the size of the specification.
 *
 * The comparison is about business rules, not features
 * or domains: they are what carries the product's behaviour, and
 * the only thing a scoping claims to transform.
 */
export class ComparisonService {
  private readonly github = inject(GithubClient);
  private readonly loader = inject(RepoLoader);
  private readonly locale = inject(LocaleService);

  async compare(
    repoRef: RepoRef,
    departure: Date,
    arrival: Date,
  ): Promise<Comparison> {
    // Both bounds load side by side: they do not depend on each
    // other, and the access layer's queue already bounds the load.
    const [a, b] = await Promise.all([
      this.loadBound(repoRef, departure),
      this.loadBound(repoRef, arrival),
    ]);

    return {
      departure: a,
      arrival: b,
      rules: compareRules(a.specification, b.specification),
      deliveredScopings: listScopingsDeliveredBetween(
        a.specification,
        b.specification,
      ),
    };
  }

  private async loadBound(
    repoRef: RepoRef,
    date: Date,
  ): Promise<ComparisonBound> {
    const commit = await this.github.commitAtDate(repoRef, date);
    if (!commit) {
      throw new Error(
        repoText().noRecordAt(
          date.toLocaleDateString(this.locale.formatLocale()),
        ),
      );
    }
    const specification = await this.loader.loadSpecification({
      ...repoRef,
      ref: commit.sha,
    });
    return { date, commit, specification };
  }
}

/**
 * Differences between two states of the specification, rule by rule.
 *
 * An unchanged rule produces no entry: the comparison answers "what did
 * this quarter do?", not "what exists?". Listing what stayed still would drown what
 * moved.
 *
 * A free function rather than a method: it depends on no injection, and
 * exercising it should not require building a service.
 */
export function compareRules(
  before: Specification,
  after: Specification,
): ComparedRule[] {
  const out: ComparedRule[] = [];

  for (const [id, ruleAfter] of after.rules) {
    const ruleBefore = before.rules.get(id);

    if (!ruleBefore) {
      out.push({ id, evolution: "ajoutee", before: null, after: ruleAfter });
      continue;
    }
    // Repeal takes precedence over modification: it is the change with the
    // widest reach, and it almost always comes with a
    // rewrite of the statement that would mask the rest.
    if (ruleBefore.status !== "abroge" && ruleAfter.status === "abroge") {
      out.push({
        id,
        evolution: "abrogee",
        before: ruleBefore,
        after: ruleAfter,
      });
      continue;
    }
    if (ruleBefore.statement.trim() !== ruleAfter.statement.trim()) {
      out.push({
        id,
        evolution: "modifiee",
        before: ruleBefore,
        after: ruleAfter,
      });
    }
  }

  // A disappeared rule is an anomaly — a path is never renamed and a
  // rule file is not deleted — but hiding it would deprive the reader of the
  // only signal they have of it.
  for (const [id, ruleBefore] of before.rules) {
    if (!after.rules.has(id)) {
      out.push({ id, evolution: "retiree", before: ruleBefore, after: null });
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Scopings that moved to the delivered state between the two bounds.
 *
 * They are what explains the differences: without that link, the comparison shows
 * that the specification changed without saying why, which is exactly the gap
 * the product claims to fill.
 */
export function listScopingsDeliveredBetween(
  before: Specification,
  after: Specification,
): string[] {
  const out: string[] = [];
  for (const [id, scoping] of after.scopings) {
    if (scoping.status !== "livree") continue;
    if (before.scopings.get(id)?.status !== "livree") out.push(id);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
