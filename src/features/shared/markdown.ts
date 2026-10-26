import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Renders Markdown into sanitised HTML — SSK Canon's `markdown.pipe`, turned into a function.
 *
 * Sanitising is not optional: the content comes from a third-party repo the application does not control. The result is set through `v-html`; it is only set there after going through DOMPurify.
 *
 * Shared with the component that draws diagrams: two renderings of the same content would end up differing, and a diagram would display differently depending on the path taken.
 */
export function renderMarkdownSync(value: string): string {
  const html = marked.parse(value, { async: false, gfm: true, breaks: false });
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "form", "input"],
  });
}

/**
 * What a template displays: nothing for an empty or absent text, the sanitised HTML otherwise. `<div class="md" v-html="renderMarkdown(r.statement)" />` replaces `[innerHTML]="r.enonce | markdown"`.
 */
export function renderMarkdown(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return renderMarkdownSync(value);
}
