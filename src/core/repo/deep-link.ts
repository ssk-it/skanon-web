import type { RouteLocationRaw, RouteRecordRaw } from "vue-router";

/** What an opening link designates: a page of the application, and its anchor. */
export interface DeepLink {
  segments: string[];
  fragment: string | null;
}

/**
 * The recognised schemes: `skanon:`, which the desktop application declares to the system, and `web+canon:`, SSK Canon's, so that a link written for one opens in the other. The « + » is also accepted read as a space: that is what an unencoded « + » becomes in a query string, when the link is pasted as is in the address bar.
 */
const SCHEME = /^(web[+ ]canon|skanon):/i;

/**
 * Reads a `web+canon:<owner>/<repo>/<view>` link — RG-ouverture-par-protocole.
 *
 * The link carries the path of the https address, without the host, and nothing else.
 * Returns `null` for anything that does not designate a project page: a
 * link without owner or repo, a host, another scheme, a `..` segment
 * a browser would resolve outside the intended path. The link comes from an outside
 * tool; what is not recognised leads to the selection screen, never to a
 * guessed page.
 */
export function parseDeepLink(link: string | null): DeepLink | null {
  if (!link || !SCHEME.test(link)) return null;
  const rest = link.replace(SCHEME, "");

  // An authority (`//host`, or its backslash variant that
  // browsers normalise) or a nested scheme: the link claims to lead
  // somewhere other than the application. It is not followed, even to a host that
  // would be its own.
  if (/^[/\\]{2}/.test(rest) || /^[a-z][a-z0-9+.-]*:/i.test(rest)) return null;

  const hashIndex = rest.indexOf("#");
  const beforeAnchor = hashIndex < 0 ? rest : rest.slice(0, hashIndex);
  const anchor = hashIndex < 0 ? "" : rest.slice(hashIndex + 1);
  // No view reads a query parameter: there is nothing to pass on.
  const path = beforeAnchor.split("?")[0];

  const segments: string[] = [];
  for (const raw of path.split("/")) {
    if (raw === "") continue;
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (segment === "." || segment === ".." || /[/\\]/.test(segment))
      return null;
    segments.push(segment);
  }

  // The project is mandatory (RG-projet-dans-adresse): without owner and
  // repo, the application does not guess which one to open (RG-choix-projet-prealable).
  if (segments.length < 2) return null;

  let fragment: string | null = null;
  if (anchor) {
    try {
      fragment = decodeURIComponent(anchor);
    } catch {
      fragment = null;
    }
  }
  return { segments, fragment };
}

/**
 * The address of a page designated by a link, or the selection screen. The query is emptied: the router would otherwise keep it from one redirect to the next, and no view reads it.
 */
export function toLinkAddress(link: string | null): RouteLocationRaw {
  const designated = parseDeepLink(link);
  if (!designated) return { path: "/", query: {} };
  return {
    path: "/" + designated.segments.map(encodeURIComponent).join("/"),
    query: {},
    hash: designated.fragment ? `#${designated.fragment}` : "",
  };
}

/**
 * The reception address of opening links: the one where the desktop application leads each link the system hands it (`main.ts`), and which the web version receives as is.
 *
 * A redirect, not a page: the received link becomes the page's address, which routing then treats as a typed address. The reception address does not enter the history.
 */
export const deepLinkRoute: RouteRecordRaw = {
  path: "/ouvrir",
  redirect: (to) =>
    toLinkAddress(
      typeof to.query["lien"] === "string" ? to.query["lien"] : null,
    ),
};
