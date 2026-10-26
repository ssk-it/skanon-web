<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessages } from "../../core/i18n/locale.service";
import { sideTocMessages } from "./side-toc.messages";

export interface TocEntry {
  /** Anchor, without the hash. */
  readonly id: string;
  readonly label: string;
  /** 0 for a section, 1 for an element inside it. */
  readonly level: 0 | 1;
  /** Short badge displayed on the right: impact operation, status… */
  readonly badge?: string;
}

/**
 * Side table of contents that follows scrolling.
 *
 * The active section is determined by IntersectionObserver rather than by a position calculation on every scroll event: the browser does the work off the main thread, and the list stays smooth on a long page.
 *
 * ```vue
 * <SideToc :entries="entries" title="Sur cette page" />
 * ```
 *
 * The root element is `div.sommaire`, SSK Canon's `pc-sommaire` host. The component was called `Sommaire`: a single-word name, which the `vue/multi-word-component-names` rule rejects.
 */
const props = defineProps<{ entries: readonly TocEntry[]; title?: string }>();

const t = useMessages(sideTocMessages);

const active = ref("");
let observer: IntersectionObserver | null = null;

// anchors only exist once the page is rendered
onMounted(() => void nextTick(observeSections));
// and the list changes when moving from one scoping to another
watch(
  () => props.entries,
  () => queueMicrotask(observeSections),
);

onBeforeUnmount(() => observer?.disconnect());

function observeSections(): void {
  if (typeof IntersectionObserver === "undefined") return;
  observer?.disconnect();

  const targets = props.entries
    .map((e) => document.getElementById(e.id))
    .filter((el): el is HTMLElement => el !== null);
  if (!targets.length) return;

  const visibleOnes = new Set<string>();
  const next = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visibleOnes.add(e.target.id);
        else visibleOnes.delete(e.target.id);
      }
      // A visible child wins over its section: when reading a specific decision, highlighting « Décisions » teaches nothing, whereas the decision's title locates the reading. Failing that, the section.
      const list = props.entries;
      const child = list.find((e) => e.level === 1 && visibleOnes.has(e.id));
      const first = child ?? list.find((e) => visibleOnes.has(e.id));
      if (first) active.value = first.id;
    },
    {
      // Reading band: below the sticky bar, and stopping at the first third of the screen. An element becomes active when it reaches the top of the read area, not when it peeks in at the bottom.
      rootMargin: "-88px 0px -66% 0px",
      threshold: 0,
    },
  );
  targets.forEach((c) => next.observe(c));
  observer = next;
}

/** Smooth scrolling without polluting the navigation history. */
function scrollToEntry(event: Event, id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();

  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: smooth ? "smooth" : "auto",
    block: "start",
  });
  active.value = id;
  // makes the target focusable for screen readers, without a visible outline
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}
</script>

<template>
  <div class="sommaire">
    <nav class="navigation" :aria-label="t().toc">
      <p class="titre">{{ title ?? t().toc }}</p>
      <ol>
        <li v-for="e in entries" :key="e.id" :class="{ enfant: e.level === 1 }">
          <a
            :href="'#' + e.id"
            :class="{ actif: e.id === active }"
            @click="scrollToEntry($event, e.id)"
          >
            <span class="libelle">{{ e.label }}</span>
            <span v-if="e.badge" class="marque">{{ e.badge }}</span>
          </a>
        </li>
      </ol>
    </nav>
  </div>
</template>

<style scoped>
/* The sticky lives on the root: a sticky element nested in a non-sticky parent stays attached to the latter and scrolls with it. That is what made the table of contents disappear at the bottom of the page. */
.sommaire {
  display: block;
  position: sticky;
  /* below the application bar, itself sticky */
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}
.navigation {
  padding-right: 6px;
}
.titre {
  margin: 0 0 10px;
  font-family: var(--pc-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
  border-left: 1px solid var(--mat-sys-outline-variant);
}
li.enfant a {
  padding-left: 24px;
  font-size: 12.5px;
}
a {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px 6px 13px;
  margin-left: -1px;
  border-left: 2px solid transparent;
  font-size: 13.5px;
  line-height: 1.35;
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
  transition:
    color 0.12s,
    border-color 0.12s;
}
a:hover {
  color: var(--mat-sys-on-surface);
}
a:focus-visible {
  outline: 2px solid var(--mat-sys-primary);
  outline-offset: -2px;
  border-radius: 3px;
}
a.actif {
  color: var(--mat-sys-primary);
  border-left-color: var(--mat-sys-primary);
  font-weight: 500;
}
.libelle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.marque {
  flex: none;
  font-family: var(--pc-mono);
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--mat-sys-on-surface-variant);
  opacity: 0.85;
}
@media (prefers-reduced-motion: reduce) {
  a {
    transition: none;
  }
}
</style>
