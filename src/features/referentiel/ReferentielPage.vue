<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/liens.service";
import { displayIdentifier } from "../../core/repo/reference-cadrage";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { domainStyle } from "../../core/ui/couleur-domaine";
import UiIcon from "../../ui/UiIcone.vue";
import ViewState from "../shared/EtatVue.vue";
import RenderedMarkdown from "../shared/MarkdownRendu.vue";
import StatusChip from "../shared/StatutChip.vue";

/** Les derniers livrés montrés en tête : de quoi voir ce qui bouge, pas une liste. */
const LATEST_DELIVERED = 3;

const store = inject(SpecificationStore);
const links = inject(LinksService);

/** La liste complète : une teinte se calcule par rapport à l'ensemble. */
const domainIds = computed(() => store.domains().map((d) => d.id));

/**
 * Les derniers livrés, par identifiant décroissant.
 *
 * L'identifiant porte l'année et la séquence : il donne l'ordre sans coûter un appel, là où une date demanderait l'historique.
 */
const latestDelivered = computed(() =>
  store
    .scopings()
    .filter((c) => c.status === "livree")
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, LATEST_DELIVERED),
);

/** Les autres domaines d'une fonctionnalité partagée, par leur nom. */
function formatOtherDomains(
  domains: readonly string[],
  current: string,
): string {
  return domains
    .filter((id) => id !== current)
    .map((id) => store.findDomain(id)?.name ?? id)
    .join(", ");
}

function show(id: string): string {
  return displayIdentifier(id, store.specification().project.prefix);
}
</script>

