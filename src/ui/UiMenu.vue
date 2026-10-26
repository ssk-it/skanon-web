<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import UiIcon from "./UiIcon.vue";
import { Z_PANEL, placeBelow, useOverlay, type Position } from "./overlay";

/** Une entrée du menu. */
export interface MenuAction {
  readonly label: string;
  /** Le nom d'une icône Material Symbols, posée devant le libellé. */
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly action: () => void;
}

/**
 * Un menu d'actions : `mat-menu` et son `matMenuTriggerFor`.
 *
 * Le déclencheur appartient à la vue — son apparence, son libellé, son état désactivé — et reçoit par l'emplacement `#declencheur` les attributs à poser sur lui :
 *
 * ```vue
 * <UiMenu :actions="[
 *   { libelle: 'Modifier', icone: 'edit', action: () => modifierLien(l) },
 *   { libelle: 'Supprimer', icone: 'link_off', action: () => supprimerLien(l) },
 * ]">
 *   <template #declencheur="{ attributs }">
 *     <button type="button" class="menu-lien" v-bind="attributs" aria-label="Actions sur le lien">
 *       <UiIcone nom="more_vert" />
 *     </button>
 *   </template>
 * </UiMenu>
 * ```
 *
 * Comme chez Material : le panneau s'ouvre sous le déclencheur, aligné à sa gauche ; il se referme au clic dehors, à Échap et à Tab, et rend alors le focus au déclencheur. Au clavier, les flèches, Origine et Fin parcourent les entrées. Une entrée choisie referme le menu avant que son action ne s'exécute.
 */
defineProps<{ actions: readonly MenuAction[] }>();

const id = useId();
const opened = ref(false);
const position = ref<Position>({ top: "0px", left: "0px" });
const host = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

function trigger(): HTMLElement | null {
  return (host.value?.firstElementChild as HTMLElement | null) ?? null;
}

function entries(): HTMLButtonElement[] {
  return Array.from(
    panel.value?.querySelectorAll<HTMLButtonElement>(
      ".ui-menu__entree:not(:disabled)",
    ) ?? [],
  );
}

function reposition(): void {
  const anchor = trigger()?.getBoundingClientRect();
  if (!anchor) return;
  const size = panel.value?.getBoundingClientRect();
  position.value = placeBelow(anchor, {
    width: size?.width ?? 0,
    height: size?.height ?? 0,
  });
}

async function open(): Promise<void> {
  if (opened.value) return;
  opened.value = true;
  reposition();
  await nextTick();
  reposition();
  entries()[0]?.focus();
}

function close(restoreFocus = true): void {
  if (!opened.value) return;
  opened.value = false;
  if (restoreFocus) trigger()?.focus();
}

function toggle(): void {
  if (opened.value) close();
  else void open();
}

function choose(action: MenuAction): void {
  close();
  action.action();
}

useOverlay(
  opened,
  () => [trigger(), panel.value],
  () => close(false),
  reposition,
);

function onKey(e: KeyboardEvent): void {
  const list = entries();
  const current = list.indexOf(document.activeElement as HTMLButtonElement);
  const goTo = (i: number) => {
    e.preventDefault();
    list[(i + list.length) % list.length]?.focus();
  };
  switch (e.key) {
    case "ArrowDown":
      goTo(current + 1);
      break;
    case "ArrowUp":
      goTo(current <= 0 ? list.length - 1 : current - 1);
      break;
    case "Home":
      goTo(0);
      break;
    case "End":
      goTo(list.length - 1);
      break;
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      close();
      break;
    case "Tab":
      e.preventDefault();
      close();
      break;
  }
}

const attributes = computed(() => ({
  "aria-haspopup": "menu" as const,
  "aria-expanded": opened.value,
  "aria-controls": opened.value ? id : undefined,
  onClick: toggle,
}));

defineExpose({ open: open, close: close, ouvert: opened });
</script>

<template>
  <span ref="host" class="ui-menu">
    <slot name="declencheur" :attributs="attributes" :ouvert="opened" />
    <Teleport to="body">
      <div
        v-if="opened"
        :id="id"
        ref="panel"
        class="ui-menu__panneau"
        role="menu"
        :style="{ ...position, zIndex: Z_PANEL }"
        @keydown="onKey"
      >
        <button
          v-for="(a, i) in actions"
          :key="i"
          type="button"
          class="ui-menu__entree"
          role="menuitem"
          :disabled="a.disabled"
          @click="choose(a)"
        >
          <UiIcon v-if="a.icon" :name="a.icon" />
          <span>{{ a.label }}</span>
        </button>
      </div>
    </Teleport>
  </span>
</template>

<style>
.ui-menu {
  display: contents;
}
.ui-menu__panneau {
  position: fixed;
  box-sizing: border-box;
  min-width: 112px;
  max-width: 280px;
  max-height: calc(100vh - 48px);
  overflow: auto;
  scrollbar-gutter: stable;
  padding: 8px 0;
  border-radius: 4px;
  background: var(--mat-sys-surface-container);
  box-shadow: var(--mat-sys-level2);
  outline: 0;
}
.ui-menu__entree {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  margin: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--mat-sys-on-surface);
  font-family: Roboto, sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
  letter-spacing: 0.006rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.ui-menu__entree::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--mat-sys-on-surface);
  opacity: 0;
  pointer-events: none;
}
.ui-menu__entree:hover::before {
  opacity: 0.08;
}
.ui-menu__entree:focus-visible::before {
  opacity: 0.12;
}
.ui-menu__entree .material-symbols-outlined {
  color: var(--mat-sys-on-surface-variant);
}
.ui-menu__entree:disabled {
  cursor: default;
  opacity: 0.38;
}
</style>
