<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import {
  groupByHorizon,
  linkedRoadmapItems,
  RoadmapItemsService,
} from "../../core/repo/roadmap-items.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiIcon from "../../ui/UiIcon.vue";
import { roadmapItemsSectionMessages } from "./roadmap-items-section.messages";

/**
 * What is envisaged for a domain or a feature — RG-pistes-a-part.
 *
 * Collapsed by default, at the bottom of the view, apart from what the specification
 * contains: a roadmap item is not what is in effect, and must not read as such.
 * It takes no status or operation colour (RG-couleur-porteuse).
 */
const props = defineProps<{
  collection: "domains" | "features";
  id: string;
}>();

const store = inject(SpecificationStore);
const service = inject(RoadmapItemsService);
const links = inject(LinksService);
const t = useMessages(roadmapItemsSectionMessages);

const open = ref(false);

const roadmapItems = computed(() =>
  linkedRoadmapItems(
    service.issues(),
    props.collection,
    props.id,
    store.scopings(),
    store.repoRef(),
  ),
);
const groups = computed(() => groupByHorizon(roadmapItems.value));
const label = computed(
  () =>
    `${props.collection === "domains" ? "domaine" : "fonctionnalite"}/${props.id}`,
);
const subject = computed(() =>
  props.collection === "domains" ? t().thisDomain : t().thisFeature,
);

onMounted(() => void service.load(store.repoRef()));
</script>

<template>
  <section class="pistes">
    <button
      type="button"
      class="bascule"
      :aria-expanded="open"
      aria-controls="contenu-pistes"
      @click="open = !open"
    >
      <UiIcon :name="open ? 'expand_less' : 'expand_more'" />
      <span class="titre">{{ t().title }}</span>
      <span v-if="service.state() === 'pret'" class="compte">
        · {{ roadmapItems.length }}
      </span>
    </button>

    <div v-if="open" id="contenu-pistes" class="contenu">
      <p class="avertissement">{{ t().warning }}</p>

      <p v-if="service.state() === 'chargement'" class="vide">
        {{ t().loading }}
      </p>
      <p v-else-if="service.state() === 'droit-manquant'" class="vide">
        {{ t().missingPermissionBefore }}<strong>Issues</strong
        >{{ t().missingPermissionAfter }}
      </p>
      <p v-else-if="service.state() === 'erreur'" class="vide">
        {{ service.error() }}
      </p>
      <p v-else-if="!roadmapItems.length" class="vide">
        {{ t().emptyBefore(subject) }}<code>piste</code>{{ t().emptyAnd
        }}<code>{{ label }}</code
        >{{ t().emptyAfter }}
      </p>

      <template v-for="g in groups" v-else :key="g.horizon">
        <h3 class="horizon">{{ t().horizons[g.horizon] }}</h3>
        <ul class="liste">
          <li v-for="p in g.roadmapItems" :key="p.number" class="piste">
            <ExternalLink class="issue" :href="p.url">
              <span class="numero">#{{ p.number }}</span>
              <span class="nom">{{ p.title }}</span>
            </ExternalLink>
            <RouterLink
              v-for="c in p.scopingsInProgress"
              :key="c"
              class="cadrage"
              :to="links.path('cadrages', c)"
            >
              {{ t().inProgress }} · {{ c }}
            </RouterLink>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.pistes {
  margin-top: 36px;
}
/* A section title that expands: same typography as the view's other titles, so that it does not pass for an action button. */
.bascule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.bascule:hover {
  color: var(--mat-sys-primary);
}
.bascule .material-symbols-outlined {
  font-size: 20px;
  width: 20px;
  height: 20px;
}
.compte {
  font-family: var(--pc-mono);
  font-size: 12px;
}
.contenu {
  margin-top: 12px;
}
/* The label that holds the boundary with what is in effect: always there, above the roadmap items, never collapsible on its own. */
.avertissement {
  margin: 0 0 16px;
  font-size: 13.5px;
  font-style: italic;
  color: var(--mat-sys-on-surface-variant);
  max-width: var(--pc-mesure);
}
.horizon {
  margin: 16px 0 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--pc-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
/* Dashed border: the list stands out at a glance from the solid ones that carry what is in effect. */
.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px dashed var(--mat-sys-outline-variant);
  border-radius: 10px;
  overflow: hidden;
}
.piste {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 12px 18px;
  border-bottom: 1px dashed var(--mat-sys-outline-variant);
}
.piste:last-child {
  border-bottom: none;
}
.issue {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.issue:hover .nom {
  text-decoration: underline;
}
.numero,
.cadrage {
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
  white-space: nowrap;
}
.cadrage:hover {
  color: var(--mat-sys-primary);
}
.nom {
  font-size: 15px;
}
.vide {
  color: var(--mat-sys-on-surface-variant);
  max-width: var(--pc-mesure);
}
</style>
