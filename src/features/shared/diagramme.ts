/**
 * Repérage des diagrammes dans du Markdown rendu — RG-diagrammes-rendus.
 *
 * Séparé du rendu lui-même, et sans dépendance au moteur : c'est ce module qui décide **si** le moteur sera chargé, et il doit pouvoir répondre sans lui. Une page sans diagramme ne paie ainsi rien de plus qu'avant.
 */

/** Un diagramme trouvé dans du Markdown rendu. */
export interface DiagrammeTrouve {
  /** Identifiant unique dans la page, qui relie l'emplacement à sa source. */
  readonly id: string;
  /** Le texte du diagramme, tel que le moteur l'attend. */
  readonly source: string;
  /** Le HTML où ce bloc a été remplacé par son emplacement. */
  readonly html: string;
}

/** L'emplacement qu'un diagramme occupe en attendant d'être dessiné. */
export function marqueurDiagramme(id: string): string {
  return `<div class="pc-diagramme" data-diagramme="${id}"></div>`;
}

/**
 * Les blocs `mermaid` d'un HTML rendu, remplacés par leur emplacement.
 *
 * Le texte est rendu à sa forme d'origine : le rendu Markdown a échappé les chevrons et les esperluettes, que le moteur de diagramme attend intacts. Lui passer le texte échappé produirait une erreur de syntaxe sur un diagramme pourtant correct — et le rédacteur chercherait longtemps.
 */
export function extraireDiagrammes(html: string): DiagrammeTrouve[] {
  const trouves: DiagrammeTrouve[] = [];
  let courant = html;
  let n = 0;

  const motif =
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;
  let m: RegExpExecArray | null;

  while ((m = motif.exec(html)) !== null) {
    const id = `d${n++}-${Math.random().toString(36).slice(2, 8)}`;
    const source = desechapper(m[1]);
    courant = courant.replace(m[0], marqueurDiagramme(id));
    trouves.push({ id, source, html: courant });
  }

  // Chaque entrée porte le HTML tel qu'il est après son propre remplacement ; la dernière porte donc celui où tous les blocs ont été remplacés. C'est celui-là que l'appelant affiche.
  return trouves.map((d) => ({ ...d, html: courant }));
}

/** Rend au texte les caractères que le rendu Markdown a échappés. */
function desechapper(texte: string): string {
  return (
    texte
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // L'esperluette en dernier : la rendre d'abord ferait relire comme entité ce qui n'en était pas une dans la source.
      .replace(/&amp;/g, "&")
  );
}

/**
 * Le thème du moteur, déduit de celui de l'application.
 *
 * Un thème figé laisse, dans l'autre mode, un texte de la couleur des formes qui le portent : le diagramme s'affiche, ses libellés sont illisibles. C'est plus coûteux qu'une absence — rien ne signale que quelque chose manque, et le lecteur croit que le schéma est ainsi.
 */
export function themeMermaid(effectif: "clair" | "sombre"): "dark" | "neutral" {
  return effectif === "sombre" ? "dark" : "neutral";
}
