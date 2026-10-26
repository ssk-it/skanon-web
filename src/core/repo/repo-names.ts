import { formaterAnomalie, type Anomalie } from "@ssk-it/canon-check";
import { load } from "js-yaml";
import {
  NOMS_PAR_DEFAUT,
  resoudreNoms,
  verifierDossiersDeclares,
} from "@ssk-it/canon-check/noms";
import type { Noms } from "@ssk-it/canon-check/noms";
import { LocaleService } from "../i18n/locale.service";
import { inject } from "../injection";

/**
 * The names of a repo's folders and conventional files are declared in
 * `ssk-canon.yml` (RG-noms-declares), and resolved by the library the check
 * also applies (RG-parseur-partage, INV-7): resolving them here separately
 * would let the application read a repo under other names than the
 * verification does.
 *
 * Only the paths are built here. Routes and published addresses never depend
 * on these names: they are public contracts that a project's configuration
 * does not change.
 */
export type RepoNames = Noms;

/** The format's names, which every undeclared key keeps. */
export const DEFAULT_NAMES: RepoNames = NOMS_PAR_DEFAUT;

/** The library's anomalies, said in the displayed language (RG-anomalies-codees): like Skanon's own loading anomalies, they carry the language shown when they are found. */
function say(anomalies: readonly Anomalie[]): string[] {
  const language = inject(LocaleService).language();
  return anomalies.map((a) => formaterAnomalie(a, language));
}

/** A folder declared but absent while the format's one is still there. */
export function checkDeclaredFolders(
  names: RepoNames,
  paths: readonly string[],
): string[] {
  return say(verifierDossiersDeclares(names, paths));
}

/** The names a configuration declares, and what is wrong with the declaration. */
export function resolveNames(config: unknown): {
  readonly names: RepoNames;
  readonly anomalies: readonly string[];
} {
  const { erreurs, ...names } = resoudreNoms(config);
  return { names, anomalies: say(erreurs) };
}

/**
 * The names declared in the text of `ssk-canon.yml`. An unreadable file
 * declares nothing: the loader reports it, and the format's names apply.
 */
export function namesFromConfigText(content: string | null): RepoNames {
  if (content === null) return DEFAULT_NAMES;
  try {
    return resolveNames(load(content)).names;
  } catch {
    return DEFAULT_NAMES;
  }
}

/** The folder of a scoping. */
export function scopingFolder(names: RepoNames, id: string): string {
  return `${names.dossiers.cadrages}/${id}`;
}

/** The file that carries a scoping. */
export function scopingFile(names: RepoNames, id: string): string {
  return `${scopingFolder(names, id)}/${names.fichiers.cadrage}`;
}

/** The folder of a scoping's decisions, with its trailing slash. */
export function decisionsFolder(names: RepoNames, scopingId: string): string {
  return `${scopingFolder(names, scopingId)}/${names.dossiers.decisions_cadrage}/`;
}

/** The file of a scoping's decision. */
export function decisionFile(
  names: RepoNames,
  scopingId: string,
  decisionId: string,
): string {
  return `${decisionsFolder(names, scopingId)}${decisionId}.md`;
}

/** The file of a rule. */
export function ruleFile(names: RepoNames, ruleId: string): string {
  return `${names.dossiers.regles}/${ruleId}.md`;
}
