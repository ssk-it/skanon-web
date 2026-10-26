<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { styleDomaine } from "../../core/ui/couleur-domaine";
import UiIcone from "../../ui/UiIcone.vue";
import EtatVue from "../shared/EtatVue.vue";
import PistesSection from "./PistesSection.vue";
import MarkdownRendu from "../shared/MarkdownRendu.vue";
import StatutChip from "../shared/StatutChip.vue";

const route = useRoute();
const store = inject(ReferentielStore);
const liens = inject(LiensService);

const id = computed(() => String(route.params["id"]));
const domaine = computed(() => store.findDomaine(id.value));
const idsDomaines = computed(() => store.domaines().map((d) => d.id));
const fonctionnalites = computed(() =>
  store.listFonctionnalitesByDomaine(id.value),
);
const cadrages = computed(() => store.listCadragesByDomaine(id.value));

function formatAutresDomaines(ids: readonly string[]): string {
  return ids
    .filter((d) => d !== id.value)
    .map((d) => store.findDomaine(d)?.nom ?? d)
    .join(", ");
}
</script>

<template>
  <div class="page-domaine">
    <EtatVue v-if="store.etat() !== 'pret'" />
    <template v-else-if="domaine">
      <RouterLink class="retour" :to="liens.chemin('referentiel')">
        <UiIcone nom="arrow_back" /> Référentiel
      </RouterLink>

      <header class="entete" :style="styleDomaine(domaine.id, idsDomaines)">
        <p class="type">Domaine</p>
        <h1>{{ domaine.nom }}</h1>
        <MarkdownRendu class="md" :texte="domaine.description" />
      </header>

      <h2 class="section">Fonctionnalités</h2>
      <div class="liste">
        <RouterLink
          v-for="f in fonctionnalites"
          :key="f.id"
          class="ligne"
          :to="liens.chemin('referentiel', 'fonctionnalite', f.id)"
        >
          <div class="principal">
            <span class="nom">{{ f.nom }}</span>
            <span
              v-if="f.domaines.length > 1"
              class="partage"
              title="Rattachée à plusieurs domaines"
            >
              aussi dans
              {{ formatAutresDomaines(f.domaines) }}
            </span>
          </div>
          <span class="compte">
            {{ store.listReglesByFonctionnalite(f.id).length }} règles
          </span>
        </RouterLink>
        <p v-if="!fonctionnalites.length" class="vide">
          Aucune fonctionnalité rattachée à ce domaine.
        </p>
      </div>

      <h2 class="section">Cadrages</h2>
      <div class="liste">
        <RouterLink
          v-for="c in cadrages"
          :key="c.id"
          class="ligne"
          :to="liens.chemin('cadrages', c.id)"
        >
          <span class="cid">{{ c.id }}</span>
          <div class="principal">
            <span class="nom">{{ c.titre }}</span>
            <span
              v-if="c.domaines.length > 1"
              class="partage"
              title="Rattaché à plusieurs domaines"
            >
              aussi dans
              {{ formatAutresDomaines(c.domaines) }}
            </span>
          </div>
          <StatutChip :statut="c.statut" />
        </RouterLink>
        <p v-if="!cadrages.length" class="vide">
          Aucun cadrage rattaché à ce domaine.
        </p>
      </div>

      <PistesSection :id="id" :key="id" collection="domains" />
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
/* Le même repère que sur la carte du domaine : la couleur suit le domaine d'un écran à l'autre, sans quoi elle ne serait qu'un ornement de la page d'accueil. */
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
/* RG-mesure-de-lecture : le titre et sa description partagent la mesure ; les listes qui suivent gardent leur largeur. */
.entete {
  margin-bottom: 36px;
  max-width: var(--pc-mesure);
}
/* Deux listes se suivent : sans cet écart, le second titre collerait à la dernière ligne de la première et se lirait comme en faisant partie. */
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
/* Prend toute la place libre : entre l'identifiant et le statut d'un cadrage, space-between centrerait sinon le titre dans la ligne. */
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
