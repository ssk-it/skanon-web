<script lang="ts">
/** What the bar passes on opening. */
export interface PaletteData {
  /**
   * True when the reader looks at the specification at another date than now. The search covers the current state (2026-042, decision 02): without saying so, a reader going back in time would take the present for what they were looking at.
   */
  readonly onPastState: boolean;
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import {
  RESULT_KINDS,
  buildSearchIndex,
  findResults,
  type ResultKind,
  type SearchResult,
} from "../../core/repo/search";
import { SpecificationStore } from "../../core/repo/specification.store";
import UiIcon from "../../ui/UiIcon.vue";

const GROUP_LABEL: Record<ResultKind, string> = {
  regle: "Règles de gestion",
  decision: "Décisions",
  architecture: "Architecture",
  cadrage: "Cadrages",
};

/**
 * Beyond this, the palette stops helping to choose: it invites narrowing down rather than unrolling a list no one will read.
 */
const MAX_PER_GROUP = 6;

interface Group {
  readonly key: string;
  readonly title: string;
  readonly inProgress: boolean;
  readonly results: readonly SearchResult[];
  readonly hidden: number;
}

/**
 * Search the specification from any view — RG-recherche-a-portee-de-clavier.
 *
 * A palette, not a view: a search serves to go elsewhere, and the address that matters is that of the found element, which already exists. Escape leaves the departed view intact.
 *
 * The root element is `div.palette-recherche`, SSK Canon's `pc-palette-recherche` host. `App.vue` opens it through `DialogService` with this `data`, and waits for `close`.
 */
const props = defineProps<{ data: PaletteData }>();
const emit = defineEmits<{ close: [] }>();

const store = inject(SpecificationStore);
const links = inject(LinksService);
const router = useRouter();

const query = ref("");
const activeIndex = ref(0);

/**
 * The index follows the specification: it is rebuilt when the latter changes — after a write, or when the branches finish arriving.
 */
const index = computed(() => buildSearchIndex(store.specification()));

const results = computed(() => findResults(index.value, query.value));

/**
 * The specification by kind, then the scopings in progress.
 *
 * Scopings in progress form a separate group, and the last one: they arrive after the others, and appending at the end of the list does not move what the reader was going through.
 */
const groups = computed<readonly Group[]>(() => {
  const { specification, inProgress } = results.value;
  const list: Group[] = RESULT_KINDS.map((kind) => {
    const all = specification.filter((r) => r.kind === kind);
    return {
      key: kind,
      title: GROUP_LABEL[kind],
      inProgress: false,
      results: all.slice(0, MAX_PER_GROUP),
      hidden: Math.max(0, all.length - MAX_PER_GROUP),
    };
  }).filter((g) => g.results.length);

  // The group shows even when empty while branches are arriving: that is where it says they are arriving.
  if (inProgress.length || store.loadingBranches()) {
    list.push({
      key: "en-cours",
      title: "En cours",
      inProgress: true,
      results: inProgress.slice(0, MAX_PER_GROUP),
      hidden: Math.max(0, inProgress.length - MAX_PER_GROUP),
    });
  }
  return list;
});

/** The displayed results, in the order the arrow keys go through them. */
const displayed = computed(() => groups.value.flatMap((g) => g.results));

const noResult = computed(() => displayed.value.length === 0);

const active = computed<SearchResult | null>(
  () => displayed.value[activeIndex.value] ?? null,
);

function indexOf(r: SearchResult): number {
  return displayed.value.indexOf(r);
}

/** A result's address, at its anchor if it has one. */
function target(r: SearchResult): RouteLocationRaw {
  return {
    path: links.path(...r.link),
    hash: r.anchor ? `#${r.anchor}` : undefined,
  };
}

function setQuery(value: string): void {
  query.value = value;
  activeIndex.value = 0;
}

function onKeydown(e: KeyboardEvent): void {
  const total = displayed.value.length;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (total) activeIndex.value = (activeIndex.value + 1) % total;
      break;
    case "ArrowUp":
      e.preventDefault();
      if (total) activeIndex.value = (activeIndex.value - 1 + total) % total;
      break;
    case "Enter": {
      const r = active.value;
      if (!r) return;
      e.preventDefault();
      void router.push(target(r));
      close();
      break;
    }
  }
}

function close(): void {
  emit("close");
}
</script>

