<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import UiIcone from "../../ui/UiIcone.vue";
import EtatVue from "../shared/EtatVue.vue";
import MarkdownRendu from "../shared/MarkdownRendu.vue";

const LIBELLE_NATURE: Record<string, string> = {
  composant: "Composant",
  flux: "Flux",
  contexte: "Contexte",
};

/**
 * Un document d'architecture, et ce qui s'y rattache.
 *
 * Les deux relations présentées ici se calculent : un flux dit les composants qu'il relie, un composant apprend quels flux le touchent sans qu'aucune liste ne soit tenue sur lui. C'est la propriété qui distingue ces documents d'un wiki, où la même information aurait à être maintenue des deux côtés.
 */
const route = useRoute();
const store = inject(ReferentielStore);
const liens = inject(LiensService);

const id = computed(() => String(route.params["id"]));
const document = computed(() => store.findDocumentArchitecture(id.value));
const fluxTouchants = computed(() => store.listFluxByComposant(id.value));
const cadrages = computed(() =>
  store.listCadragesImpactantCible(id.value, "architecture"),
);

function libelle(nature: string): string {
  return LIBELLE_NATURE[nature] ?? nature;
}
</script>

<template>
  <div class="page-document-architecture">
    <EtatVue v-if="store.etat() !== 'pret'" />
    <template v-else-if="document">
      <RouterLink class="retour" :to="liens.chemin('architecture')">
        <UiIcone nom="arrow_back" /> Architecture
      </RouterLink>

      <header class="entete">
        <p class="type">{{ libelle(document.nature) }}</p>
        <h1>{{ document.id }}</h1>
        <p v-if="document.statut === 'abroge'" class="abroge">
          Ce document ne s’applique plus.
        </p>
      </header>

      <MarkdownRendu class="md" :texte="document.enonce" />

      <template v-if="document.composants.length">
        <h2 class="section">Composants reliés</h2>
        <div class="liste">
          <RouterLink
            v-for="c in document.composants"
            :key="c"
            class="ligne"
            :to="liens.chemin('architecture', 'document', c)"
          >
            <span class="nom">{{ c }}</span>
            <span v-if="!store.findDocumentArchitecture(c)" class="compte"
              >non décrit</span
            >
          </RouterLink>
        </div>
      </template>

      <template v-if="fluxTouchants.length">
        <h2 class="section">Flux qui le touchent</h2>
        <div class="liste">
          <RouterLink
            v-for="f in fluxTouchants"
            :key="f.id"
            class="ligne"
            :to="liens.chemin('architecture', 'document', f.id)"
          >
            <span class="nom">{{ f.id }}</span>
          </RouterLink>
        </div>
      </template>

      <h2 class="section">Cadrages</h2>
      <div class="liste">
        <RouterLink
          v-for="c in cadrages"
          :key="c.cadrage.id"
          class="ligne"
          :to="liens.chemin('cadrages', c.cadrage.id)"
        >
          <span class="nom">{{ c.cadrage.id }}</span>
          <span class="compte">{{ c.operation }}</span>
        </RouterLink>
        <p v-if="!cadrages.length" class="vide">
          Aucun cadrage ne le déclare — voir la vérification d’intégrité.
        </p>
      </div>
    </template>
    <p v-else class="vide">Document introuvable : {{ id }}</p>
  </div>
</template>

<style scoped>
/* RG-mesure-de-lecture : la fiche entière est un texte à lire. */
.page-document-architecture {
  display: block;
  max-width: var(--pc-mesure);
}
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
.entete {
  margin-bottom: 24px;
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
  margin: 0;
  font-family: var(--pc-mono);
  font-size: 24px;
  font-weight: 400;
}
.abroge {
  margin: 8px 0 0;
  font-size: 13.5px;
  color: var(--mat-sys-error);
}
.section {
  margin: 28px 0 12px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.liste {
  display: flex;
  flex-direction: column;
}
.ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
  text-decoration: none;
  color: inherit;
}
.ligne:hover .nom {
  color: var(--mat-sys-primary);
}
.nom {
  font-family: var(--pc-mono);
  font-size: 14px;
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
