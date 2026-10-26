<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { COMPOSITION } from "../../extension/composer";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiIcon from "../../ui/UiIcon.vue";
import { legalNoticeMessages } from "./legal-notice.messages";

/**
 * The publisher's legal notice, taken from https://www.ssk-it.fr/mentions-legales/: a change to one is carried over to the other. The English one is a translation, and says so (RG-textes-traduits).
 *
 * Like the help, it says only what holds for the deliverable one is on (2026-054, decision 03): its host, what it presents of the publisher and its licence come from its extension (ADR-extensions-commerciales). What concerns data stays consistent with the « Fonctionnement » page, which details it (RG-aide-fidele).
 */
const locale = inject(LocaleService);
const t = locale.messages(legalNoticeMessages);
const brought = inject(COMPOSITION).legalNotice;
const legalNotice = computed(() => {
  const language = locale.language();
  return {
    host: brought.host?.[language] ?? null,
    data: brought.data.map((phrase) => phrase[language]),
    ownership: brought.ownership.map((phrase) => phrase[language]),
  };
});
</script>

<template>
  <article class="mentions-page">
    <header class="entete">
      <h1>{{ t().title }}</h1>
      <p v-if="t().translation" class="traduction">{{ t().translation }}</p>
    </header>

    <section>
      <h2><UiIcon name="badge" />{{ t().publisher }}</h2>
      <dl>
        <dt>{{ t().name }}</dt>
        <dd>Sébastien Skorupski</dd>
        <dt>{{ t().legalForm }}</dt>
        <dd>{{ t().legalFormValue }}</dd>
        <dt>{{ t().address }}</dt>
        <dd>
          554 rue Mathieu Pichon<br />
          43330 Saint-Ferréol-d’Auroure, France
        </dd>
        <dt>{{ t().contact }}</dt>
        <!-- The domain is added by the stylesheet, as on ssk-it.fr: the full address is written neither in the page nor in the bundle. -->
        <dd class="courriel">skanon</dd>
        <dt>SIRET</dt>
        <dd>511 992 406 00047</dd>
        <dt>{{ t().vat }}</dt>
        <dd>FR 78511992406</dd>
      </dl>
    </section>

    <section v-if="legalNotice.host">
      <h2><UiIcon name="cloud" />{{ t().host }}</h2>
      <p>{{ legalNotice.host }}</p>
    </section>

    <section>
      <h2><UiIcon name="copyright" />{{ t().ownership }}</h2>
      <p>{{ t().copyright }}</p>
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
      <p>{{ t().components }}</p>
    </section>

    <section>
      <h2><UiIcon name="shield" />{{ t().personalData }}</h2>
      <p>
        {{ t().noTracking }}
        <template v-for="phrase in legalNotice.data" :key="phrase">
          {{ phrase }}
        </template>
      </p>
      <p>
        {{ t().seeHelp }}
        <RouterLink to="/aide">{{ t().help }}</RouterLink>.
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

.traduction {
  color: var(--mat-sys-on-surface-variant);
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

/* On a phone, the label moves above its value: two columns would truncate the address there. */
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