<template>
  <div class="palette-recherche">
    <div class="champ">
      <UiIcon name="search" />
      <input
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Rechercher une règle, une décision, un cadrage…"
        aria-label="Rechercher dans le référentiel"
        role="combobox"
        aria-expanded="true"
        aria-controls="resultats-recherche"
        :aria-activedescendant="active ? 'resultat-' + activeIndex : undefined"
        :value="query"
        @input="setQuery(($event.target as HTMLInputElement).value)"
        @keydown="onKeydown"
      />
      <kbd class="echap">Échap</kbd>
    </div>

    <p v-if="props.data.onPastState" class="etat-courant" role="note">
      <UiIcon name="history" />
      Les résultats valent pour le référentiel d’aujourd’hui, non pour les dates
      que vous consultez.
    </p>

    <div
      id="resultats-recherche"
      class="resultats"
      role="listbox"
      aria-label="Résultats"
    >
      <p v-if="!query.trim()" class="aide">
        Cherche dans le texte entier des règles, des décisions, de
        l’architecture et des cadrages — l’état actuel du référentiel, et les
        cadrages en cours.
      </p>
      <template v-else-if="!noResult">
        <section
          v-for="g of groups"
          :key="g.key"
          class="groupe"
          :class="{ 'en-cours': g.inProgress }"
          role="group"
          :aria-label="g.title"
        >
          <h3 class="groupe-titre">{{ g.title }}</h3>
          <p v-if="g.inProgress" class="groupe-note">
            <template v-if="store.loadingBranches()">
              Lecture des branches en cours… d’autres résultats peuvent
              s’ajouter.
            </template>
            <template v-else>
              Sur leur branche : pas encore dans le référentiel.
            </template>
          </p>
          <RouterLink
            v-for="r of g.results"
            :id="'resultat-' + indexOf(r)"
            :key="r.kind + r.id"
            class="resultat"
            role="option"
            :aria-selected="active === r"
            :class="{ actif: active === r }"
            :to="target(r)"
            @click="close()"
            @mouseenter="activeIndex = indexOf(r)"
          >
            <span class="ligne">
              <span class="identifiant">{{ r.identifier }}</span>
              <span v-if="r.pullRequest !== null" class="branche"
                ><UiIcon name="call_split" />#{{ r.pullRequest }}</span
              >
            </span>
            <span v-if="r.title" class="titre">{{ r.title }}</span>
            <span v-if="r.excerpt" class="extrait">{{ r.excerpt }}</span>
          </RouterLink>
          <p v-if="g.hidden" class="masques">
            {{ g.hidden }} autre{{ g.hidden > 1 ? "s" : "" }} — précisez la
            recherche.
          </p>
        </section>
      </template>
      <p v-else class="vide">
        Aucun résultat pour « {{ query.trim() }} ». La recherche porte sur les
        règles, les décisions, l’architecture et les cadrages, y compris les
        cadrages en cours.
        <template v-if="store.loadingBranches()">
          Les branches sont encore en lecture : un résultat peut encore
          apparaître.
        </template>
      </p>
    </div>

    <p class="pied">
      <span><kbd>↑</kbd><kbd>↓</kbd> parcourir</span>
      <span><kbd>Entrée</kbd> ouvrir</span>
    </p>
  </div>
</template>

<style scoped>
.palette-recherche {
  display: flex;
  flex-direction: column;
  max-height: min(70vh, 640px);
}
.champ {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
  color: var(--mat-sys-on-surface-variant);
}
.champ input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--mat-sys-on-surface);
  font: inherit;
  font-size: 17px;
}
.champ input::-webkit-search-cancel-button {
  display: none;
}
kbd {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 4px;
  color: var(--mat-sys-on-surface-variant);
}
.etat-courant {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 16px;
  font-size: 13px;
  background: var(--pc-statut-relecture-bg);
  color: var(--pc-statut-relecture);
}
.etat-courant .material-symbols-outlined {
  font-size: 18px;
  width: 18px;
  height: 18px;
}
.resultats {
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 6px 8px 10px;
}
.aide,
.vide {
  margin: 12px 8px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.groupe {
  margin-top: 8px;
}
.groupe.en-cours {
  margin-top: 14px;
  padding-top: 8px;
  border-top: 1px dashed var(--mat-sys-outline-variant);
}
.groupe-titre {
  margin: 0;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.groupe-note,
.masques {
  margin: 0 8px 4px;
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.resultat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}
.resultat.actif {
  background: var(--mat-sys-surface-container-high);
}
.ligne {
  display: flex;
  align-items: center;
  gap: 8px;
}
.identifiant {
  font-family: var(--pc-mono);
  font-size: 13px;
  color: var(--mat-sys-primary);
  overflow-wrap: anywhere;
}
.branche {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--pc-statut-relecture);
}
.branche .material-symbols-outlined {
  font-size: 14px;
  width: 14px;
  height: 14px;
}
.titre {
  font-weight: 500;
}
.extrait {
  font-size: 13px;
  line-height: 1.45;
  color: var(--mat-sys-on-surface-variant);
  overflow-wrap: anywhere;
}
.pied {
  display: flex;
  gap: 16px;
  margin: 0;
  padding: 8px 16px;
  border-top: 1px solid var(--mat-sys-outline-variant);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.pied kbd {
  margin-right: 2px;
}
/* On a touch screen, neither Escape nor the arrow keys exist. */
@media (pointer: coarse) {
  .pied,
  .echap {
    display: none;
  }
}
</style>
