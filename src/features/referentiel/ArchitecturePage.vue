<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import EtatVue from "../shared/EtatVue.vue";
import MarkdownRendu from "../shared/MarkdownRendu.vue";

/**
 * L'entrée dans ce qui décrit comment le produit est construit.
 *
 * Les trois natures sont présentées séparément parce qu'on ne les consulte pas pour la même raison : le contexte pour comprendre l'ensemble, les composants pour savoir ce qui existe, les flux pour suivre un échange. Une liste unique obligerait à trier de l'œil à chaque visite.
 */
const store = inject(ReferentielStore);
const liens = inject(LiensService);

const composants = computed(() => store.listArchitectureByNature("composant"));
const flux = computed(() => store.listArchitectureByNature("flux"));
const decisions = computed(() => store.decisions());

/**
 * Le premier document de contexte, s'il y en a un.
 *
 * Le modèle n'en impose pas l'unicité : un projet peut en écrire plusieurs sans que rien ne casse. En présenter un seul ici est un choix d'affichage, et les autres restent atteignables par leur page.
 */
const contexte = computed(
  () => store.listArchitectureByNature("contexte")[0] ?? null,
);

/**
 * Vrai quand le projet ne décrit rien de son architecture.
 *
 * Les quatre natures comptent ensemble : un projet qui n'aurait qu'une décision d'architecture décrit déjà quelque chose, et l'état explicatif lui dirait ce qu'il sait déjà.
 */
const vide = computed(
  () => store.architecture().length === 0 && store.decisions().length === 0,
);
</script>

<template>
  <div class="page-architecture">
    <EtatVue v-if="store.etat() !== 'pret'" />
    <template v-else>
      <header class="entete">
        <p class="type">Architecture</p>
        <h1>Comment le produit est construit</h1>
      </header>

      <!-- L'entrée de la barre ne dépend pas du contenu : c'est donc ici que l'absence se traite. Une liste vide se lit aussi bien « ce projet ne décrit rien » que « le chargement a échoué », et c'est la seconde lecture qui reste. Dire ce que la vue accueillerait lève les deux. -->
      <section v-if="vide" class="vide-instruit">
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
        <RouterLink class="action" :to="liens.chemin('cadrages', 'nouveau')">
          Ouvrir un cadrage
        </RouterLink>
      </section>
      <template v-else>
        <section v-if="contexte" class="contexte">
          <MarkdownRendu class="md" :texte="contexte.enonce" />
        </section>

        <h2 class="section">Composants</h2>
        <div class="liste">
          <RouterLink
            v-for="d in composants"
            :key="d.id"
            class="ligne"
            :to="liens.chemin('architecture', 'document', d.id)"
          >
            <span class="nom">{{ d.id }}</span>
            <span class="compte"
              >{{ store.listFluxByComposant(d.id).length }} flux</span
            >
          </RouterLink>
          <p v-if="!composants.length" class="vide">Aucun composant décrit.</p>
        </div>

        <h2 class="section">Flux</h2>
        <div class="liste">
          <RouterLink
            v-for="d in flux"
            :key="d.id"
            class="ligne"
            :to="liens.chemin('architecture', 'document', d.id)"
          >
            <span class="nom">{{ d.id }}</span>
            <span class="compte">{{ d.composants.length }} composants</span>
          </RouterLink>
          <p v-if="!flux.length" class="vide">Aucun flux décrit.</p>
        </div>

        <h2 class="section">Décisions</h2>
        <div class="liste">
          <RouterLink
            v-for="d in decisions"
            :key="d.id"
            class="ligne"
            :to="liens.chemin('architecture', 'decision', d.id)"
          >
            <span class="nom">{{ d.id }}</span>
            <span v-if="d.statut === 'abroge'" class="compte">abrogée</span>
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

/* La liste des natures passe sur deux lignes plutôt que de comprimer le terme qui la nomme. */
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
