import {
  CodeRepo,
  AccessMode,
  TokenProtection,
  IdentitySettings,
} from "../model/model";

/** Ce que la page de réglages sait modifier. */
const CODE_REPOS_COMMENT = [
  "# Les depots de code que ce projet realise. Le lien est declare ici, du cote",
  "# qui a autorite : le referentiel porte la vue projet, que plusieurs depots",
  "# de code composent.",
].join("\n");

export interface EditableSettings {
  readonly access: AccessMode;
  /** Absent dans les modes qui n'en ont pas l'usage. */
  readonly identity: IdentitySettings | null;
  /** Facultatif : un projet qui n'en déclare aucun est un cas ordinaire. */
  readonly codeRepos?: readonly CodeRepo[];
  /** Facultatif : absent, le fichier garde ce qu'il déclarait. */
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
 * Remplace un bloc de premier niveau dans un document YAML, ou l'ajoute.
 *
 * Le remplacement porte sur le texte, non sur l'arbre : réécrire le document
 * entier détruirait ses commentaires — mesuré, cinq disparaissent — et
 * reformaterait les textes longs. Or ce fichier se relit sur la plateforme, et
 * ses commentaires expliquent à quoi servent les réglages.
 *
 * Le commentaire qui précède immédiatement le bloc est repris avec lui : il le
 * décrit, et le laisser en place ferait commenter un bloc absent.
 */
export function replaceBlock(
  source: string,
  key: string,
  block: string | null,
  comment: string,
): string {
  const lines = source.split("\n");
  const begin = lines.findIndex((l) => l.startsWith(`${key}:`));

  // Un bloc à retirer qui n'est pas là : rien à faire.
  if (begin === -1 && block === null) return source;

  if (begin === -1) {
    // Ajouté en fin de document, précédé de son commentaire : sans repère où
    // l'insérer, la fin est le seul endroit qui ne bouscule rien.
    const end = source.replace(/\s*$/, "");
    return `${end}\n\n${comment}\n${block}\n`;
  }

  // le bloc s'étend jusqu'à la prochaine ligne non indentée et non vide
  let end = begin + 1;
  while (
    end < lines.length &&
    (lines[end].startsWith(" ") || lines[end].trim() === "")
  ) {
    end++;
  }
  // les lignes vides finales appartiennent à la séparation, pas au bloc
  while (end > begin + 1 && lines[end - 1].trim() === "") end--;

  // remonter sur le commentaire qui précède, pour le remplacer aussi
  let head = begin;
  while (head > 0 && lines[head - 1].trim().startsWith("#")) head--;

  // Un commentaire déjà en place est conservé tel quel : le remplacer par un
  // texte équivalent ferait apparaître des lignes modifiées dans chaque
  // relecture, alors que rien n'y a changé. Celui du produit ne sert qu'à
  // renseigner un bloc qui n'en avait pas.
  const existingComment = lines.slice(head, begin);
  const toWrite = existingComment.length
    ? existingComment
    : comment.split("\n");

  // Retirer emporte aussi le commentaire et la ligne vide qui suivait, sans
  // quoi le fichier garderait la trace d'un réglage disparu.
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
 * Applique les réglages à un fichier de configuration, en préservant le reste.
 *
 * Seuls les blocs concernés sont réécrits. Tout ce que le projet a mis dans ce
 * fichier — description, tags, stockage — est conservé tel quel, y compris ce
 * que l'application ne sait pas lire.
 */
export function writeSettings(
  source: string,
  settings: EditableSettings,
): string {
  // Les deux réglages du cycle ont disparu (2026-045) : le premier
  // enregistrement les retire, commentaires compris, plutôt que de laisser dans
  // le fichier des clés qui ne règlent plus rien. Cet enregistrement passe par
  // une relecture : le retrait s'y voit.
  let out = replaceBlock(source, "transitions", null, "");
  out = replaceBlock(out, "reflet_demande_fusion", null, "");
  out = replaceBlock(out, "acces", `acces: ${settings.access}`, ACCESS_COMMENT);

  // Seule l'exigence s'écrit : la proposition est le défaut, qu'un fichier muet vaut déjà.
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

  // Le bloc n'est écrit que si le mode l'emploie : le laisser derrière soi
  // décrirait une configuration que le projet n'applique plus.
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
  // Les dépôts de code : le bloc disparaît quand la liste est vide, plutôt que
  // de rester en place et de décrire un projet qui n'en déclare plus.
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
