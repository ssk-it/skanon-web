<script setup lang="ts">
import DOMPurify from "dompurify";
import { onMounted, ref, watch } from "vue";
import { inject } from "../../core/injection";
import { ThemeService } from "../../core/ui/theme.service";
import { extractDiagrams, themeMermaid } from "./diagram";
import { renderMarkdownSync } from "./markdown";

/**
 * Displays Markdown, drawing the diagrams it contains.
 *
 * A component rather than a function: rendering a diagram is asynchronous — the engine is only loaded on demand — and a function returns a value, it does not wait.
 *
 * The engine is only imported if the page contains one. A page without a diagram therefore pays nothing more than before, which only the dynamic import guarantees: an ordinary import would put it in the main bundle, loaded everywhere.
 *
 * The root element is `div.markdown-rendu`, SSK Canon's `pc-markdown` host.
 */
const props = defineProps<{ text?: string | null }>();

const theme = inject(ThemeService);
const host = ref<HTMLElement | null>(null);

onMounted(() => {
  // The theme is tracked here, not read inside `render`: a toggle redraws the diagrams. A theme read only at render time would leave the diagrams already displayed in the old one.
  watch(
    [() => props.text, () => theme.effective()],
    ([value, effective]) => void render(value ?? "", effective),
    { immediate: true },
  );
});

async function render(
  text: string,
  effective: "clair" | "sombre",
): Promise<void> {
  const element = host.value;
  if (!element) return;
  if (!text.trim()) {
    element.innerHTML = "";
    return;
  }

  const html = renderMarkdownSync(text);
  const diagrams = extractDiagrams(html);

  // Nothing to draw: stop before loading anything.
  if (!diagrams.length) {
    element.innerHTML = html;
    return;
  }

  element.innerHTML = diagrams[diagrams.length - 1].html;

  const mermaid = await loadEngine(effective);
  for (const d of diagrams) {
    const target = element.querySelector(`[data-diagramme="${d.id}"]`);
    if (!target) continue;
    try {
      const { svg } = await mermaid.render(`mermaid-${d.id}`, d.source);
      // The engine produces markup from a text the application does not control: it goes through the same sanitising as the rest.
      target.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      makeEnlargeable(target as HTMLElement);
    } catch (e) {
      target.outerHTML = errorMessage(e);
    }
  }
}
</script>

<script lang="ts">
/**
 * The engine, loaded once and shared.
 *
 * Two diagrams on the same page, or two successive pages, must not trigger two loads: the module is cached by the browser, but the initialisation is not.
 */
let engine: Promise<typeof import("mermaid").default> | null = null;
let appliedTheme: "clair" | "sombre" | null = null;

async function loadEngine(effective: "clair" | "sombre") {
  engine ??= import("mermaid").then((m) => m.default);
  const mermaid = await engine;

  // `initialize` is global to the engine: calling it again on a theme change is what makes the diagrams follow, and calling it again without a change would needlessly reset a shared state.
  if (appliedTheme !== effective) {
    mermaid.initialize({
      startOnLoad: false,
      // `loose` would allow clicks and HTML in labels, on a text coming from a repo. `strict` is the only mode compatible with this content not being controlled.
      securityLevel: "strict",
      theme: themeMermaid(effective),
      // Labels are drawn in SVG, not as HTML inside a `foreignObject`.
      //
      // DOMPurify removes `foreignObject` — it is HTML injected in the middle of an SVG, and its removal is deliberate. Diagrams therefore displayed complete and mute: shapes without text, which one takes for the intended diagram rather than for a defect.
      //
      // Weakening the sanitising would be the wrong answer: the text comes from a repo the application does not control. `htmlLabels` is set globally as well as per type: the engine's recent renderer does not always read the diagram-specific option.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
    });
    appliedTheme = effective;
  }
  return mermaid;
}

/**
 * Makes a diagram enlargeable.
 *
 * The engine constrains the SVG to its « natural » width — a few hundred pixels for a flow of a few nodes —, which makes it unreadable as soon as it carries text. Enlarging shows it at screen size.
 *
 * A hover and a button role rather than an icon: the click target is the whole diagram, and nothing would signal better that it is clickable than a cursor that changes over it.
 */
function makeEnlargeable(target: HTMLElement): void {
  target.classList.add("pc-diagramme-cliquable");
  target.setAttribute("role", "button");
  target.setAttribute("tabindex", "0");
  target.setAttribute("title", "Agrandir le diagramme");

  const open = () => enlarge(target.innerHTML);
  target.addEventListener("click", open);
  target.addEventListener("keydown", (e) => {
    // With the keyboard, what one expects of an element announced as a button.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
}

/**
 * Opens a diagram large, over the page.
 *
 * The content is the one already sanitised and displayed: sanitising it again would change nothing, regenerating it would make enlarging depend on a second render that could differ.
 */
function enlarge(sanitizedSvg: string): void {
  const background = document.createElement("div");
  background.className = "pc-diagramme-agrandi";
  background.innerHTML = `<div class="pc-diagramme-agrandi-contenu">${sanitizedSvg}</div>`;

  const close = () => {
    background.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  // The backdrop closes, the content does not: clicking the enlarged diagram to look at it more closely must not make it disappear.
  background.addEventListener("click", (e) => {
    if (e.target === background) close();
  });
  document.addEventListener("keydown", onKey);

  document.body.appendChild(background);
}

/**
 * What a faulty diagram leaves visible — RG-diagrammes-rendus.
 *
 * At the place where it was to appear, and without taking the page down with it: a diagram illustrates a point, it does not carry it.
 */
function errorMessage(e: unknown): string {
  const cause = e instanceof Error ? e.message : String(e);
  const own = DOMPurify.sanitize(cause, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  return `<div class="pc-diagramme-erreur">Ce diagramme n’a pas pu être dessiné : <code>${own}</code></div>`;
}
</script>

<template>
  <div ref="host" class="markdown-rendu"></div>
</template>

<style>
/* Global: the HTML is set through `innerHTML`, out of reach of a component's styles. */
.markdown-rendu {
  display: block;
}
.pc-diagramme {
  display: flex;
  justify-content: center;
  margin: 16px 0;

  svg {
    max-width: 100%;
    height: auto;
  }
}
.pc-diagramme-cliquable {
  cursor: zoom-in;
  border-radius: 4px;

  &:hover,
  &:focus-visible {
    outline: 1px solid var(--mat-sys-outline-variant);
    outline-offset: 4px;
  }
}
.pc-diagramme-erreur {
  margin: 16px 0;
  padding: 10px 12px;
  border-left: 3px solid var(--mat-sys-error);
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);

  code {
    font-family: var(--pc-mono);
    font-size: 12px;
  }
}
</style>
