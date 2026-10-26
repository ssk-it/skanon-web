<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import UiIcone from "./UiIcone.vue";
import {
  Z_PANNEAU,
  placerSous,
  useSuperposition,
  type Position,
} from "./superposition";

/** Une entrée du menu. */
export interface ActionMenu {
  readonly libelle: string;
  /** Le nom d'une icône Material Symbols, posée devant le libellé. */
  readonly icone?: string;
  readonly desactive?: boolean;
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
defineProps<{ actions: readonly ActionMenu[] }>();

const id = useId();
const ouvert = ref(false);
const position = ref<Position>({ top: "0px", left: "0px" });
const hote = ref<HTMLElement | null>(null);
const panneau = ref<HTMLElement | null>(null);

function declencheur(): HTMLElement | null {
  return (hote.value?.firstElementChild as HTMLElement | null) ?? null;
}

function entrees(): HTMLButtonElement[] {
  return Array.from(
    panneau.value?.querySelectorAll<HTMLButtonElement>(
      ".ui-menu__entree:not(:disabled)",
    ) ?? [],
  );
}

function replacer(): void {
  const ancre = declencheur()?.getBoundingClientRect();
  if (!ancre) return;
  const taille = panneau.value?.getBoundingClientRect();
  position.value = placerSous(ancre, {
    width: taille?.width ?? 0,
    height: taille?.height ?? 0,
  });
}

async function ouvrir(): Promise<void> {
  if (ouvert.value) return;
  ouvert.value = true;
  replacer();
  await nextTick();
  replacer();
  entrees()[0]?.focus();
}

function fermer(rendreFocus = true): void {
  if (!ouvert.value) return;
  ouvert.value = false;
  if (rendreFocus) declencheur()?.focus();
}

function basculer(): void {
  if (ouvert.value) fermer();
  else void ouvrir();
}

function choisir(action: ActionMenu): void {
  fermer();
  action.action();
}

useSuperposition(
  ouvert,
  () => [declencheur(), panneau.value],
  () => fermer(false),
  replacer,
);

function surTouche(e: KeyboardEvent): void {
  const liste = entrees();
  const courant = liste.indexOf(document.activeElement as HTMLButtonElement);
  const aller = (i: number) => {
    e.preventDefault();
    liste[(i + liste.length) % liste.length]?.focus();
  };
  switch (e.key) {
    case "ArrowDown":
      aller(courant + 1);
      break;
    case "ArrowUp":
      aller(courant <= 0 ? liste.length - 1 : courant - 1);
      break;
    case "Home":
      aller(0);
      break;
    case "End":
      aller(liste.length - 1);
      break;
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      fermer();
      break;
    case "Tab":
      e.preventDefault();
      fermer();
      break;
  }
}

const attributs = computed(() => ({
  "aria-haspopup": "menu" as const,
  "aria-expanded": ouvert.value,
  "aria-controls": ouvert.value ? id : undefined,
  onClick: basculer,
}));

defineExpose({ ouvrir, fermer, ouvert });
</script>

<template>
  <span ref="hote" class="ui-menu">
    <slot name="declencheur" :attributs="attributs" :ouvert="ouvert" />
    <Teleport to="body">
      <div
        v-if="ouvert"
        :id="id"
        ref="panneau"
        class="ui-menu__panneau"
        role="menu"
        :style="{ ...position, zIndex: Z_PANNEAU }"
        @keydown="surTouche"
      >
        <button
          v-for="(a, i) in actions"
          :key="i"
          type="button"
          class="ui-menu__entree"
          role="menuitem"
          :disabled="a.desactive"
          @click="choisir(a)"
        >
          <UiIcone v-if="a.icone" :nom="a.icone" />
          <span>{{ a.libelle }}</span>
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
