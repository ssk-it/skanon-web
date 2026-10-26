<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import {
  grouperParHorizon,
  Horizon,
  pistesRattachees,
  PistesService,
} from "../../core/repo/pistes.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import LienExterne from "../../ui/LienExterne.vue";
import UiIcone from "../../ui/UiIcone.vue";

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

const store = inject(ReferentielStore);
const service = inject(PistesService);
const liens = inject(LiensService);

const ouverte = ref(false);

const LIBELLES: Record<Horizon, string> = {
  maintenant: "Maintenant",
  ensuite: "Ensuite",
  "plus-tard": "Plus tard",
  "non-classee": "Non classées",
};

const pistes = computed(() =>
  pistesRattachees(
    service.issues(),
    props.collection,
    props.id,
    store.cadrages(),
    store.depot(),
  ),
);
const groupes = computed(() => grouperParHorizon(pistes.value));
const etiquette = computed(
  () =>
    `${props.collection === "domains" ? "domaine" : "fonctionnalite"}/${props.id}`,
);
const sujet = computed(() =>
  props.collection === "domains" ? "ce domaine" : "cette fonctionnalité",
);

onMounted(() => void service.charger(store.depot()));
</script>

<template>
  <section class="pistes">
    <button
      type="button"
      class="bascule"
      :aria-expanded="ouverte"
      aria-controls="contenu-pistes"
      @click="ouverte = !ouverte"
    >
      <UiIcone :nom="ouverte ? 'expand_less' : 'expand_more'" />
      <span class="titre">À venir</span>
      <span v-if="service.etat() === 'pret'" class="compte">
        · {{ pistes.length }}
      </span>
    </button>

    <div v-if="ouverte" id="contenu-pistes" class="contenu">
      <p class="avertissement">
        Des pistes, non des règles : rien n’y est décidé tant qu’un cadrage ne
        les a pas instruites.
      </p>

      <p v-if="service.etat() === 'chargement'" class="vide">
        Lecture des pistes…
      </p>
      <p v-else-if="service.etat() === 'droit-manquant'" class="vide">
        Le jeton ne permet pas de lire les issues de ce dépôt, où vivent les
        pistes. Lui accorder la permission <strong>Issues</strong> en lecture.
      </p>
      <p v-else-if="service.etat() === 'erreur'" class="vide">
        {{ service.erreur() }}
      </p>
      <p v-else-if="!pistes.length" class="vide">
        Aucune piste pour {{ sujet }}. Une piste est une issue de ce dépôt
        étiquetée <code>piste</code> et <code>{{ etiquette }}</code
        >, rangée par son jalon : « maintenant », « ensuite » ou « plus tard ».
      </p>

      <template v-for="g in groupes" v-else :key="g.horizon">
        <h3 class="horizon">{{ LIBELLES[g.horizon] }}</h3>
        <ul class="liste">
          <li v-for="p in g.pistes" :key="p.numero" class="piste">
            <LienExterne class="issue" :href="p.url">
              <span class="numero">#{{ p.numero }}</span>
              <span class="nom">{{ p.titre }}</span>
            </LienExterne>
            <RouterLink
              v-for="c in p.cadragesEnCours"
              :key="c"
              class="cadrage"
              :to="liens.chemin('cadrages', c)"
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
