/**
 * Une teinte par domaine, distincte pour chacun et stable dans le temps.
 *
 * Le référentiel ne déclare aucune couleur, et il ne doit pas avoir à le faire :
 * ce serait un réglage de plus à tenir, dans un fichier qui décrit le produit et
 * non son affichage.
 *
 * La couleur porte ici de l'information : elle dit à quel domaine appartient ce
 * qu'on regarde, sur des écrans où fonctionnalités et règles se ressemblent
 * toutes. Elle ne remplace jamais le nom, qui reste écrit à côté.
 *
 * **Pourquoi pas une empreinte du slug.** C'était la première version, et elle
 * était fausse : projeter une empreinte sur douze teintes rend les collisions
 * probables bien avant d'avoir douze domaines — 40 % dès quatre, par le paradoxe
 * des anniversaires. Le dépôt de référence en donnait aussitôt l'exemple, avec
 * « persistance » et « referentiel » de la même couleur. Une meilleure fonction
 * de hachage n'y aurait rien changé : le défaut est dans le modulo, pas dans le
 * hachage.
 *
 * Les teintes sont donc attribuées **par rang** : les domaines sont ordonnés par
 * identifiant, et l'espace des teintes est réparti entre eux. Deux domaines ont
 * ainsi toujours deux couleurs, et d'autant plus éloignées qu'ils sont peu
 * nombreux.
 */

/**
 * Origine de la roue, en degrés.
 *
 * Un bleu, pour que le premier domaine d'un dépôt s'accorde au primaire du
 * thème plutôt que de jurer avec.
 */
const HUE_ORIGIN = 235;

/**
 * La bande écartée, en degrés : les jaunes verdâtres.
 *
 * Vérifié à l'écran, non supposé : à la clarté du thème clair, un domaine tombé
 * sur 115° rendait un olive terne, nettement plus sale que ses voisins. Réduire
 * l'amplitude de la roue ne suffisait pas — cela ne fait que déplacer l'endroit
 * où elle tombe. La bande est donc franchement sautée.
 */
const EXCLUDED_START = 95;
const EXCLUDED_END = 155;
const EXCLUDED_WIDTH = EXCLUDED_END - EXCLUDED_START;
const USABLE = 360 - EXCLUDED_WIDTH;

/**
 * Teinte d'un domaine à un rang donné, parmi `total` domaines.
 *
 * La répartition se fait sur la roue amputée de la bande exclue, puis la teinte
 * est replacée : ainsi les couleurs restent également espacées, et aucune ne
 * tombe dans la zone illisible.
 */
export function hueAtRank(rank: number, total: number): number {
  if (total <= 0) return HUE_ORIGIN;
  const step = USABLE / Math.max(total, 1);
  // Position sur la roue utile, comptée depuis l'origine.
  const raw = (HUE_ORIGIN - EXCLUDED_END + rank * step + USABLE) % USABLE;
  return Math.round((EXCLUDED_END + raw) % 360);
}

/**
 * Le rang de chaque domaine, par identifiant croissant.
 *
 * L'ordre alphabétique des slugs plutôt que celui du chargement : ce dernier
 * dépend de l'arborescence renvoyée par la plateforme, et une couleur qui
 * changerait au gré d'un ajout de fichier ne serait plus un repère.
 */
export function domainRanks(
  ids: readonly string[],
): ReadonlyMap<string, number> {
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  return new Map(sorted.map((id, i) => [id, i]));
}

/** La teinte d'un domaine, en degrés, parmi l'ensemble des domaines du dépôt. */
export function domainHue(id: string, all: readonly string[]): number {
  const ranks = domainRanks(all);
  const rank = ranks.get(id);
  // Un domaine inconnu de la liste — un rattachement qui pointe vers un fichier
  // absent — garde une couleur neutre plutôt que d'en emprunter une autre.
  if (rank === undefined) return HUE_ORIGIN;
  return hueAtRank(rank, ranks.size);
}

/**
 * Les variables CSS portant la couleur d'un domaine.
 *
 * Rendues en `oklch`, dont la clarté est perceptuelle : à clarté égale, toutes
 * les teintes pèsent le même poids visuel. En `hsl`, un jaune et un bleu de même
 * « luminosité » n'ont pas du tout le même contraste, et il aurait fallu
 * corriger chaque teinte à la main.
 *
 * Les valeurs sont posées en style inline : les teintes ne sont pas connues à la
 * compilation, elles dépendent des domaines du dépôt ouvert.
 */
export function domainStyle(
  id: string,
  all: readonly string[],
): Record<string, string> {
  const t = domainHue(id, all);
  return {
    "--pc-domaine-h": `${t}`,
    "--pc-domaine": `oklch(var(--pc-domaine-l) var(--pc-domaine-c) ${t})`,
    "--pc-domaine-bg": `oklch(var(--pc-domaine-bg-l) var(--pc-domaine-bg-c) ${t})`,
  };
}
