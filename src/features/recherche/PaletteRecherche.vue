<script lang="ts">
/** Ce que la barre transmet à l'ouverture. */
export interface DonneesPalette {
  /**
   * Vrai quand le lecteur regarde le référentiel à une autre date que maintenant. La recherche porte sur l'état courant (2026-042, décision 02) : sans le dire, un lecteur qui remonte le temps prendrait le présent pour ce qu'il regardait.
   */
  readonly surEtatPasse: boolean;
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import {
  NATURES_RESULTAT,
  buildIndexRecherche,
  findResultats,
  type NatureResultat,
  type ResultatRecherche,
} from "../../core/repo/recherche";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import UiIcone from "../../ui/UiIcone.vue";

const LIBELLE_GROUPE: Record<NatureResultat, string> = {
  regle: "Règles de gestion",
  decision: "Décisions",
  architecture: "Architecture",
  cadrage: "Cadrages",
};

/**
 * Au-delà, la palette cesse d'aider à choisir : elle invite à préciser plutôt que de dérouler une liste qu'on ne lira pas.
 */
const MAX_PAR_GROUPE = 6;

interface Groupe {
  readonly cle: string;
  readonly titre: string;
  readonly enCours: boolean;
  readonly resultats: readonly ResultatRecherche[];
  readonly masques: number;
}

/**
 * Chercher dans le référentiel depuis n'importe quelle vue — RG-recherche-a-portee-de-clavier.
 *
 * Une palette, non une vue : une recherche sert à aller ailleurs, et l'adresse qui compte est celle de l'élément trouvé, qui existe déjà. Échap rend la vue quittée intacte.
 *
 * L'élément racine est `div.palette-recherche`, l'hôte `pc-palette-recherche` de SSK Canon. `App.vue` l'ouvre par `DialogService` avec ces `data`, et attend `fermer`.
 */
const props = defineProps<{ data: DonneesPalette }>();
const emit = defineEmits<{ fermer: [] }>();

const store = inject(ReferentielStore);
const liens = inject(LiensService);
const router = useRouter();

const requete = ref("");
const actifIndex = ref(0);

/**
 * L'index suit le référentiel : il se reconstruit quand celui-ci change — après une écriture, ou quand les branches finissent d'arriver.
 */
const index = computed(() => buildIndexRecherche(store.referentiel()));

const resultats = computed(() => findResultats(index.value, requete.value));

/**
 * Le référentiel par nature, puis les cadrages en cours.
 *
 * Les cadrages en cours forment un groupe à part et le dernier : ils arrivent après les autres, et s'ajouter en fin de liste ne déplace pas ce que le lecteur était en train de parcourir.
 */
const groupes = computed<readonly Groupe[]>(() => {
  const { referentiel, enCours } = resultats.value;
  const liste: Groupe[] = NATURES_RESULTAT.map((nature) => {
    const tous = referentiel.filter((r) => r.nature === nature);
    return {
      cle: nature,
      titre: LIBELLE_GROUPE[nature],
      enCours: false,
      resultats: tous.slice(0, MAX_PAR_GROUPE),
      masques: Math.max(0, tous.length - MAX_PAR_GROUPE),
    };
  }).filter((g) => g.resultats.length);

  // Le groupe se montre aussi vide tant que les branches arrivent : c'est là qu'il dit qu'elles arrivent.
  if (enCours.length || store.branchesEnChargement()) {
    liste.push({
      cle: "en-cours",
      titre: "En cours",
      enCours: true,
      resultats: enCours.slice(0, MAX_PAR_GROUPE),
      masques: Math.max(0, enCours.length - MAX_PAR_GROUPE),
    });
  }
  return liste;
});

/** Les résultats affichés, dans l'ordre où les flèches les parcourent. */
const affiches = computed(() => groupes.value.flatMap((g) => g.resultats));

const aucunResultat = computed(() => affiches.value.length === 0);

const actif = computed<ResultatRecherche | null>(
  () => affiches.value[actifIndex.value] ?? null,
);

function indexDe(r: ResultatRecherche): number {
  return affiches.value.indexOf(r);
}

/** L'adresse d'un résultat, à son ancre s'il en a une. */
function cible(r: ResultatRecherche): RouteLocationRaw {
  return {
    path: liens.chemin(...r.lien),
    hash: r.ancre ? `#${r.ancre}` : undefined,
  };
}

function setRequete(valeur: string): void {
  requete.value = valeur;
  actifIndex.value = 0;
}

function onKeydown(e: KeyboardEvent): void {
  const total = affiches.value.length;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (total) actifIndex.value = (actifIndex.value + 1) % total;
      break;
    case "ArrowUp":
      e.preventDefault();
      if (total) actifIndex.value = (actifIndex.value - 1 + total) % total;
      break;
    case "Enter": {
      const r = actif.value;
      if (!r) return;
      e.preventDefault();
      void router.push(cible(r));
      fermer();
      break;
    }
  }
}

