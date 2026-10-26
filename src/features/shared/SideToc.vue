<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface TocEntry {
  /** Ancre, sans dièse. */
  readonly id: string;
  readonly label: string;
  /** 0 pour une section, 1 pour un élément à l'intérieur. */
  readonly level: 0 | 1;
  /** Pastille courte affichée à droite : opération d'impact, statut… */
  readonly badge?: string;
}

/**
 * Sommaire latéral qui suit le défilement.
 *
 * La section active est déterminée par IntersectionObserver plutôt que par un calcul de position à chaque événement de défilement : le navigateur fait le travail hors du fil principal, et la liste reste fluide sur une fiche longue.
 *
 * ```vue
 * <SommaireLateral :entrees="entrees" titre="Sur cette page" />
 * ```
 *
 * L’élément racine est `div.sommaire`, l’hôte `pc-sommaire` de SSK Canon. Le composant s’appelait `Sommaire` : un nom d’un seul mot, que la règle `vue/multi-word-component-names` refuse.
 */
const props = withDefaults(
  defineProps<{ entries: readonly TocEntry[]; title?: string }>(),
  { title: "Sommaire" },
);

const active = ref("");
let observer: IntersectionObserver | null = null;

// les ancres n'existent qu'une fois la fiche rendue
onMounted(() => void nextTick(observeSections));
// et la liste change quand on passe d'un cadrage à un autre
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
      // Un enfant visible l'emporte sur sa section : quand on lit une décision précise, marquer « Décisions » n'apprend rien, alors que le titre de la décision situe la lecture. À défaut, la section.
      const list = props.entries;
      const child = list.find((e) => e.level === 1 && visibleOnes.has(e.id));
      const first = child ?? list.find((e) => visibleOnes.has(e.id));
      if (first) active.value = first.id;
    },
    {
      // Bande de lecture : sous la barre collante, et s'arrêtant au premier tiers de l'écran. Un élément devient actif quand il atteint le haut de la zone lue, pas quand il affleure le bas.
      rootMargin: "-88px 0px -66% 0px",
      threshold: 0,
    },
  );
  targets.forEach((c) => next.observe(c));
  observer = next;
}

/** Défilement doux sans polluer l'historique de navigation. */
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
  // rend la cible focalisable pour les lecteurs d'écran, sans contour visible
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}
</script>

<template>
  <div class="sommaire">
    <nav class="navigation" aria-label="Sommaire">
      <p class="titre">{{ title }}</p>
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
/* Le collant vit sur la racine : un élément sticky imbriqué dans un parent non collant reste attaché à ce dernier et défile avec lui. C'est ce qui faisait disparaître le sommaire en bas de page. */
.sommaire {
  display: block;
  position: sticky;
  /* sous la barre d'application, elle-même collante */
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
