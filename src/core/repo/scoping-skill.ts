/**
 * The scoping skill, distributed from the automation's repo.
 *
 * It is not embedded here: its place is next to the verifier that enforces
 * the format, so that a single description of that format exists. Two copies
 * would diverge at the first correction.
 */
export const SKILL_REPO = "ssk-it/ssk-canon-action";

/** What makes up the skill, as it lives in the repo. */
export const SKILL_FILES: ReadonlyArray<{ path: string; source: string }> = [
  {
    path: "cadrage-canon/SKILL.md",
    source: "skills/cadrage-canon/SKILL.md",
  },
  {
    path: "cadrage-canon/scripts/situer.mjs",
    source: "skills/cadrage-canon/scripts/situer.mjs",
  },
];

/**
 * Installation command, to paste into a terminal.
 *
 * Two files in a precise tree: downloading them one by one would force one to
 * recompose the directories by hand, and a misplacement makes the skill
 * invisible without a word.
 */
export function installCommand(): string {
  // Kept short: a line that overflows its frame looks truncated, when it is
  // merely scrolling.
  return [
    `git clone -q --depth 1 \\`,
    `  https://github.com/${SKILL_REPO} /tmp/canon \\`,
    "  && mkdir -p ~/.claude/skills \\",
    "  && cp -R /tmp/canon/skills/cadrage-canon ~/.claude/skills/ \\",
    "  && rm -rf /tmp/canon",
  ].join("\n");
}

/**
 * Configuration to write on the developer's machine.
 *
 * It carries only what is true of their machine — where each specification is
 * cloned. What is true of the project is declared in `ssk-canon.yml`, on the
 * authoritative side.
 */
export function sampleConfiguration(repoName: string): string {
  return `{\n  "projets": [\n    "~/chemin/vers/${repoName}"\n  ]\n}\n`;
}

/**
 * The block to declare in `ssk-canon.yml` for the skill to find its bearings.
 *
 * Without it, a code repo invoking the skill attaches to no project: this
 * block, and it alone, links the specification to its code.
 */
export function sampleCodeRepos(
  repos: readonly { repo: string; role: string }[],
): string {
  if (repos.length === 0) {
    return [
      "depots_code:",
      "  - { repo: organisation/depot-front, role: Application web }",
      "  - { repo: organisation/depot-back, role: API }",
    ].join("\n");
  }
  return [
    "depots_code:",
    ...repos.map(
      (d) => `  - { repo: ${d.repo}${d.role ? `, role: ${d.role}` : ""} }`,
    ),
  ].join("\n");
}
