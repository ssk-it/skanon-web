<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/liens.service";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import UiIcon from "../../ui/UiIcone.vue";
import ViewState from "../shared/EtatVue.vue";
import RenderedMarkdown from "../shared/MarkdownRendu.vue";

/**
 * Une décision d'architecture, et les cadrages qui l'ont produite.
 *
 * L'énoncé affiché est l'état courant. Le raisonnement — options écartées, critère qui a tranché — vit dans le cadrage, et c'est par lui qu'on y accède : le recopier ici créerait deux textes qui finiraient par se contredire.
 */
const route = useRoute();
const store = inject(SpecificationStore);
const links = inject(LinksService);

const id = computed(() => String(route.params["id"]));
const decision = computed(() => store.findArchitectureDecision(id.value));
const scopings = computed(() =>
  store.listScopingsImpactingTarget(id.value, "adr"),
);
</script>

<template>
  <div class="page-decision-architecture">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else-if="decision">
      <RouterLink class="retour" :to="links.path('architecture')">
        <UiIcon name="arrow_back" /> Architecture
      </RouterLink>

      <header class="entete">
        <p class="type">Décision d’architecture</p>
        <h1>{{ decision.id }}</h1>
        <p v-if="decision.status === 'abroge'" class="abroge">
          Cette décision ne s’applique plus.
        </p>
      </header>

      <RenderedMarkdown class="md" :text="decision.statement" />

      <h2 class="section">Cadrages</h2>
      <div class="liste">
        <RouterLink
          v-for="c in scopings"
          :key="c.scoping.id"
          class="ligne"
          :to="links.path('cadrages', c.scoping.id)"
        >
          <span class="nom">{{ c.scoping.id }}</span>
          <span class="compte">{{ c.operation }}</span>
        </RouterLink>
        <p v-if="!scopings.length" class="vide">
          Aucun cadrage ne la déclare — voir la vérification d’intégrité.
        </p>
      </div>
    </template>
    <p v-else class="vide">Décision introuvable : {{ id }}</p>
  </div>
</template>

<style scoped>
/* RG-mesure-de-lecture : la fiche entière est un texte à lire. */
.page-decision-architecture {
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
