<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import ViewState from "../shared/ViewState.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";

/**
 * The entry into what describes how the product is built.
 *
 * The three kinds are presented separately because they are not consulted for the same reason: the context to understand the whole, the components to know what exists, the flows to follow an exchange. A single list would force sorting by eye at each visit.
 */
const store = inject(SpecificationStore);
const links = inject(LinksService);

const components = computed(() => store.listArchitectureByKind("composant"));
const flows = computed(() => store.listArchitectureByKind("flux"));
const decisions = computed(() => store.decisions());

/**
 * The first context document, if there is one.
 *
 * The model does not require it to be unique: a project can write several without anything breaking. Presenting only one here is a display choice, and the others remain reachable through their page.
 */
const context = computed(
  () => store.listArchitectureByKind("contexte")[0] ?? null,
);

/**
 * True when the project describes nothing of its architecture.
 *
 * The four kinds count together: a project that had only an architecture decision already describes something, and the explanatory state would tell it what it already knows.
 */
const empty = computed(
  () => store.architecture().length === 0 && store.decisions().length === 0,
);
</script>

<template>
  <div class="page-architecture">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else>
      <header class="entete">
        <p class="type">Architecture</p>
        <h1>Comment le produit est construit</h1>
      </header>

      <!-- The top-bar entry does not depend on the content: this is therefore where absence is handled. An empty list reads as much as "this project describes nothing" as "loading failed", and it is the second reading that sticks. Saying what the view would hold removes both. -->
      <section v-if="empty" class="vide-instruit">
        <h2>Ce projet ne décrit pas encore son architecture</h2>
        <p class="intro">Cette vue accueille quatre natures de documents :</p>
        <dl>
          <dt>Composants</dt>
          <dd>
            ce qui existe — une application, un cluster, un espace de stockage.
          </dd>
          <dt>Flux</dt>
          <dd>ce qui s’échange entre eux, quand, et dans quel sens.</dd>
          <dt>Contexte</dt>
          <dd>la vue d’ensemble, en un seul document.</dd>
          <dt>Décisions d’architecture</dt>
          <dd>
            pourquoi le produit est construit ainsi, et ce qui a été écarté.
          </dd>
        </dl>
        <p class="amorce">
          Rien ne s’écrit ici directement : un document d’architecture naît d’un
          cadrage dont un impact le vise, et se relit avec lui. C’est ce qui le
          distingue d’une page de wiki que plus rien ne rattache à une décision.
        </p>
        <RouterLink class="action" :to="links.path('cadrages', 'nouveau')">
          Ouvrir un cadrage
        </RouterLink>
      </section>
      <template v-else>
        <section v-if="context" class="contexte">
          <RenderedMarkdown class="md" :text="context.statement" />
        </section>

        <h2 class="section">Composants</h2>
        <div class="liste">
          <RouterLink
            v-for="d in components"
            :key="d.id"
            class="ligne"
            :to="links.path('architecture', 'document', d.id)"
          >
            <span class="nom">{{ d.id }}</span>
            <span class="compte"
              >{{ store.listFlowsByComponent(d.id).length }} flux</span
            >
          </RouterLink>
          <p v-if="!components.length" class="vide">Aucun composant décrit.</p>
        </div>

        <h2 class="section">Flux</h2>
        <div class="liste">
          <RouterLink
            v-for="d in flows"
            :key="d.id"
            class="ligne"
            :to="links.path('architecture', 'document', d.id)"
          >
            <span class="nom">{{ d.id }}</span>
            <span class="compte">{{ d.components.length }} composants</span>
          </RouterLink>
          <p v-if="!flows.length" class="vide">Aucun flux décrit.</p>
        </div>

        <h2 class="section">Décisions</h2>
        <div class="liste">
          <RouterLink
            v-for="d in decisions"
            :key="d.id"
            class="ligne"
            :to="links.path('architecture', 'decision', d.id)"
          >
            <span class="nom">{{ d.id }}</span>
            <span v-if="d.status === 'abroge'" class="compte">abrogée</span>
          </RouterLink>
          <p v-if="!decisions.length" class="vide">
            Aucune décision d’architecture.
          </p>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.entete {
  margin-bottom: 28px;
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
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.015em;
}
.contexte {
  margin-bottom: 32px;
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
.vide-instruit {
  max-width: 62ch;
}
.vide-instruit h2 {
  margin: 0 0 10px;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.intro,
.amorce {
  margin: 0;
  font-size: 14px;
  color: var(--mat-sys-on-surface-variant);
}
.vide-instruit dl {
  margin: 18px 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  align-items: baseline;
}
.vide-instruit dt {
  font-size: 13.5px;
  font-weight: 500;
}
.vide-instruit dd {
  margin: 0;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
}
.action {
  display: inline-block;
  margin-top: 20px;
  padding: 8px 16px;
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 6px;
  font-size: 14px;
  text-decoration: none;
  color: inherit;
}
.action:hover {
  border-color: var(--mat-sys-primary);
  color: var(--mat-sys-primary);
}

/* The list of kinds wraps onto two lines rather than squeezing the term that names it. */
@media (max-width: 560px) {
  .vide-instruit dl {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  .vide-instruit dd {
    margin-bottom: 10px;
  }
}
</style>
