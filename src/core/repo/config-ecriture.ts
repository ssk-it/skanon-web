import {
  DepotCode,
  ModeAcces,
  ProtectionDuJeton,
  ReglagesIdentite,
} from "../model/model";

/** Ce que la page de réglages sait modifier. */
const COMMENTAIRE_DEPOTS_CODE = [
  "# Les depots de code que ce projet realise. Le lien est declare ici, du cote",
  "# qui a autorite : le referentiel porte la vue projet, que plusieurs depots",
  "# de code composent.",
].join("\n");

export interface ReglagesEditables {
  readonly acces: ModeAcces;
  /** Absent dans les modes qui n'en ont pas l'usage. */
  readonly identite: ReglagesIdentite | null;
  /** Facultatif : un projet qui n'en déclare aucun est un cas ordinaire. */
  readonly depotsCode?: readonly DepotCode[];
  /** Facultatif : absent, le fichier garde ce qu'il déclarait. */
  readonly protectionDuJeton?: ProtectionDuJeton;
}

const COMMENTAIRE_ACCES = [
  "# Comment les rédacteurs obtiennent l'accès au dépôt.",
  "# jeton_personnel : chacun apporte le sien — rien à héberger.",
  "# identite_tierce : un composant échange une identité contre un accès temporaire.",
  "# relais : chaque requête passe par un composant qui la vérifie.",
].join("\n");

const COMMENTAIRE_PROTECTION = [
  "# Dans la version web, le jeton qui ouvre ce projet doit être gardé sous passkey.",
  "# Sans cette ligne, la passkey est proposée à chaque rédacteur, sans être exigée.",
].join("\n");

const COMMENTAIRE_IDENTITE = [
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
export function remplacerBloc(
  source: string,
  cle: string,
  bloc: string | null,
  commentaire: string,
): string {
  const lignes = source.split("\n");
  const debut = lignes.findIndex((l) => l.startsWith(`${cle}:`));

  // Un bloc à retirer qui n'est pas là : rien à faire.
  if (debut === -1 && bloc === null) return source;

  if (debut === -1) {
    // Ajouté en fin de document, précédé de son commentaire : sans repère où
    // l'insérer, la fin est le seul endroit qui ne bouscule rien.
    const fin = source.replace(/\s*$/, "");
    return `${fin}\n\n${commentaire}\n${bloc}\n`;
  }

  // le bloc s'étend jusqu'à la prochaine ligne non indentée et non vide
  let fin = debut + 1;
  while (
    fin < lignes.length &&
    (lignes[fin].startsWith(" ") || lignes[fin].trim() === "")
  ) {
    fin++;
  }
  // les lignes vides finales appartiennent à la séparation, pas au bloc
  while (fin > debut + 1 && lignes[fin - 1].trim() === "") fin--;

  // remonter sur le commentaire qui précède, pour le remplacer aussi
  let tete = debut;
  while (tete > 0 && lignes[tete - 1].trim().startsWith("#")) tete--;

  // Un commentaire déjà en place est conservé tel quel : le remplacer par un
  // texte équivalent ferait apparaître des lignes modifiées dans chaque
  // relecture, alors que rien n'y a changé. Celui du produit ne sert qu'à
  // renseigner un bloc qui n'en avait pas.
  const commentaireExistant = lignes.slice(tete, debut);
  const aEcrire = commentaireExistant.length
    ? commentaireExistant
    : commentaire.split("\n");

  // Retirer emporte aussi le commentaire et la ligne vide qui suivait, sans
  // quoi le fichier garderait la trace d'un réglage disparu.
  if (bloc === null) {
    const apres = lignes.slice(fin);
    while (apres.length && apres[0].trim() === "") apres.shift();
    return [...lignes.slice(0, tete), ...apres].join("\n");
  }

  return [
    ...lignes.slice(0, tete),
    ...aEcrire,
    ...bloc.split("\n"),
    ...lignes.slice(fin),
  ].join("\n");
}

/**
 * Applique les réglages à un fichier de configuration, en préservant le reste.
 *
 * Seuls les blocs concernés sont réécrits. Tout ce que le projet a mis dans ce
 * fichier — description, tags, stockage — est conservé tel quel, y compris ce
 * que l'application ne sait pas lire.
 */
export function ecrireReglages(
  source: string,
  reglages: ReglagesEditables,
): string {
  // Les deux réglages du cycle ont disparu (2026-045) : le premier
  // enregistrement les retire, commentaires compris, plutôt que de laisser dans
  // le fichier des clés qui ne règlent plus rien. Cet enregistrement passe par
  // une relecture : le retrait s'y voit.
  let out = remplacerBloc(source, "transitions", null, "");
  out = remplacerBloc(out, "reflet_demande_fusion", null, "");
  out = remplacerBloc(
    out,
    "acces",
    `acces: ${reglages.acces}`,
    COMMENTAIRE_ACCES,
  );

  // Seule l'exigence s'écrit : la proposition est le défaut, qu'un fichier muet vaut déjà.
  if (reglages.protectionDuJeton) {
    out = remplacerBloc(
      out,
      "protection_du_jeton",
      reglages.protectionDuJeton === "exigee"
        ? "protection_du_jeton: exigee"
        : null,
      COMMENTAIRE_PROTECTION,
    );
  }

  // Le bloc n'est écrit que si le mode l'emploie : le laisser derrière soi
  // décrirait une configuration que le projet n'applique plus.
  const i = reglages.identite;
  out = remplacerBloc(
    out,
    "identite",
    i
      ? [
          "identite:",
          `  emetteur: ${i.emetteur}`,
          `  client: ${i.client}`,
          `  echange: ${i.echange}`,
        ].join("\n")
      : null,
    COMMENTAIRE_IDENTITE,
  );
  // Les dépôts de code : le bloc disparaît quand la liste est vide, plutôt que
  // de rester en place et de décrire un projet qui n'en déclare plus.
  out = remplacerBloc(
    out,
    "depots_code",
    reglages.depotsCode?.length
      ? [
          "depots_code:",
          ...reglages.depotsCode.map(
            (d) =>
              `  - { repo: ${d.repo}${d.role.trim() ? `, role: ${d.role.trim()}` : ""} }`,
          ),
        ].join("\n")
      : null,
    COMMENTAIRE_DEPOTS_CODE,
  );

  return out.endsWith("\n") ? out : `${out}\n`;
}
