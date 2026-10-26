<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import { inject } from "../core/injection";
import { DialogService, type OpenDialog } from "./dialog.service";

/**
 * The dialog host, mounted once in `App.vue`: it shows those `DialogService` keeps open, over the page.
 *
 * What the CDK overlay did for `MatDialog`:
 * - a backdrop that darkens the page and closes the dialog on click, with no answer;
 * - Escape, which closes the last one opened, with no answer;
 * - focus placed in the dialog on opening, trapped inside while it is open — Tab cycles through its elements —, then given back to the element that had it;
 * - page scrolling blocked behind it.
 */
const dialogs = inject(DialogService);

/** The element that had focus before each dialog, to give it back. */
const previousOnes = new Map<number, HTMLElement | null>();
const panels = new Map<number, HTMLElement>();

const FOCUSABLES =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
    (el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true",
  );
}

function save(id: number, el: unknown): void {
  if (el instanceof HTMLElement) panels.set(id, el);
  else panels.delete(id);
}

function placeFocus(d: OpenDialog): void {
  const panel = panels.get(d.id);
  if (!panel) return;
  const initial =
    d.options.focus === "dialogue"
      ? null
      : (panel.querySelector<HTMLElement>("[data-focus-initial]") ??
        focusables(panel)[0] ??
        null);
  (initial ?? panel).focus();
}

function onKey(d: OpenDialog, e: KeyboardEvent): void {
  const list = dialogs.openDialogs();
  if (list[list.length - 1]?.id !== d.id) return;
  if (e.key === "Escape") {
    e.preventDefault();
    d.close(undefined);
    return;
  }
  if (e.key !== "Tab") return;
  const panel = panels.get(d.id);
  if (!panel) return;
  const elements = focusables(panel);
  if (!elements.length) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = elements[0];
  const last = elements[elements.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Page scrolling is blocked while a dialog is open, without its scrollbar disappearing: the page does not shift under the backdrop — the CDK's block strategy.
 */
let scrollLocked: { x: number; y: number } | null = null;

function lockScroll(): void {
  const root = document.documentElement;
  if (scrollLocked || root.scrollHeight <= window.innerHeight) return;
  scrollLocked = { x: window.scrollX, y: window.scrollY };
  root.style.top = `${-scrollLocked.y}px`;
  root.style.left = `${-scrollLocked.x}px`;
  root.classList.add("ui-defilement-bloque");
}

function unlockScroll(): void {
  if (!scrollLocked) return;
  const root = document.documentElement;
  root.classList.remove("ui-defilement-bloque");
  root.style.top = "";
  root.style.left = "";
  window.scrollTo(scrollLocked.x, scrollLocked.y);
  scrollLocked = null;
}

watch(
  () => dialogs.openDialogs(),
  async (after, before = []) => {
    const openDialogs = after.filter((d) => !before.includes(d));
    const closed = before.filter((d) => !after.includes(d));
    for (const d of openDialogs)
      previousOnes.set(d.id, document.activeElement as HTMLElement | null);

    if (after.length) lockScroll();
    else unlockScroll();

    await nextTick();
    for (const d of openDialogs) placeFocus(d);
    for (const d of closed) {
      const previous = previousOnes.get(d.id);
      previousOnes.delete(d.id);
      if (!openDialogs.length && previous?.isConnected) previous.focus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(unlockScroll);
</script>

<template>
  <Teleport to="body">
    <div
      v-for="(d, i) in dialogs.openDialogs()"
      :key="d.id"
      class="ui-dialog-calque"
      :class="{ 'ui-dialog-calque--haut': !!d.options.top }"
      :inert="i < dialogs.openDialogs().length - 1 || undefined"
    >
      <div class="ui-dialog-fond" @click="d.close(undefined)"></div>
      <div
        :ref="(el) => save(d.id, el)"
        class="ui-dialog-panneau"
        :class="d.options.className"
        role="dialog"
        aria-modal="true"
        :aria-label="d.options.label"
        tabindex="-1"
        :style="{
          width: d.options.width,
          maxWidth: d.options.maxWidth,
          marginTop: d.options.top,
        }"
        @keydown="onKey(d, $event)"
      >
        <component
          :is="d.component"
          :data="d.options.data"
          @close="d.close($event)"
        />
      </div>
    </div>
  </Teleport>
</template>

<style>
.ui-dialog-calque {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}
.ui-dialog-calque--haut {
  align-items: flex-start;
}

.ui-dialog-fond {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  -webkit-tap-highlight-color: transparent;
}

/* The panel: the surface of `mat-dialog-container` in Material 3. It scrolls by itself when its content exceeds the window — hence the stable gutter (docs/practices.md, "Page layout"). */
.ui-dialog-panneau {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: 560px;
  min-width: 280px;
  max-height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;
  outline: 0;
  border-radius: 28px;
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface);
}
@media (max-width: 599px) {
  .ui-dialog-panneau {
    max-width: calc(100vw - 32px);
  }
}

/* Blocking page scrolling: the scrollbar stays, the page does not move. */
.ui-defilement-bloque {
  position: fixed;
  width: 100%;
  overflow-y: scroll;
  scrollbar-gutter: stable;
}
</style>
