<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import {
  groupByHorizon,
  Horizon,
  linkedRoadmapItems,
  RoadmapItemsService,
} from "../../core/repo/roadmap-items.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiIcon from "../../ui/UiIcon.vue";

/**
 * Ce qui est envisagé pour un domaine ou une fonctionnalité — RG-pistes-a-part.
 *
 * Repliée par défaut, en bas de la vue, à part de ce que le référentiel
 * contient : une piste n'est pas l'effectif, et ne doit pas se lire comme tel.
 * Elle ne prend aucune couleur de statut ni d'opération (RG-couleur-porteuse).
 */
const props = defineProps<{
  collection: "domains" | "features";
  id: string;
}>();

const store = inject(SpecificationStore);
const service = inject(RoadmapItemsService);
const links = inject(LinksService);

const open = ref(false);

const LABELS: Record<Horizon, string> = {
  maintenant: "Maintenant",
  ensuite: "Ensuite",
  "plus-tard": "Plus tard",
  "non-classee": "Non classées",
};

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
  props.collection === "domains" ? "ce domaine" : "cette fonctionnalité",
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
      <span class="titre">À venir</span>
      <span v-if="service.state() === 'pret'" class="compte">
        · {{ roadmapItems.length }}
      </span>
    </button>

    <div v-if="open" id="contenu-pistes" class="contenu">
      <p class="avertissement">
        Des pistes, non des règles : rien n’y est décidé tant qu’un cadrage ne
        les a pas instruites.
      </p>

      <p v-if="service.state() === 'chargement'" class="vide">
        Lecture des pistes…
      </p>
      <p v-else-if="service.state() === 'droit-manquant'" class="vide">
        Le jeton ne permet pas de lire les issues de ce dépôt, où vivent les
        pistes. Lui accorder la permission <strong>Issues</strong> en lecture.
      </p>
      <p v-else-if="service.state() === 'erreur'" class="vide">
        {{ service.error() }}
      </p>
      <p v-else-if="!roadmapItems.length" class="vide">
        Aucune piste pour {{ subject }}. Une piste est une issue de ce dépôt
        étiquetée <code>piste</code> et <code>{{ label }}</code
        >, rangée par son jalon : « maintenant », « ensuite » ou « plus tard ».
      </p>

      <template v-for="g in groups" v-else :key="g.horizon">
        <h3 class="horizon">{{ LABELS[g.horizon] }}</h3>
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
              en cours · {{ c }}
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
/* Un titre de section qui se déplie : même typographie que les autres titres de la vue, pour qu'il ne passe pas pour un bouton d'action. */
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
/* Le libellé qui tient la frontière avec l'effectif : toujours là, au-dessus des pistes, jamais repliable à part. */
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
/* Bordure en tirets : la liste se distingue d'un coup d'œil de celles, pleines, qui portent l'effectif. */
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
