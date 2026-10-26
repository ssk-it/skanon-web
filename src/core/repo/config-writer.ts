import {
  CodeRepo,
  AccessMode,
  TokenProtection,
  IdentitySettings,
} from "../model/model";

/** What the settings page can modify. */
const CODE_REPOS_COMMENT = [
  "# Les depots de code que ce projet realise. Le lien est declare ici, du cote",
  "# qui a autorite : le referentiel porte la vue projet, que plusieurs depots",
  "# de code composent.",
].join("\n");

export interface EditableSettings {
  readonly access: AccessMode;
  /** Absent in the modes that have no use for it. */
  readonly identity: IdentitySettings | null;
  /** Optional: a project that declares none is an ordinary case. */
  readonly codeRepos?: readonly CodeRepo[];
  /** Optional: when absent, the file keeps what it declared. */
  readonly tokenProtection?: TokenProtection;
}

const ACCESS_COMMENT = [
  "# Comment les rédacteurs obtiennent l'accès au dépôt.",
  "# jeton_personnel : chacun apporte le sien — rien à héberger.",
  "# identite_tierce : un composant échange une identité contre un accès temporaire.",
  "# relais : chaque requête passe par un composant qui la vérifie.",
].join("\n");

const PROTECTION_COMMENT = [
  "# Dans la version web, le jeton qui ouvre ce projet doit être gardé sous passkey.",
  "# Sans cette ligne, la passkey est proposée à chaque rédacteur, sans être exigée.",
].join("\n");

const IDENTITY_COMMENT = [
  "# Où les identités sont vérifiées. Rien de secret ici : ce sont les valeurs",
  "# que porte toute application s'exécutant dans un navigateur.",
].join("\n");

/**
 * Replaces a top-level block in a YAML document, or adds it.
 *
 * The replacement works on the text, not on the tree: rewriting the whole
 * document would destroy its comments — measured, five disappear — and
 * would reformat long texts. Yet this file is re-read on the platform, and
 * its comments explain what the settings are for.
 *
 * The comment immediately preceding the block is taken with it: it
 * describes it, and leaving it in place would comment on a missing block.
 */
export function replaceBlock(
  source: string,
  key: string,
  block: string | null,
  comment: string,
): string {
  const lines = source.split("\n");
  const begin = lines.findIndex((l) => l.startsWith(`${key}:`));

  // A block to remove that is not there: nothing to do.
  if (begin === -1 && block === null) return source;

  if (begin === -1) {
    // Added at the end of the document, preceded by its comment: with no marker for where
    // to insert it, the end is the only place that disturbs nothing.
    const end = source.replace(/\s*$/, "");
    return `${end}\n\n${comment}\n${block}\n`;
  }

  // the block extends up to the next non-indented, non-empty line
  let end = begin + 1;
  while (
    end < lines.length &&
    (lines[end].startsWith(" ") || lines[end].trim() === "")
  ) {
    end++;
  }
  // trailing blank lines belong to the separation, not to the block
  while (end > begin + 1 && lines[end - 1].trim() === "") end--;

  // go back up to the preceding comment, to replace it too
  let head = begin;
  while (head > 0 && lines[head - 1].trim().startsWith("#")) head--;

  // A comment already in place is kept as is: replacing it with an
  // equivalent text would show modified lines in every
  // review, whereas nothing changed there. The product's one is only used to
  // document a block that had none.
  const existingComment = lines.slice(head, begin);
  const toWrite = existingComment.length
    ? existingComment
    : comment.split("\n");

  // Removing also takes the comment and the blank line that followed, without
  // which the file would keep the trace of a vanished setting.
  if (block === null) {
    const after = lines.slice(end);
    while (after.length && after[0].trim() === "") after.shift();
    return [...lines.slice(0, head), ...after].join("\n");
  }

  return [
    ...lines.slice(0, head),
    ...toWrite,
    ...block.split("\n"),
    ...lines.slice(end),
  ].join("\n");
}

/**
 * Applies the settings to a configuration file, preserving the rest.
 *
 * Only the blocks concerned are rewritten. Everything the project put in this
 * file — description, tags, storage — is kept as is, including what
 * the application cannot read.
 */
export function writeSettings(
  source: string,
  settings: EditableSettings,
): string {
  // The two lifecycle settings are gone (2026-045): the first
  // save removes them, comments included, rather than leaving in
  // the file keys that no longer configure anything. That save goes through
  // a review: the removal shows there.
  let out = replaceBlock(source, "transitions", null, "");
  out = replaceBlock(out, "reflet_demande_fusion", null, "");
  out = replaceBlock(out, "acces", `acces: ${settings.access}`, ACCESS_COMMENT);

  // Only the requirement is written: the proposal is the default, which a silent file already means.
  if (settings.tokenProtection) {
    out = replaceBlock(
      out,
      "protection_du_jeton",
      settings.tokenProtection === "exigee"
        ? "protection_du_jeton: exigee"
        : null,
      PROTECTION_COMMENT,
    );
  }

  // The block is only written if the mode uses it: leaving it behind
  // would describe a configuration the project no longer applies.
  const i = settings.identity;
  out = replaceBlock(
    out,
    "identite",
    i
      ? [
          "identite:",
          `  emetteur: ${i.issuer}`,
          `  client: ${i.client}`,
          `  echange: ${i.exchange}`,
        ].join("\n")
      : null,
    IDENTITY_COMMENT,
  );
  // Code repos: the block disappears when the list is empty, rather than
  // staying in place and describing a project that no longer declares any.
  out = replaceBlock(
    out,
    "depots_code",
    settings.codeRepos?.length
      ? [
          "depots_code:",
          ...settings.codeRepos.map(
            (d) =>
              `  - { repo: ${d.repo}${d.role.trim() ? `, role: ${d.role.trim()}` : ""} }`,
          ),
        ].join("\n")
      : null,
    CODE_REPOS_COMMENT,
  );

  return out.endsWith("\n") ? out : `${out}\n`;
}
