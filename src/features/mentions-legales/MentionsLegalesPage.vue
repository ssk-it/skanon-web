<script setup lang="ts">
import { RouterLink } from "vue-router";
import { inject } from "../../core/injection";
import { COMPOSITION } from "../../extension/composer";
import ExternalLink from "../../ui/LienExterne.vue";
import UiIcon from "../../ui/UiIcone.vue";

/**
 * Les mentions légales de l'éditeur, reprises de https://www.ssk-it.fr/mentions-legales/ : un changement de l'une se reporte dans l'autre.
 *
 * Comme l'aide, elles ne disent que ce qui vaut pour le livrable où l'on se trouve (2026-054, décision 03) : son hébergeur, ce qu'il présente à l'éditeur et sa licence viennent de son extension (ADR-extensions-commerciales). Ce qui touche aux données reste d'accord avec la page « Fonctionnement », qui le détaille (RG-aide-fidele).
 */
const legalNotice = inject(COMPOSITION).legalNotice;
</script>

<template>
  <article class="mentions-page">
    <header class="entete">
      <h1>Mentions légales</h1>
    </header>

    <section>
      <h2><UiIcon name="badge" />Éditeur</h2>
      <dl>
        <dt>Nom</dt>
        <dd>Sébastien Skorupski</dd>
        <dt>Forme juridique</dt>
        <dd>Auto-entrepreneur</dd>
        <dt>Adresse</dt>
        <dd>
          554 rue Mathieu Pichon<br />
          43330 Saint-Ferréol-d’Auroure, France
        </dd>
        <dt>Contact</dt>
        <!-- Le domaine est ajouté par la feuille de style, comme sur ssk-it.fr : l'adresse entière n'est écrite ni dans la page ni dans le paquet. -->
        <dd class="courriel">skanon</dd>
        <dt>SIRET</dt>
        <dd>511 992 406 00047</dd>
        <dt>N° TVA intracommunautaire</dt>
        <dd>FR 78511992406</dd>
      </dl>
    </section>

    <section v-if="legalNotice.host">
      <h2><UiIcon name="cloud" />Hébergeur</h2>
      <p>{{ legalNotice.host }}</p>
    </section>

    <section>
      <h2><UiIcon name="copyright" />Propriété intellectuelle</h2>
      <p>
        Les droits d’auteur sur Skanon appartiennent à Sébastien Skorupski.
        Chaque partie est publiée sous sa propre licence.
      </p>
      <template v-for="(phrase, rang) in legalNotice.ownership" :key="rang">
        <p v-if="typeof phrase === 'string'">{{ phrase }}</p>
        <p v-else>
          {{ phrase.before
          }}<ExternalLink :href="phrase.link.href">{{
            phrase.link.label
          }}</ExternalLink
          >{{ phrase.after }}
        </p>
      </template>
      <p>
        Les composants libres sur lesquels Skanon s’appuie restent sous leurs
        propres licences. Les référentiels qu’il affiche appartiennent à leurs
        auteurs.
      </p>
    </section>

    <section>
      <h2><UiIcon name="shield" />Données personnelles</h2>
      <p>
        Skanon ne dépose aucun cookie et n’emploie aucun outil de mesure
        d’audience. Il n’a pas de serveur qui garde vos données : ce qu’il lit,
        il le tient de GitHub, et le garde sur ce poste.
        <template v-for="phrase in legalNotice.data" :key="phrase">
          {{ phrase }}
        </template>
      </p>
      <p>
        Ce que Skanon fait de vos jetons, ce qu’il garde, et à qui il parle :
        <RouterLink to="/aide">Fonctionnement de Skanon</RouterLink>.
      </p>
    </section>
  </article>
</template>

<style scoped>
.mentions-page {
  max-width: 760px;
}

h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 600;
}

section {
  margin-top: 26px;
}

h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;

  .material-symbols-outlined {
    font-size: 20px;
    width: 20px;
    height: 20px;
    color: var(--mat-sys-on-surface-variant);
  }
}

p {
  margin: 0;
  line-height: 1.6;
}

p + p {
  margin-top: 0.6em;
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 24px;
  margin: 0;
  line-height: 1.6;
}

dt {
  color: var(--mat-sys-on-surface-variant);
}

dd {
  margin: 0;
}

.courriel::after {
  content: "@ssk-it.fr";
}

/* Sur un téléphone, l'intitulé passe au-dessus de sa valeur : deux colonnes y tronqueraient l'adresse. */
@media (max-width: 599px) {
  dl {
    grid-template-columns: 1fr;
    row-gap: 0;
  }

  dd + dt {
    margin-top: 10px;
  }
}
</style>
