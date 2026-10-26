import { inject } from "../injection";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { RepoLoader } from "./repo-loader";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractOtherSections,
  extractStatements,
  extractSubsections,
  KNOWN_SECTIONS,
} from "./frontmatter";
import {
  STATUS_TOGGLES,
  Scoping,
  SCOPING_STATUS_LABEL,
  ExternalLink,
  TargetKind,
  ImpactOperation,
  Specification,
  ScopingStatus,
  DecisionStatus,
} from "../model/model";
import { VerificationService } from "./verification.service";

/**
 * The kinds an impact can target, in the order they are looked for.
 *
 * The same order as in the loader and in the shared checker: a
 * disagreement would cost an impact understood differently depending on the
 * path taken to read it.
 */
const TARGET_KINDS = ["regle", "adr", "architecture"] as const;

/** What must be provided to open a scoping. */
export interface NewScoping {
  readonly title: string;
  readonly domains: readonly string[];
  readonly goal: string;
  readonly journey: string;
}

/** An impact and the statement that comes with it, as entered. */
export interface ImpactInput {
  /** The targeted identifier, whatever its kind. */
  readonly target: string;
  /**
   * The targeted kind, which decides the field written to the file.
   *
   * Absent on an impact written before an impact could target anything other
   * than a rule: the fallback is therefore `regle`, the only value it could have.
   */
  readonly kind?: TargetKind;
  readonly operation: ImpactOperation;
  /** Required for `cree` and `modifie` — without it propagation writes nothing. */
  readonly statement: string;
}

/** The complete state of a scoping being authored. */
export interface EditableScoping extends NewScoping {
  readonly impacts: readonly ImpactInput[];
  /**
   * The external links carried by the scoping.
   *
   * Optional at the call, but omitting them erases them: serialization
   * rebuilds the whole frontmatter, and whatever it is not given disappears.
   * Any caller that rewrites an existing scoping must therefore re-read them first.
   */
  readonly links?: readonly ExternalLink[];
  /**
   * The sections the editor does not know, as they were.
   *
   * A scoping can carry whatever its author finds useful — open questions, a
   * state of the art, a note. Rebuilding the file from the known sections
   * alone would erase them without saying so: the worst fault for a tool
   * whose reason for being is to keep what was written.
   */
  readonly unknownSections?: string;
}

/** Where a scoping lives, and what it takes to rewrite there. */
export interface ScopingSource {
  readonly branch: string;
  readonly path: string;
  /** SHA of the file, required by the API to replace an existing content. */
  readonly sha: string;
}

/**
 * Does this scoping live on its own branch, rather than in the specification?
 *
 * Recognised by the branch not being the default one, and never by its name
 * — see RG-branche-par-cadrage. A test on the « cadrage/ » prefix made
 * transitions invisible on every real branch, all named
 * « cadrage-<id> »: naming is the first place where two conventions
 * diverge, the application's and the author's.
 *
 * Without knowing the default branch, the answer is no: offering a
 * transition that cannot be placed is worth less than offering none.
 */
export function isOnItsBranch(
  branch: string | undefined,
  main: string,
): boolean {
  return !!branch && !!main && branch !== main;
}

/**
 * Statuses a scoping can toggle to — RG-bascule-de-statut.
 *
 * A scoping that is not on its own branch does not move: its status then
 * describes what is already in the specification, and changing it without going
 * through a pull request would bypass the check.
 */
export function listToggles(
  from: ScopingStatus,
  onItsBranch: boolean,
): readonly ScopingStatus[] {
  return onItsBranch ? (STATUS_TOGGLES.get(from) ?? []) : [];
}

export interface CreatedScoping {
  readonly id: string;
  readonly branch: string;
  readonly pullRequest: number;
  readonly url: string;
}

