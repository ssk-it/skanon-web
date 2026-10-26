<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { domainStyle } from "../../core/ui/domain-color";
import UiIcon from "../../ui/UiIcon.vue";
import ViewState from "../shared/ViewState.vue";
import RoadmapItemsSection from "./RoadmapItemsSection.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";
import StatusChip from "../shared/StatusChip.vue";

const route = useRoute();
const store = inject(SpecificationStore);
const links = inject(LinksService);

const id = computed(() => String(route.params["id"]));
const domain = computed(() => store.findDomain(id.value));
const domainIds = computed(() => store.domains().map((d) => d.id));
const features = computed(() => store.listFeaturesByDomain(id.value));
const scopings = computed(() => store.listScopingsByDomain(id.value));

function formatOtherDomains(ids: readonly string[]): string {
  return ids
    .filter((d) => d !== id.value)
    .map((d) => store.findDomain(d)?.name ?? d)
    .join(", ");
}
</script>

<template>
  <div class="page-domaine">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else-if="domain">
      <RouterLink class="retour" :to="links.path('referentiel')">
        <UiIcon name="arrow_back" /> Référentiel
      </RouterLink>

      <header class="entete" :style="domainStyle(domain.id, domainIds)">
        <p class="type">Domaine</p>
        <h1>{{ domain.name }}</h1>
        <RenderedMarkdown class="md" :text="domain.description" />
      </header>

      <h2 class="section">Fonctionnalités</h2>
      <div class="liste">
        <RouterLink
          v-for="f in features"
          :key="f.id"
          class="ligne"
          :to="links.path('referentiel', 'fonctionnalite', f.id)"
        >
          <div class="principal">
            <span class="nom">{{ f.name }}</span>
            <span
              v-if="f.domains.length > 1"
              class="partage"
              title="Rattachée à plusieurs domaines"
            >
              aussi dans
              {{ formatOtherDomains(f.domains) }}
            </span>
          </div>
          <span class="compte">
            {{ store.listRulesByFeature(f.id).length }} règles
          </span>
        </RouterLink>
        <p v-if="!features.length" class="vide">
          Aucune fonctionnalité rattachée à ce domaine.
        </p>
      </div>

      <h2 class="section">Cadrages</h2>
      <div class="liste">
        <RouterLink
          v-for="c in scopings"
          :key="c.id"
          class="ligne"
          :to="links.path('cadrages', c.id)"
        >
          <span class="cid">{{ c.id }}</span>
          <div class="principal">
            <span class="nom">{{ c.title }}</span>
            <span
              v-if="c.domains.length > 1"
              class="partage"
              title="Rattaché à plusieurs domaines"
            >
              aussi dans
              {{ formatOtherDomains(c.domains) }}
            </span>
          </div>
          <StatusChip :status="c.status" />
        </RouterLink>
        <p v-if="!scopings.length" class="vide">
          Aucun cadrage rattaché à ce domaine.
        </p>
      </div>

      <RoadmapItemsSection :id="id" :key="id" collection="domains" />
    </template>
    <p v-else class="vide">Domaine introuvable : {{ id }}</p>
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
/* The same marker as on the domain card: the colour follows the domain from one screen to the next, otherwise it would be a mere ornament of the home page. */
.entete {
  border-left: 4px solid var(--pc-domaine);
  padding-left: 14px;
}
.type {
  margin: 0 0 4px;
  font-family: var(--pc-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pc-domaine);
}
h1 {
  margin: 0 0 14px;
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.015em;
}
/* RG-mesure-de-lecture: the title and its description share the measure; the lists that follow keep their width. */
.entete {
  margin-bottom: 36px;
  max-width: var(--pc-mesure);
}
/* Two lists follow each other: without this gap, the second title would stick to the last line of the first and read as part of it. */
.liste + .section {
  margin-top: 36px;
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
  padding: 14px 18px;
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
/* Takes all the free space: between a scoping's identifier and status, space-between would otherwise centre the title in the row. */
.principal {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.nom {
  font-size: 15px;
}
.cid {
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
  white-space: nowrap;
}
.partage {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.compte {
  font-family: var(--pc-mono);
  font-size: 11.5px;
  color: var(--mat-sys-on-surface-variant);
  white-space: nowrap;
}
.vide {
  color: var(--mat-sys-on-surface-variant);
}
</style>
