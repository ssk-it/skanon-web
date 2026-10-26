import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Rend du Markdown en HTML assaini — le `markdown.pipe` de SSK Canon, devenu une fonction.
 *
 * L'assainissement n'est pas optionnel : le contenu provient d'un dépôt tiers que l'application ne contrôle pas. Le résultat se pose par `v-html` ; il n'y est posé qu'après passage par DOMPurify.
 *
 * Partagé avec le composant qui dessine les diagrammes : deux rendus pour un même contenu finiraient par différer, et un diagramme s'afficherait autrement selon le chemin emprunté.
 */
export function renderMarkdownSync(value: string): string {
  const html = marked.parse(value, { async: false, gfm: true, breaks: false });
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "form", "input"],
  });
}

/**
 * Ce qu'un gabarit affiche : rien pour un texte vide ou absent, le HTML assaini sinon. `<div class="md" v-html="renderMarkdown(r.enonce)" />` remplace `[innerHTML]="r.enonce | markdown"`.
 */
export function renderMarkdown(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return renderMarkdownSync(value);
}
