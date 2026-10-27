<script setup lang="ts">
import { computed } from "vue";
import { TokenService } from "../../core/github/token.service";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { COMPOSITION } from "../../extension/composer";
import { PLATFORM } from "../../platform/platform-token";
import UiIcon from "../../ui/UiIcon.vue";
import { helpMessages } from "./help.messages";

/**
 * How Skanon works, on one page: what it does with tokens, what it keeps on the machine, how it finds projects, whom it talks to.
 *
 * A statement, in the sense of RG-secret-conserve-localement: every sentence must remain true of the code, in each language. What differs from one target to the other is said for the target one is on, not for both — readers need not know which one they use to understand what concerns them (RG-aide-fidele).
 */
const locale = inject(LocaleService);
const t = locale.messages(helpMessages);
const onDesktop = inject(PLATFORM).target === "bureau";
/** Where the platform keeps its own copy of the repos, how it reads them, and where the token goes for it, are the deliverable's to say: the page leaves out what describes its own channels (2026-067). */
const ownCopy = inject(PLATFORM).contentSource !== null;
/** What the deliverable says about itself — its hosting, its updates, its licence —, which the page renders without knowing it (ADR-extensions-commerciales), in the displayed language. */
const brought = inject(COMPOSITION).help;
const help = computed(() => {
  const language = locale.language();
  return {
    jetons: brought.jetons.map((phrase) => phrase[language]),
    cache: brought.cache.map((phrase) => phrase[language]),
    communications: brought.communications.map((phrase) => phrase[language]),
  };
});
/** In the browser, tokens are sealed by a passkey or kept in clear: the help says which is the case (RG-secret-conserve-localement). */
const sealedTokens = computed(() => inject(TokenService).form() === "scelle");
</script>

<template>
  <article class="aide-page">
    <header class="entete">
      <h1>{{ t().title }}</h1>
      <p class="sous-titre">{{ t().subtitle }}</p>
    </header>

    <section>
      <h2><UiIcon name="key" />{{ t().tokens.title }}</h2>
      <ul>
        <li>{{ t().tokens.publicRead }}</li>
        <li v-if="onDesktop">{{ t().tokens.desktopVault }}</li>
        <template v-else-if="sealedTokens">
          <li>{{ t().tokens.sealed }}</li>
          <li>{{ t().tokens.passkeyLost }}</li>
          <li>{{ t().tokens.optOut }}</li>
        </template>
        <template v-else>
          <li>{{ t().tokens.inClear }}</li>
          <li>{{ t().tokens.canSeal }}</li>
          <li>{{ t().tokens.projectRequires }}</li>
          <li>{{ t().tokens.optOut }}</li>
        </template>
        <li v-if="!onDesktop">{{ t().tokens.preferLimited }}</li>
        <li v-if="!ownCopy">
          {{ t().tokens.sentOnlyTo.before }}<code>api.github.com</code
          >{{ t().tokens.sentOnlyTo.after }}
        </li>
        <li>{{ t().tokens.scope }}</li>
        <li>{{ t().tokens.signOut }}</li>
        <li v-for="phrase in help.jetons" :key="phrase">{{ phrase }}</li>
      </ul>
    </section>

    <section>
      <h2><UiIcon name="cached" />{{ t().cache.title }}</h2>
      <ul>
        <template v-if="!ownCopy">
          <li>{{ t().cache.byHash }}</li>
          <li>{{ t().cache.tree }}</li>
          <li>
            {{ t().cache.publicFiles.before
            }}<code>raw.githubusercontent.com</code
            >{{ t().cache.publicFiles.after }}
          </li>
        </template>
        <li>{{ t().cache.offline }}</li>
        <li v-if="!ownCopy">{{ t().cache.eviction }}</li>
        <li v-if="!onDesktop && sealedTokens">
          {{ t().cache.sealedContents }}
        </li>
        <li>{{ t().cache.recent }}</li>
        <li v-for="phrase in help.cache" :key="phrase">{{ phrase }}</li>
      </ul>
    </section>

    <section>
      <h2><UiIcon name="travel_explore" />{{ t().discovery.title }}</h2>
      <ul>
        <li>{{ t().discovery.knownFirst }}</li>
        <li>
          {{ t().discovery.probed.before }}<code>ssk-canon.yml</code
          >{{ t().discovery.probed.after }}
        </li>
        <li>{{ t().discovery.order }}</li>
        <li>{{ t().discovery.withoutToken }}</li>
      </ul>
    </section>

    <section>
      <h2><UiIcon name="lan" />{{ t().communications.title }}</h2>
      <ul>
        <li><code>api.github.com</code>{{ t().communications.api }}</li>
        <li v-if="!ownCopy">
          <code>raw.githubusercontent.com</code>{{ t().communications.raw }}
        </li>
        <li>
          <code>avatars.githubusercontent.com</code
          >{{ t().communications.avatars }}
        </li>
        <li v-for="phrase in help.communications" :key="phrase">
          {{ phrase }}
        </li>
        <li>{{ t().communications.nothingElse }}</li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.aide-page {
  max-width: 760px;
}

h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 600;
}

.sous-titre {
  margin: 0 0 8px;
  line-height: 1.55;
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

ul {
  margin: 0;
  padding-left: 1.3em;
  line-height: 1.6;
}

li + li {
  margin-top: 0.4em;
}

code {
  font-family: var(--pc-mono);
  font-size: 0.87em;
  background: var(--mat-sys-surface-container);
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
