/**
 * One hue per domain, distinct for each and stable over time.
 *
 * The specification declares no colour, and it must not have to:
 * that would be one more setting to maintain, in a file that describes the product and
 * not its display.
 *
 * Colour carries information here: it says which domain what one is looking at
 * belongs to, on screens where features and rules all look
 * alike. It never replaces the name, which stays written next to it.
 *
 * **Why not a fingerprint of the slug.** That was the first version, and it
 * was wrong: projecting a fingerprint onto twelve hues makes collisions
 * likely well before having twelve domains — 40 % from four, by the birthday
 * paradox. The reference repo immediately gave an example of it, with
 * « persistance » and « referentiel » in the same colour. A better hash
 * function would have changed nothing: the defect is in the modulo, not in the
 * hash.
 *
 * Hues are therefore assigned **by rank**: domains are ordered by
 * identifier, and the hue space is divided among them. Two domains thus
 * always have two colours, and the further apart the fewer
 * they are.
 */

/**
 * Origin of the wheel, in degrees.
 *
 * A blue, so that a repo's first domain matches the theme's primary
 * rather than clashing with it.
 */
const HUE_ORIGIN = 235;

/**
 * The excluded band, in degrees: the greenish yellows.
 *
 * Checked on screen, not assumed: at the light theme's lightness, a domain that fell
 * on 115° gave a dull olive, clearly dirtier than its neighbours. Reducing
 * the wheel's amplitude was not enough — it only moves the place
 * where it falls. The band is therefore skipped outright.
 */
const EXCLUDED_START = 95;
const EXCLUDED_END = 155;
const EXCLUDED_WIDTH = EXCLUDED_END - EXCLUDED_START;
const USABLE = 360 - EXCLUDED_WIDTH;

/**
 * Hue of a domain at a given rank, among `total` domains.
 *
 * The distribution is done on the wheel minus the excluded band, then the hue
 * is put back in place: so the colours stay evenly spaced, and none
 * falls in the unreadable zone.
 */
export function hueAtRank(rank: number, total: number): number {
  if (total <= 0) return HUE_ORIGIN;
  const step = USABLE / Math.max(total, 1);
  // Position on the usable wheel, counted from the origin.
  const raw = (HUE_ORIGIN - EXCLUDED_END + rank * step + USABLE) % USABLE;
  return Math.round((EXCLUDED_END + raw) % 360);
}

/**
 * The rank of each domain, by ascending identifier.
 *
 * The alphabetical order of slugs rather than the loading order: the latter
 * depends on the tree returned by the platform, and a colour that
 * changed whenever a file was added would no longer be a landmark.
 */
export function domainRanks(
  ids: readonly string[],
): ReadonlyMap<string, number> {
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  return new Map(sorted.map((id, i) => [id, i]));
}

/** A domain's hue, in degrees, among all the repo's domains. */
export function domainHue(id: string, all: readonly string[]): number {
  const ranks = domainRanks(all);
  const rank = ranks.get(id);
  // A domain unknown to the list — an attachment pointing to a missing
  // file — keeps a neutral colour rather than borrowing another one.
  if (rank === undefined) return HUE_ORIGIN;
  return hueAtRank(rank, ranks.size);
}

/**
 * The CSS variables carrying a domain's colour.
 *
 * Rendered in `oklch`, whose lightness is perceptual: at equal lightness, all
 * hues carry the same visual weight. In `hsl`, a yellow and a blue of the same
 * "lightness" do not have the same contrast at all, and each hue would have
 * had to be corrected by hand.
 *
 * The values are set as inline style: the hues are not known at
 * compile time, they depend on the open repo's domains.
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
