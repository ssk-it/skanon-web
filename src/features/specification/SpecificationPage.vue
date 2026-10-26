<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import { displayIdentifier } from "../../core/repo/scoping-reference";
import { SpecificationStore } from "../../core/repo/specification.store";
import { domainStyle } from "../../core/ui/domain-color";
import UiIcon from "../../ui/UiIcon.vue";
import ViewState from "../shared/ViewState.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";
import StatusChip from "../shared/StatusChip.vue";
import { specificationPageMessages } from "./specification-page.messages";

/** The latest delivered ones shown at the top: enough to see what is moving, not a list. */
const LATEST_DELIVERED = 3;

const store = inject(SpecificationStore);
const links = inject(LinksService);
const t = useMessages(specificationPageMessages);

/** The complete list: a hue is computed relative to the whole. */
const domainIds = computed(() => store.domains().map((d) => d.id));

/**
 * The latest delivered ones, by descending identifier.
 *
 * The identifier carries the year and the sequence: it gives the order without costing a call, where a date would require the history.
 */
const latestDelivered = computed(() =>
  store
    .scopings()
    .filter((c) => c.status === "livree")
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, LATEST_DELIVERED),
);

/** The other domains of a shared feature, by their name. */
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
        <h1>{{ t().title }}</h1>
        <p class="sous-titre">{{ t().subtitle }}</p>
        <p class="compte">
          {{
            t().counts(
              store.domains().length,
              store.features().length,
              store.activeRules().length,
            )
          }}
        </p>
      </header>

      <div v-if="store.specification().anomalies.length" class="anomalies">
        <UiIcon name="warning_amber" />
        <div>
          <p class="a-titre">{{ t().anomalies }}</p>
          <p
            v-for="a in store.specification().anomalies"
            :key="a"
            class="a-detail"
          >
            {{ a }}
          </p>
        </div>
      </div>

      <!-- RG-vue-ensemble-fonctionnelle: what is moving before what is. Whoever opens a project often knows it already, and comes to see what has changed or what is under discussion. -->
      <section class="bouge" :aria-label="t().moving">
        <div class="volet livres">
          <div class="volet-entete">
            <h2 class="surtitre">{{ t().recentlyDelivered }}</h2>
            <RouterLink class="suite" :to="links.path('evolution')">{{
              t().whatChanged
            }}</RouterLink>
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
            {{ t().noneDelivered }}
          </p>
        </div>

        <!-- Separate, and always there: a slot that comes and goes does not teach that it exists — RG-cadrages-ouverts-visibles. -->
        <div class="volet en-cours">
          <h2 class="surtitre">{{ t().inProgress }}</h2>
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
              {{ t().readingBranches }}
            </p>
            <template v-else>
              <p class="explication">{{ t().noneInProgress }}</p>
              <RouterLink
                class="suite"
                :to="links.path('cadrages', 'nouveau')"
                >{{ t().openScoping }}</RouterLink
              >
            </template>
          </template>
        </div>
      </section>

      <div class="grille">
        <!-- An article and not a link: the card leads to the domain by its name, and to each of its features, with no mandatory step. -->
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
                  {{ t().also(formatOtherDomains(f.domains, d.id)) }}</span
                >
              </span>
              <span
                class="nb"
                :title="t().ruleCount(store.listRulesByFeature(f.id).length)"
                >{{ store.listRulesByFeature(f.id).length }}</span
              >
            </li>
          </ul>
        </article>
        <p v-if="!store.domains().length" class="vide">
          {{ t().noDomain }}
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
/* The dotted line says "not yet": what is in it does not belong to the specification. */
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
/* On a narrow screen, the pull request and the status move below the title: beside it, they reduced it to one word per line. */
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
/* RG-couleur-porteuse: the dot and the name tell the domain. A dot rather than an edge stripe: the card now carries links, which a coloured border over its full height would tie to the domain more than it should. */
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
