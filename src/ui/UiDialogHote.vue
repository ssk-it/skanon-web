<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import { inject } from "../core/injection";
import { DialogService, type OpenDialog } from "./dialog.service";

/**
 * L'hôte des dialogues, monté une fois dans `App.vue` : il affiche ceux que `DialogService` tient ouverts, par-dessus la page.
 *
 * Ce que faisait la superposition du CDK pour `MatDialog` :
 * - un fond qui assombrit la page et ferme le dialogue au clic, sans réponse ;
 * - Échap qui ferme le dernier ouvert, sans réponse ;
 * - le focus posé dans le dialogue à l'ouverture, piégé dedans tant qu'il est ouvert — Tab boucle sur ses éléments —, rendu ensuite à l'élément qui l'avait ;
 * - le défilement de la page bloqué derrière.
 */
const dialogs = inject(DialogService);

/** L'élément qui avait le focus avant chaque dialogue, pour le lui rendre. */
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
 * Le défilement de la page est bloqué tant qu'un dialogue est ouvert, sans que sa barre disparaisse : la page ne se décale pas sous le fond — la stratégie de blocage du CDK.
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

/* Le panneau : la surface de `mat-dialog-container` en Material 3. Il défile de lui-même quand son contenu dépasse la fenêtre — d'où la gouttière stable (docs/pratiques.md, « La mise en page »). */
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

/* Le blocage du défilement de la page : la barre reste, la page ne bouge pas. */
.ui-defilement-bloque {
  position: fixed;
  width: 100%;
  overflow-y: scroll;
  scrollbar-gutter: stable;
}
</style>