/**
 * Next available identifier, in the `<year>-<3-digit sequence>` format.
 *
 * The sequence resumes from the highest already used in the year, never
 * filling a gap: an abandoned identifier stays burnt. Reusing it would make
 * old references point to an unrelated scoping, whereas the stability of
 * identifiers is what everything else rests on.
 *
 * A free function rather than a method: it depends on no injection, and
 * exercising it should not require building a service.
 */
export function nextScopingId(
  existing: Iterable<string>,
  year: number,
): string {
  const prefix = String(year);
  let max = 0;
  for (const id of existing) {
    const m = /^(\d{4})-(\d{3})$/.exec(id);
    if (m?.[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Escapes a frontmatter value if YAML could misread it. */
function yamlValue(text: string): string {
  const own = text.trim().replace(/\s+/g, " ");
  // A « : » followed by a space reads as a separator, and a leading opening
  // quote would do the same. Titles almost always contain some.
  const risky = /:\s|^[-?[\]{}#&*!|>'"%@`]/.test(own) || own.includes(" #");
  return risky ? `'${own.replace(/'/g, "''")}'` : own;
}

/**
 * Serializes a new scoping in the specification format.
 *
 * The produced file must pass the integrity check, otherwise the pull
 * request would be blocked as soon as it opens. A scoping without impacts is
 * valid: impacts are declared as authoring goes, not at creation.
 */
export function serializeNewScoping(id: string, c: NewScoping): string {
  return serializeScoping(id, { ...c, impacts: [], links: [] });
}

/**
 * Serializes a complete scoping in the specification format.
 *
 * The `## Énoncés` section only appears if an impact requires it. An empty
 * section would pass the check but would suggest to the reader that something
 * is missing, where there is simply nothing to state.
 *
 * An `abroge` impact may carry a statement — to say why the rule no longer
 * applies — without being bound to; `touche` never carries one, since it
 * produces no write.
 */
/** A decision being written. */
export interface EditableDecision {
  readonly title: string;
  readonly status: DecisionStatus;
  readonly description: string;
  readonly options: readonly EditableOption[];
  /** The identifier of the chosen option, or `null` while nothing is settled. */
  readonly chosenOption: string | null;
  /** What settled it, in one sentence — the value of a decision re-read later. */
  readonly decision: string;
}

export interface EditableOption {
  readonly id: string;
  readonly body: string;
}

/**
 * A decision, in the format reading expects.
 *
 * Symmetric of `parseDecision`: the chosen option is named in the
 * frontmatter, and options are level-3 headings under « Options ».
 * Writing otherwise would produce a file the application could not
 * re-read — the costliest defect, since it only shows on reload.
 */
export function serializeDecision(id: string, d: EditableDecision): string {
  const options = d.options
    .filter((o) => o.id.trim())
    .flatMap((o) => {
      // The mark opens the first paragraph rather than taking a line of its
      // own: that is how it is written by hand, and rewriting it otherwise would
      // make a difference appear in history without anything having changed.
      const body = o.body.trim();
      const chosen = o.id.trim() === d.chosenOption;
      return [
        `### ${o.id.trim()}`,
        "",
        chosen ? `**Retenue.** ${body}`.trim() : body,
        "",
      ];
    });

  return [
    "---",
    `id: ${id}`,
    `titre: ${yamlValue(d.title)}`,
    `statut: ${d.status}`,
    `option_retenue: ${d.chosenOption ? yamlValue(d.chosenOption) : "null"}`,
    "---",
    "",
    "## Description",
    "",
    d.description.trim(),
    "",
    ...(options.length ? ["## Options", "", ...options] : []),
    ...(d.decision.trim() ? ["## Décision", "", d.decision.trim(), ""] : []),
  ].join("\n");
}

/**
 * An external link, on one frontmatter line.
 *
 * Flow style rather than an indented block: it is the form links written by
 * hand in the specification have, and producing another would make a
 * rewrite appear in history where nothing changed. The name goes through
 * `yamlValue` — a title almost always carries something to mislead the YAML
 * reader, starting with the « : ».
 */
/**
 * Adds a link to a list.
 *
 * The same resource is not referenced twice: the entered link replaces
 * the one that already carried that address, rather than being added next to it.
 */
export function withLink(
  links: readonly ExternalLink[],
  link: ExternalLink,
): ExternalLink[] {
  return [...links.filter((l) => l.url !== link.url), link];
}

/**
 * Replaces the link at address `url` with the entered one.
 *
 * The old address says which one to replace: it is what identifies the link
 * in the frontmatter, and correcting an address without naming the previous one
 * would produce a duplicate where a correction was wanted. The link keeps its
 * rank — seeing it jump to the end of the row for a retouched name would cast
 * doubt on what was written.
 */
export function withLinkModified(
  links: readonly ExternalLink[],
  url: string,
  link: ExternalLink,
): ExternalLink[] {
  const rank = links.findIndex((l) => l.url === url);
  // The link disappeared between display and write — delivered, or taken up
  // elsewhere. Adding it is better than silently losing the input.
  if (rank < 0) return withLink(links, link);
  // The new address may be that of another link in the list: keeping it
  // twice would break the uniqueness that adding already maintains.
  return links
    .map((l, k) => (k === rank ? link : l))
    .filter((l, k) => k === rank || l.url !== link.url);
}

/** Removes from the list the link carrying this address. */
export function withoutLink(
  links: readonly ExternalLink[],
  url: string,
): ExternalLink[] {
  return links.filter((l) => l.url !== url);
}

function serializeLink(l: ExternalLink): string {
  const fields = [`tag: ${yamlValue(l.tag)}`];
  if (l.name.trim()) fields.push(`nom: ${yamlValue(l.name)}`);
  // The address is always in single quotes, as in the specification written by
  // hand: `yamlValue` would leave it bare — the « : » of a scheme is not
  // followed by a space — and rewriting an existing scoping would have stripped it,
  // which would make a link nobody touched show up in review.
  fields.push(`url: '${l.url.trim().replace(/'/g, "''")}'`);
  return `  - { ${fields.join(", ")} }`;
}

export function serializeScoping(id: string, c: EditableScoping): string {
  const domains = c.domains.length ? `[${c.domains.join(", ")}]` : "[]";
  const links = (c.links ?? []).filter((l) => l.url.trim());
  const impacts = c.impacts.length
    ? c.impacts
        .map(
          (i) =>
            `  - { ${i.kind ?? "regle"}: ${i.target}, operation: ${i.operation} }`,
        )
        .join("\n")
    : "[]";

  const withStatement = c.impacts.filter((i) => i.statement.trim());
  const sections = withStatement.flatMap((i) => [
    `### ${i.target}`,
    "",
    i.statement.trim(),
    "",
  ]);

  return (
    [
      "---",
      `id: ${id}`,
      `titre: ${yamlValue(c.title)}`,
      // No `statut:`: the Action's checker rejects it, the status being
      // derived from the repo state. Writing it produced a file rejected in
      // continuous integration, hence a failing pull request.
      `domaines: ${domains}`,
      links.length
        ? `liens:\n${links.map(serializeLink).join("\n")}`
        : "liens: []",
      c.impacts.length ? `impacts:\n${impacts}` : "impacts: []",
      "---",
      "",
      "## Objectif",
      "",
      c.goal.trim(),
      "",
      "## Parcours utilisateur",
      "",
      c.journey.trim(),
      "",
      ...(sections.length ? ["## Énoncés", "", ...sections] : []),
      // Rendered as is, at the end: putting them back where they were
      // would require remembering their order, whereas preserving them is enough to
      // lose nothing.
      ...(c.unknownSections?.trim() ? [c.unknownSections.trim(), ""] : []),
    ]
      .join("\n")
      // A single final blank line: without that the file gains one at each
      // save, and the difference ends up showing in history.
      .replace(/\n+$/, "\n")
  );
}

/**
 * Creating a scoping in the repo.
 *
 * The flow follows what the platform provides, reinventing nothing: one
 * branch per scoping, one commit, one pull request. The status is read from
 * that pull request: if it is a draft, so is the scoping (RG-statuts-cadrage).
 */
export class AuthoringService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);
  private readonly loader = inject(RepoLoader);
  private readonly verification = inject(VerificationService);

  /** Identifiers of the specification's rules, to validate impacts. */
  knownRules(): ReadonlySet<string> {
    return new Set(this.store.rules().map((r) => r.id));
  }

  /** Identifier a scoping created now would take. */
  nextId(): string {
    return nextScopingId(
      this.store.scopings().map((c: Scoping) => c.id),
      new Date().getFullYear(),
    );
  }

  /**
   * Creates the branch, commits the scoping to it, and opens the pull request.
   *
   * The three steps are not atomic: GitHub offers no transaction.
   * The order is chosen so that each failure leaves a recoverable state — a
   * branch without a commit is ignored, a commit without a pull request is found
   * by its branch name. The reverse would produce an empty pull request.
   */
  async createScoping(next: NewScoping): Promise<CreatedScoping> {
    const repoRef: RepoRef = this.store.repoRef();
    const id = this.nextId();
    const branch = `cadrage/${id}`;

    const base = (await this.github.loadRepo(repoRef)).defaultBranch;
    const from = await this.github.branchSha(repoRef, base);
    await this.github.createBranch(repoRef, branch, from);

    await this.github.commitFile(
      repoRef,
      branch,
      `cadrages/${id}/cadrage.md`,
      serializeNewScoping(id, next),
      `Cadrage ${id} : ${next.title}`,
    );

    // The scoping is born a draft, and its pull request is what carries that: a
    // pull request ready for review would announce a scoping that has not started
    // (RG-bascule-de-statut).
    const inDraft = true;

    const pullRequest = await this.github.createPullRequest(
      repoRef,
      branch,
      base,
      `Cadrage ${id} : ${next.title}`,
      [
        next.goal.trim(),
        "",
        "---",
        "",
        "Cadrage en **brouillon**. Il sera livré au merge de cette demande, " +
          "qui déclenchera la propagation de ses impacts au référentiel.",
      ].join("\n"),
      inDraft,
    );

    return {
      id,
      branch,
      pullRequest,
      url: `https://github.com/${repoRef.owner}/${repoRef.repo}/pull/${pullRequest}`,
    };
  }

  /**
   * The branch carrying an undelivered scoping, if there is one.
   *
   * Branches of open pull requests first, then scoping branches that do not
   * have one yet — a scoping started, that has not had its first review
   * (RG-cadrages-en-cours-visibles). Keeps the first one that contains this
   * scoping: it is the scoping that ties the branch, not its name.
   */
  private async findScopingBranch(
    repoRef: RepoRef,
    id: string,
  ): Promise<string | null> {
    const byPullRequest = (await this.github.listOpenPullRequests(repoRef)).map(
      (d) => d.branch,
    );
    const withoutPullRequest = (
      await this.github.listScopingBranches(repoRef)
    ).filter((b) => !byPullRequest.includes(b));
    for (const branch of [...byPullRequest, ...withoutPullRequest]) {
      if (await this.carries(repoRef, `cadrages/${id}/cadrage.md`, branch))
        return branch;
    }
    return null;
  }

  /**
   * Says whether a branch carries a file. Only a "not found" counts as absence:
   * a repo that does not answer says nothing about what it contains.
   */
  private async carries(
    repoRef: RepoRef,
    path: string,
    branch: string,
  ): Promise<boolean> {
    try {
      await this.github.loadEditableFile(repoRef, path, branch);
      return true;
    } catch (e) {
      if (e instanceof GithubError && e.status === 404) return false;
      throw e;
    }
  }

  /**
   * Loads an in-progress scoping for editing, from its branch.
   *
   * A scoping the default branch carries is delivered, and is no longer
   * modified (RG-cadrage-livre-immuable): it is not loaded, even if a
   * branch still carries it. Writing it on the default branch would bypass the
   * check; writing it on a stale branch would produce a pull request
   * the check would reject.
   */
  async loadForEditing(id: string): Promise<{
    source: ScopingSource;
    content: string;
    context: Specification | null;
    mainBranch: string;
  }> {
    const repoRef = this.store.repoRef();
    const path = `cadrages/${id}/cadrage.md`;
    const main = (await this.github.loadRepo(repoRef)).defaultBranch;

    if (await this.carries(repoRef, path, main)) {
      throw new Error(
        "Ce cadrage est livré : il ne se modifie plus. Ce qu’on veut y " +
          "changer passe par un nouveau cadrage.",
      );
    }
    // The branch is found by the scoping it carries, not by its name: a
    // scoping written by hand follows another convention.
    const branch = await this.findScopingBranch(repoRef, id);
    if (!branch) {
      throw new Error(
        "Ce cadrage n’est porté par aucune branche du dépôt : il a peut-être " +
          "été abandonné, ou sa branche supprimée.",
      );
    }

    const { content, sha } = await this.github.loadEditableFile(
      repoRef,
      path,
      branch,
    );

    // The branch's specification is used to check what is written there: a
    // scoping often creates the domain and the rules it declares, absent from
    // the default branch. Without that context, the check would call them
    // unknown, whereas the delivery check accepts them.
    let context: Specification | null = null;
    try {
      context = await this.loader.loadSpecification({
        ...repoRef,
        ref: branch,
      });
    } catch {
      // Without it, the check falls back on the default branch: less
      // accurate, but better than not being able to edit.
    }

    return {
      source: { branch, path, sha },
      content,
      context,
      mainBranch: main,
    };
  }

  /** See `listToggles`. */
  possibleTransitions(
    from: ScopingStatus,
    onItsBranch: boolean,
  ): readonly ScopingStatus[] {
    return listToggles(from, onItsBranch);
  }

  /**
   * Moves a scoping to another status.
   *
   * **The status is no longer written in the file**: it is derived from the
   * repo state, and the checker rejects a declared `statut:`. Changing status
   * therefore means acting on the pull request — the only thing that carries it.
   *
   * What can be obtained that way: « brouillon » converts the pull request to a
   * draft, « en_relecture » marks it ready. « validee » cannot be reached from
   * here — an approval is given by a reviewer on the platform, and granting it to
   * oneself would empty it of its meaning. « livree » results from the
   * merge, as before.
   */
  async changeStatus(
    id: string,
    to: ScopingStatus,
  ): Promise<{ status: ScopingStatus; toggleFailed: boolean }> {
    if (to === "validee" || to === "livree") {
      throw new Error(
        `« ${SCOPING_STATUS_LABEL[to]} » ne se demande pas depuis l’application : ` +
          "ce statut vient de la relecture sur la plateforme.",
      );
    }

    const repoRef = this.store.repoRef();
    const branch = await this.findScopingBranch(repoRef, id);
    if (!branch) {
      throw new Error(
        "Ce cadrage n’est pas porté par une branche : son statut ne bouge plus.",
      );
    }

    const pr = await this.github.findPullRequestForBranch(repoRef, branch);
    if (!pr) {
      throw new Error(
        "Aucune demande de fusion ouverte sur ce cadrage : c’est elle qui porte son statut.",
      );
    }

    try {
      // The toggle is requested without comparing to the read state: that one may be
      // one transition behind, the platform not making a mutation visible
      // instantly. Requesting it identically has no effect; comparing
      // on a stale read does.
      await this.github.toggleDraftPullRequest(
        repoRef,
        pr.number,
        to === "brouillon",
      );
      return { status: to, toggleFailed: false };
    } catch {
      // Nothing changed: the status living on the pull request, a failure here
      // cannot be recovered by writing elsewhere. Say so rather than letting
      // anyone believe in a change.
      return { status: to, toggleFailed: true };
    }
  }

  /**
   * Rewrites a scoping on its branch.
   *
   * Impacts are checked before writing: a scoping committed then rejected
   * by the check leaves the author with a failing pull request, whereas
   * the cause was known at input time.
   */
  /**
   * Loads the decisions of a scoping from the branch where it lives.
   *
   * From that branch's tree: a decision created at the same time
   * as the scoping exists nowhere else, and looking for it on the default
   * branch would return an empty list without saying so.
   */
  async loadDecisions(
    id: string,
    branch: string,
  ): Promise<Array<{ file: string; sha: string; decision: EditableDecision }>> {
    const repoRef = this.store.repoRef();
    const prefix = `cadrages/${id}/decisions/`;
    const tree = await this.github.loadTree({ ...repoRef, ref: branch });

    const files = tree.entries.filter(
      (e) =>
        e.type === "blob" &&
        e.path.startsWith(prefix) &&
        e.path.endsWith(".md"),
    );

    const read = await Promise.all(
      files.map(async (f) => {
        const { content, sha } = await this.github.loadEditableFile(
          repoRef,
          f.path,
          branch,
        );
        const parse = splitFrontmatter(content);
        if (!parse || isUnreadable(parse)) return null;

        const data = parse.data as Record<string, unknown>;
        const chosen = data["option_retenue"]
          ? String(data["option_retenue"])
          : null;
        return {
          file: f.path,
          sha,
          decision: {
            title: String(data["titre"] ?? ""),
            status: (String(data["statut"] ?? "ouverte") ||
              "ouverte") as DecisionStatus,
            description: extractSection(parse.body, "Description"),
            options: [...extractSubsections(parse.body, "Options")].map(
              ([id, body]) => ({
                id,
                // The « Retenue » mark is derived from the frontmatter: keeping it
                // in the text would have it rewritten twice at the next
                // save.
                body: body.replace(/^\*\*Retenue\.\*\*\s*/, "").trim(),
              }),
            ),
            chosenOption: chosen,
            decision: extractSection(parse.body, "Décision"),
          },
        };
      }),
    );

    return read
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Writes a decision on the scoping's branch. */
  async saveDecision(
    scopingId: string,
    idDecision: string,
    branch: string,
    decision: EditableDecision,
    currentSha?: string,
  ): Promise<string> {
    const path = `cadrages/${scopingId}/decisions/${idDecision}.md`;
    const { file } = await this.github.commitFile(
      this.store.repoRef(),
      branch,
      path,
      serializeDecision(idDecision, decision),
      `Cadrage ${scopingId} — décision ${idDecision}`,
      currentSha,
    );
    return file;
  }

  /**
   * Removes a decision from the repo.
   *
   * The SHA is re-read just before: a decision removed from the screen
   * several minutes ago may have changed in the meantime, and the platform would
   * refuse the deletion — which is better than forcing it.
   */
  async deleteDecision(branch: string, path: string): Promise<void> {
    const repoRef = this.store.repoRef();
    const { sha } = await this.github.loadEditableFile(repoRef, path, branch);
    await this.github.deleteFile(
      repoRef,
      branch,
      path,
      sha,
      `Retire ${path.split("/").pop()}`,
    );
  }

  /** Adds an external link to a scoping, without going through the editor. */
  async addLink(id: string, link: ExternalLink): Promise<void> {
    await this.rewriteLinks(id, (links) => withLink(links, link));
  }

  /** Corrects an already attached link, address included. */
  async editLink(id: string, url: string, link: ExternalLink): Promise<void> {
    await this.rewriteLinks(id, (links) => withLinkModified(links, url, link));
  }

  /** Detaches a link from the scoping. The resource itself is not touched. */
  async deleteLink(id: string, url: string): Promise<void> {
    await this.rewriteLinks(id, (links) => withoutLink(links, url));
  }

  /**
   * Rewrites a scoping's list of links, without going through the editor.
   *
   * The scoping is re-read just before being rewritten rather than rebuilt
   * from the in-memory specification: that one comes from the default branch,
   * and an in-progress scoping lives on its own. Rewriting it from memory
   * would bring the delivered version back over the work in progress.
   *
   * The re-read also carries the sections the application does not present —
   * a note, a state of the art — that serialization would erase without them.
   */
  private async rewriteLinks(
    id: string,
    transformer: (links: readonly ExternalLink[]) => ExternalLink[],
  ): Promise<void> {
    const { source, content, context } = await this.loadForEditing(id);

    const parse = splitFrontmatter(content);
    if (!parse) throw new Error("Ce cadrage n’a pas de frontmatter.");
    if (isUnreadable(parse)) throw new Error(parse.error);

    const data = parse.data as Record<string, unknown>;
    const statements = extractStatements(parse.body);
    // The target is read from the field used, as when loading the specification: a
    // scoping written before this change only carries `regle`, and so stays
    // readable without anything being rewritten.
    const impacts = ((data["impacts"] as Array<Record<string, unknown>>) ?? [])
      .filter((i) => !!i && typeof i === "object")
      .map((i) => {
        const kind = TARGET_KINDS.find((n) => i[n] !== undefined) ?? "regle";
        const raw = i[kind];
        const target = typeof raw === "string" ? raw : "";
        return {
          target: target,
          kind: kind,
          operation: i["operation"] as ImpactOperation,
          statement: statements.get(target) ?? "",
        };
      });

    const existing = ((data["liens"] as Array<Record<string, unknown>>) ?? [])
      .filter((l) => !!l && typeof l === "object")
      .map((l) => ({
        tag: String(l["tag"] ?? ""),
        url: String(l["url"] ?? ""),
        name: String(l["nom"] ?? ""),
      }))
      .filter((l) => l.url);

    await this.saveScoping(
      id,
      source,
      {
        title: String(data["titre"] ?? ""),
        domains: (data["domaines"] as string[]) ?? [],
        goal: extractSection(parse.body, "Objectif"),
        journey: extractSection(parse.body, "Parcours utilisateur"),
        impacts,
        links: transformer(existing),
        unknownSections: extractOtherSections(parse.body, KNOWN_SECTIONS),
      },
      context ?? undefined,
    );
  }

  async saveScoping(
    id: string,
    source: ScopingSource,
    scoping: EditableScoping,
    context?: Specification,
  ): Promise<ScopingSource> {
    // The rules are those of the shared checker, which the Action runs before
    // each delivery: what is rejected here is exactly what would block
    // there, without any rule existing twice.
    const { errors } = this.verification.checkScoping(
      {
        id,
        title: scoping.title,
        domains: scoping.domains,
        impacts: scoping.impacts.map((i) => ({
          target: i.target.trim(),
          kind: i.kind ?? "regle",
          operation: i.operation,
        })),
        statements: new Map(
          scoping.impacts
            .filter((i) => i.statement.trim())
            .map((i) => [i.target.trim(), i.statement.trim()]),
        ),
      },
      // The same context as on input: without it, saving rejects a
      // domain or a rule the scoping creates on its branch, whereas the
      // delivery check accepts them. Refusing to write is worse than
      // flagging it — the work stays blocked.
      context,
    );
    if (errors.length) throw new Error(errors.join(" "));

    const { file } = await this.github.commitFile(
      this.store.repoRef(),
      source.branch,
      source.path,
      serializeScoping(id, scoping),
      `Cadrage ${id} : ${scoping.title}`,
      source.sha,
    );

    // The returned source carries the new SHA: the caller can rewrite right away,
    // without re-reading — and without risking reading a version the branch
    // reference has not yet caught up with.
    return { ...source, sha: file };
  }
}