<template>
  <div class="page-referentiel">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else>
      <header class="entete">
        <h1>Référentiel fonctionnel</h1>
        <p class="sous-titre">
          L’état courant du produit : ce que chaque fonctionnalité fait
          aujourd’hui, et les règles qui la définissent.
        </p>
        <p class="compte">
          {{ store.domains().length }} domaines ·
          {{ store.features().length }} fonctionnalités ·
          {{ store.activeRules().length }} règles actives
        </p>
      </header>

      <div v-if="store.specification().anomalies.length" class="anomalies">
        <UiIcon name="warning_amber" />
        <div>
          <p class="a-titre">Anomalies au chargement</p>
          <p
            v-for="a in store.specification().anomalies"
            :key="a"
            class="a-detail"
          >
            {{ a }}
          </p>
        </div>
      </div>

      <!-- RG-vue-ensemble-fonctionnelle : ce qui bouge avant ce qui est. Celui qui ouvre un projet le connaît souvent déjà, et vient voir ce qui a changé ou ce qui se discute. -->
      <section class="bouge" aria-label="Ce qui bouge">
        <div class="volet livres">
          <div class="volet-entete">
            <h2 class="surtitre">Livré récemment</h2>
            <RouterLink class="suite" :to="links.path('evolution')"
              >Ce qui a changé</RouterLink
            >
          </div>
          <RouterLink
            v-for="c in latestDelivered"
            :key="c.id"
            class="ligne"
            :to="links.path('cadrages', c.id)"
          >
            <span class="cid">{{ show(c.id) }}</span>
            <span class="titre">{{ c.title }}</span>
          </RouterLink>
          <p v-if="!latestDelivered.length" class="explication">
            Aucun cadrage n’a encore été livré.
          </p>
        </div>

        <!-- À part, et toujours là : un emplacement qui va et vient n'apprend pas qu'il existe — RG-cadrages-ouverts-visibles. -->
        <div class="volet en-cours">
          <h2 class="surtitre">En cours</h2>
          <RouterLink
            v-for="c in store.scopingsInProgress()"
            :key="c.id"
            class="ligne"
            :to="links.path('cadrages', c.id)"
          >
            <span class="cid">{{ show(c.id) }}</span>
            <span class="titre">{{ c.title }}</span>
            <span class="etat">
              <span v-if="c.provenance?.pullRequest" class="branche"
                >#{{ c.provenance.pullRequest }}</span
              >
              <StatusChip :status="c.status" />
            </span>
          </RouterLink>
          <template v-if="!store.scopingsInProgress().length">
            <p v-if="store.loadingBranches()" class="explication">
              Lecture des branches en cours…
            </p>
            <template v-else>
              <p class="explication">
                Aucun cadrage n’est en discussion. Ceux qui le seront
                apparaîtront ici, marqués de leur demande de fusion, à part de
                ce que le référentiel porte déjà.
              </p>
              <RouterLink class="suite" :to="links.path('cadrages', 'nouveau')"
                >Ouvrir un cadrage</RouterLink
              >
            </template>
          </template>
        </div>
      </section>

      <div class="grille">
        <!-- Un article et non un lien : la carte mène au domaine par son nom, et à chacune de ses fonctionnalités, sans étape obligée. -->
        <article
          v-for="d in store.domains()"
          :key="d.id"
          class="carte"
          :style="domainStyle(d.id, domainIds)"
        >
          <h2>
            <RouterLink :to="links.path('referentiel', 'domaine', d.id)">{{
              d.name
            }}</RouterLink>
          </h2>
          <RenderedMarkdown class="desc md" :text="d.description" />
          <ul class="fonctionnalites">
            <li v-for="f in store.listFeaturesByDomain(d.id)" :key="f.id">
              <span>
                <RouterLink
                  :to="links.path('referentiel', 'fonctionnalite', f.id)"
                  >{{ f.name }}</RouterLink
                >
                <span v-if="formatOtherDomains(f.domains, d.id)" class="aussi">
                  · aussi {{ formatOtherDomains(f.domains, d.id) }}</span
                >
              </span>
              <span
                class="nb"
                :title="store.listRulesByFeature(f.id).length + ' règles'"
                >{{ store.listRulesByFeature(f.id).length }}</span
              >
            </li>
          </ul>
        </article>
        <p v-if="!store.domains().length" class="vide">
          Ce dépôt ne contient aucun domaine.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.entete {
  margin-bottom: 28px;
}
h1 {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.015em;
}
.sous-titre {
  margin: 0 0 10px;
  max-width: 62ch;
  color: var(--mat-sys-on-surface-variant);
  line-height: 1.55;
}
.compte {
  margin: 0;
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.anomalies {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 24px;
  border-radius: 8px;
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);
}
.a-titre {
  margin: 0 0 4px;
  font-weight: 500;
  font-size: 14px;
}
.a-detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
.grille {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
}
.bouge {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.volet {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface);
}
/* Le pointillé dit « pas encore » : ce qui s'y trouve n'appartient pas au référentiel. */
.volet.en-cours {
  border-style: dashed;
}
.volet-entete {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.surtitre {
  margin: 0 0 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.ligne {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
  color: inherit;
  text-decoration: none;
}
.ligne:hover .titre {
  color: var(--mat-sys-primary);
  text-decoration: underline;
}
.cid {
  font-family: var(--pc-mono);
  font-size: 12.5px;
  color: var(--mat-sys-on-surface-variant);
}
.titre {
  font-size: 14.5px;
  line-height: 1.4;
}
.etat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
/* Sur écran étroit, la demande de fusion et le statut passent sous le titre : à côté, ils le réduisaient à un mot par ligne. */
@media (max-width: 640px) {
  .ligne {
    grid-template-columns: 76px minmax(0, 1fr);
  }
  .etat {
    grid-column: 2;
  }
}
.branche {
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.explication {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.suite {
  font-size: 13px;
  color: var(--mat-sys-primary);
  text-decoration: none;
  align-self: flex-start;
}
.suite:hover {
  text-decoration: underline;
}
.carte {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 22px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);
}
/* RG-couleur-porteuse : la puce et le nom disent le domaine. Une puce plutôt qu'un liseré : la carte porte désormais des liens, qu'un bord coloré sur toute sa hauteur rattacherait au domaine plus qu'il ne faut. */
.carte h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 500;
}
.carte h2 a {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--pc-domaine);
  text-decoration: none;
}
.carte h2 a:hover {
  text-decoration: underline;
}
.carte h2 a::before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--pc-domaine);
}
.fonctionnalites {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  border-top: 1px solid var(--mat-sys-outline-variant);
}
.fonctionnalites li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
}
.fonctionnalites li:last-child {
  border-bottom: none;
}
.fonctionnalites a {
  color: inherit;
  text-decoration: none;
}
.fonctionnalites a:hover {
  color: var(--mat-sys-primary);
  text-decoration: underline;
}
.aussi {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.nb {
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.desc {
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.vide {
  color: var(--mat-sys-on-surface-variant);
}
</style>
