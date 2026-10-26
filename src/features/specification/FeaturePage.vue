<script lang="ts">
/**
 * First sentence of the statement, stripped of the most common Markdown.
 *
 * Statements are wrapped at around 80 columns: the first paragraph is rejoined before looking for the end of the sentence, a period followed by whitespace.
 */
export function buildExcerpt(statement: string): string {
  const paragraph =
    statement
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .split(/\n\s*\n/)
      .find((p) => p.trim())
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
  return paragraph.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? paragraph;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import UiIcon from "../../ui/UiIcon.vue";
import ViewState from "../shared/ViewState.vue";
import RoadmapItemsSection from "./RoadmapItemsSection.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";

const route = useRoute();
const store = inject(SpecificationStore);
const links = inject(LinksService);

const id = computed(() => String(route.params["id"]));
const feature = computed(() => store.findFeature(id.value));
const rules = computed(() => store.listRulesByFeature(id.value));
</script>

<template>
  <div class="page-fonctionnalite">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else-if="feature">
      <RouterLink class="retour" :to="links.path('referentiel')">
        <UiIcon name="arrow_back" /> Référentiel
      </RouterLink>

      <header class="entete">
        <p class="type">Fonctionnalité</p>
        <h1>{{ feature.name }}</h1>
        <div class="domaines">
          <RouterLink
            v-for="d in feature.domains"
            :key="d"
            class="pastille"
            :to="links.path('referentiel', 'domaine', d)"
          >
            {{ store.findDomain(d)?.name ?? d }}
          </RouterLink>
        </div>
        <RenderedMarkdown class="md" :text="feature.description" />
      </header>

      <h2 class="section">Règles de gestion</h2>
      <div class="liste">
        <RouterLink
          v-for="r in rules"
          :key="r.id"
          class="ligne"
          :class="{ abrogee: r.status === 'abroge' }"
          :to="links.path('referentiel', 'regle', r.id)"
        >
          <div class="principal">
            <span class="rid">{{ r.id }}</span>
            <span class="extrait">{{ buildExcerpt(r.statement) }}</span>
          </div>
          <span v-if="r.status === 'abroge'" class="marque-abrogee"
            >abrogée</span
          >
        </RouterLink>
        <p v-if="!rules.length" class="vide">
          Aucune règle rattachée à cette fonctionnalité.
        </p>
      </div>

      <RoadmapItemsSection :id="id" :key="id" collection="features" />
    </template>
    <p v-else class="vide">Fonctionnalité introuvable : {{ id }}</p>
  </div>
</template>

<style scoped>
.retour {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
  margin-bottom: 18px;
}
.retour:hover {
  color: var(--mat-sys-primary);
}
.retour .material-symbols-outlined {
  font-size: 18px;
  width: 18px;
  height: 18px;
}
.type {
  margin: 0 0 4px;
  font-family: var(--pc-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
h1 {
  margin: 0 0 10px;
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.015em;
}
/* RG-mesure-de-lecture: the title and its description share the measure; the lists that follow keep their width. */
.entete {
  margin-bottom: 36px;
  max-width: var(--pc-mesure);
}
.domaines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}
.pastille {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  background: var(--mat-sys-secondary-container);
  color: var(--mat-sys-on-secondary-container);
  text-decoration: none;
}
.pastille:hover {
  filter: brightness(0.95);
}
.section {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.liste {
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 10px;
  overflow: hidden;
}
.ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 18px;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
}
.ligne:last-child {
  border-bottom: none;
}
.ligne:hover {
  background: var(--mat-sys-surface-container);
}
.ligne.abrogee .rid,
.ligne.abrogee .extrait {
  opacity: 0.55;
}
.principal {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.rid {
  font-family: var(--pc-mono);
  font-size: 12.5px;
  color: var(--mat-sys-primary);
}
.extrait {
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.marque-abrogee {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--pc-abroge-fond);
  color: var(--pc-abroge-texte);
  white-space: nowrap;
}
.vide {
  color: var(--mat-sys-on-surface-variant);
}
</style>
