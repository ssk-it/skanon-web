<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import { inject } from "../core/injection";
import { DialogService, type DialogueOuvert } from "./dialog.service";

/**
 * L'hôte des dialogues, monté une fois dans `App.vue` : il affiche ceux que `DialogService` tient ouverts, par-dessus la page.
 *
 * Ce que faisait la superposition du CDK pour `MatDialog` :
 * - un fond qui assombrit la page et ferme le dialogue au clic, sans réponse ;
 * - Échap qui ferme le dernier ouvert, sans réponse ;
 * - le focus posé dans le dialogue à l'ouverture, piégé dedans tant qu'il est ouvert — Tab boucle sur ses éléments —, rendu ensuite à l'élément qui l'avait ;
 * - le défilement de la page bloqué derrière.
 */
const dialogues = inject(DialogService);

/** L'élément qui avait le focus avant chaque dialogue, pour le lui rendre. */
const precedents = new Map<number, HTMLElement | null>();
const panneaux = new Map<number, HTMLElement>();

const FOCALISABLES =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focalisables(panneau: HTMLElement): HTMLElement[] {
  return Array.from(panneau.querySelectorAll<HTMLElement>(FOCALISABLES)).filter(
    (el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true",
  );
}

function enregistrer(id: number, el: unknown): void {
  if (el instanceof HTMLElement) panneaux.set(id, el);
  else panneaux.delete(id);
}

function poserFocus(d: DialogueOuvert): void {
  const panneau = panneaux.get(d.id);
  if (!panneau) return;
  const initial =
    d.options.focus === "dialogue"
      ? null
      : (panneau.querySelector<HTMLElement>("[data-focus-initial]") ??
        focalisables(panneau)[0] ??
        null);
  (initial ?? panneau).focus();
}

function surTouche(d: DialogueOuvert, e: KeyboardEvent): void {
  const liste = dialogues.ouverts();
  if (liste[liste.length - 1]?.id !== d.id) return;
  if (e.key === "Escape") {
    e.preventDefault();
    d.fermer(undefined);
    return;
  }
  if (e.key !== "Tab") return;
  const panneau = panneaux.get(d.id);
  if (!panneau) return;
  const elements = focalisables(panneau);
  if (!elements.length) {
    e.preventDefault();
    panneau.focus();
    return;
  }
  const premier = elements[0];
  const dernier = elements[elements.length - 1];
  const actif = document.activeElement;
  if (e.shiftKey && (actif === premier || actif === panneau)) {
    e.preventDefault();
    dernier.focus();
  } else if (!e.shiftKey && actif === dernier) {
    e.preventDefault();
    premier.focus();
  }
}

/**
 * Le défilement de la page est bloqué tant qu'un dialogue est ouvert, sans que sa barre disparaisse : la page ne se décale pas sous le fond — la stratégie de blocage du CDK.
 */
let defilementBloque: { x: number; y: number } | null = null;

function bloquerDefilement(): void {
  const racine = document.documentElement;
  if (defilementBloque || racine.scrollHeight <= window.innerHeight) return;
  defilementBloque = { x: window.scrollX, y: window.scrollY };
  racine.style.top = `${-defilementBloque.y}px`;
  racine.style.left = `${-defilementBloque.x}px`;
  racine.classList.add("ui-defilement-bloque");
}

function libererDefilement(): void {
  if (!defilementBloque) return;
  const racine = document.documentElement;
  racine.classList.remove("ui-defilement-bloque");
  racine.style.top = "";
  racine.style.left = "";
  window.scrollTo(defilementBloque.x, defilementBloque.y);
  defilementBloque = null;
}

watch(
  () => dialogues.ouverts(),
  async (apres, avant = []) => {
    const ouverts = apres.filter((d) => !avant.includes(d));
    const fermes = avant.filter((d) => !apres.includes(d));
    for (const d of ouverts)
      precedents.set(d.id, document.activeElement as HTMLElement | null);

    if (apres.length) bloquerDefilement();
    else libererDefilement();

    await nextTick();
    for (const d of ouverts) poserFocus(d);
    for (const d of fermes) {
      const precedent = precedents.get(d.id);
      precedents.delete(d.id);
      if (!ouverts.length && precedent?.isConnected) precedent.focus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(libererDefilement);
</script>

<template>
  <Teleport to="body">
    <div
      v-for="(d, i) in dialogues.ouverts()"
      :key="d.id"
      class="ui-dialog-calque"
      :class="{ 'ui-dialog-calque--haut': !!d.options.haut }"
      :inert="i < dialogues.ouverts().length - 1 || undefined"
    >
      <div class="ui-dialog-fond" @click="d.fermer(undefined)"></div>
      <div
        :ref="(el) => enregistrer(d.id, el)"
        class="ui-dialog-panneau"
        :class="d.options.classe"
        role="dialog"
        aria-modal="true"
        :aria-label="d.options.libelle"
        tabindex="-1"
        :style="{
          width: d.options.largeur,
          maxWidth: d.options.largeurMax,
          marginTop: d.options.haut,
        }"
        @keydown="surTouche(d, $event)"
      >
        <component
          :is="d.composant"
          :data="d.options.data"
          @fermer="d.fermer($event)"
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
