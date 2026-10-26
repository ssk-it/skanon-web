/**
 * Le skill de cadrage, distribué depuis le dépôt de l'automatisation.
 *
 * Il n'est pas embarqué ici : sa place est auprès du vérificateur qui fait
 * respecter le format, pour qu'une seule description de ce format existe. Deux
 * copies divergeraient dès la première correction.
 */
export const DEPOT_SKILL = "ssk-it/ssk-canon-action";

/** Ce qui compose le skill, tel qu'il vit dans le dépôt. */
export const FICHIERS_SKILL: ReadonlyArray<{ chemin: string; source: string }> =
  [
    {
      chemin: "cadrage-canon/SKILL.md",
      source: "skills/cadrage-canon/SKILL.md",
    },
    {
      chemin: "cadrage-canon/scripts/situer.mjs",
      source: "skills/cadrage-canon/scripts/situer.mjs",
    },
  ];

/**
 * Commande d'installation, à coller dans un terminal.
 *
 * Deux fichiers dans une arborescence précise : les télécharger un à un
 * obligerait à recomposer les répertoires à la main, et une erreur de placement
 * rend le skill invisible sans rien dire.
 */
export function commandeInstallation(): string {
  // Coupée court : une ligne qui déborde de son cadre paraît tronquée, alors
  // qu'elle ne fait que défiler.
  return [
    `git clone -q --depth 1 \\`,
    `  https://github.com/${DEPOT_SKILL} /tmp/canon \\`,
    "  && mkdir -p ~/.claude/skills \\",
    "  && cp -R /tmp/canon/skills/cadrage-canon ~/.claude/skills/ \\",
    "  && rm -rf /tmp/canon",
  ].join("\n");
}

/**
 * Configuration à écrire chez le développeur.
 *
 * Elle ne porte que ce qui est vrai de sa machine — où chaque référentiel est
 * cloné. Ce qui est vrai du projet, lui, est déclaré dans `ssk-canon.yml`, du
 * côté qui a autorité.
 */
export function configurationExemple(nomDepot: string): string {
  return `{\n  "projets": [\n    "~/chemin/vers/${nomDepot}"\n  ]\n}\n`;
}

/**
 * Le bloc à déclarer dans `ssk-canon.yml` pour que le skill se situe.
 *
 * Sans lui, un dépôt de code invoquant le skill ne se rattache à aucun projet :
 * c'est ce bloc, et lui seul, qui fait le lien du référentiel vers son code.
 */
export function exempleDepotsCode(
  depots: readonly { repo: string; role: string }[],
): string {
  if (depots.length === 0) {
    return [
      "depots_code:",
      "  - { repo: organisation/depot-front, role: Application web }",
      "  - { repo: organisation/depot-back, role: API }",
    ].join("\n");
  }
  return [
    "depots_code:",
    ...depots.map(
      (d) => `  - { repo: ${d.repo}${d.role ? `, role: ${d.role}` : ""} }`,
    ),
  ].join("\n");
}