function fermer(): void {
  emit("fermer");
}
</script>

<template>
  <div class="palette-recherche">
    <div class="champ">
      <UiIcone nom="search" />
      <input
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Rechercher une règle, une décision, un cadrage…"
        aria-label="Rechercher dans le référentiel"
        role="combobox"
        aria-expanded="true"
        aria-controls="resultats-recherche"
        :aria-activedescendant="actif ? 'resultat-' + actifIndex : undefined"
        :value="requete"
        @input="setRequete(($event.target as HTMLInputElement).value)"
        @keydown="onKeydown"
      />
      <kbd class="echap">Échap</kbd>
    </div>

    <p v-if="props.data.surEtatPasse" class="etat-courant" role="note">
      <UiIcone nom="history" />
      Les résultats valent pour le référentiel d’aujourd’hui, non pour les dates
      que vous consultez.
    </p>

    <div
      id="resultats-recherche"
      class="resultats"
      role="listbox"
      aria-label="Résultats"
    >
      <p v-if="!requete.trim()" class="aide">
        Cherche dans le texte entier des règles, des décisions, de
        l’architecture et des cadrages — l’état actuel du référentiel, et les
        cadrages en cours.
      </p>
      <template v-else-if="!aucunResultat">
        <section
          v-for="g of groupes"
          :key="g.cle"
          class="groupe"
          :class="{ 'en-cours': g.enCours }"
          role="group"
          :aria-label="g.titre"
        >
          <h3 class="groupe-titre">{{ g.titre }}</h3>
          <p v-if="g.enCours" class="groupe-note">
            <template v-if="store.branchesEnChargement()">
              Lecture des branches en cours… d’autres résultats peuvent
              s’ajouter.
            </template>
            <template v-else>
              Sur leur branche : pas encore dans le référentiel.
            </template>
          </p>
          <RouterLink
            v-for="r of g.resultats"
            :id="'resultat-' + indexDe(r)"
            :key="r.nature + r.id"
            class="resultat"
            role="option"
            :aria-selected="actif === r"
            :class="{ actif: actif === r }"
            :to="cible(r)"
            @click="fermer()"
            @mouseenter="actifIndex = indexDe(r)"
          >
            <span class="ligne">
              <span class="identifiant">{{ r.identifiant }}</span>
              <span v-if="r.pullRequest !== null" class="branche"
                ><UiIcone nom="call_split" />#{{ r.pullRequest }}</span
              >
            </span>
            <span v-if="r.titre" class="titre">{{ r.titre }}</span>
            <span v-if="r.extrait" class="extrait">{{ r.extrait }}</span>
          </RouterLink>
          <p v-if="g.masques" class="masques">
            {{ g.masques }} autre{{ g.masques > 1 ? "s" : "" }} — précisez la
            recherche.
          </p>
        </section>
      </template>
      <p v-else class="vide">
        Aucun résultat pour « {{ requete.trim() }} ». La recherche porte sur les
        règles, les décisions, l’architecture et les cadrages, y compris les
        cadrages en cours.
        <template v-if="store.branchesEnChargement()">
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
/* Sur un écran tactile, ni Échap ni les flèches n'existent. */
@media (pointer: coarse) {
  .pied,
  .echap {
    display: none;
  }
}
</style>
