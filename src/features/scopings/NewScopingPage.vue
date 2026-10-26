<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import { AuthoringService } from "../../core/repo/authoring.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { PLATFORM } from "../../platform/platform-token";
import UiButton from "../../ui/UiButton.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiIcon from "../../ui/UiIcon.vue";
import ViewState from "../shared/ViewState.vue";
import { newScopingMessages } from "./new-scoping.messages";

/**
 * Opening a scoping.
 *
 * The form asks only for what a scoping must carry from its creation: a title, what it aims at, and the expected journey. Decisions, impacts and statements are written afterwards, as the review goes — requiring them up front would confuse opening a subject with concluding it.
 */
const store = inject(SpecificationStore);
const links = inject(LinksService);
const authoring = inject(AuthoringService);
const tokens = inject(TokenService);
const opener = inject(PLATFORM).opener;
const router = useRouter();
const t = inject(LocaleService).messages(newScopingMessages);

const title = ref("");
const domains = ref("");
const goal = ref("");
const journey = ref("");

const sending = ref(false);
const error = ref<string | null>(null);

const knownDomains = computed(() => store.domains().map((d) => d.id));

/**
 * What is still missing, named rather than signalled by an inert button.
 *
 * A disabled button with no explanation leaves the author searching for which of the four fields blocks it.
 */
const missing = computed(() => {
  const m = t();
  const absent = [
    [m.aTitle, title.value],
    [m.aGoal, goal.value],
    [m.aJourney, journey.value],
  ]
    .filter(([, value]) => !value.trim())
    .map(([name]) => name);
  return absent.length ? absent.join(", ") : null;
});

async function create(): Promise<void> {
  if (sending.value || missing.value) return;

  sending.value = true;
  error.value = null;
  try {
    const cree = await authoring.createScoping({
      title: title.value,
      domains: domains.value
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      goal: goal.value,
      journey: journey.value,
    });

    // The scoping lives on its branch, invisible from the loaded specification: we send the user to the pull request, which is where it is reviewed and commented on until its delivery. Through the platform's opener: in the desktop application, `window.open` leads nowhere.
    void opener.open(cree.url);
    await router.push(links.path("cadrages"));
  } catch (e) {
    error.value =
      e instanceof GithubError || e instanceof Error ? e.message : t().failed;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="nouveau-cadrage-page">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else>
      <RouterLink class="retour" :to="links.path('cadrages')">
        <UiIcon name="arrow_back" /> {{ t().back }}
      </RouterLink>

      <header class="entete">
        <p class="type">{{ t().type }}</p>
        <h1>{{ authoring.nextId() }}</h1>
        <p class="sous-titre">{{ t().subtitle }}</p>
      </header>

      <p v-if="!tokens.present()" class="avertissement">
        <UiIcon name="lock" />
        <span>{{ t().tokenNeeded }}</span>
      </p>

      <form class="formulaire" @submit.prevent="create()">
        <UiTextField
          v-model="title"
          :label="t().title"
          name="titre"
          :hint="t().titleHint"
          :disabled="sending"
        />

        <UiTextField
          v-model="domains"
          :label="t().domains"
          name="domaines"
          :hint="t().domainsHint(knownDomains.join(', '))"
          :disabled="sending"
        />

        <UiTextField
          v-model="goal"
          :label="t().goal"
          multiline
          :rows="5"
          name="objectif"
          :hint="t().goalHint"
          :disabled="sending"
        />

        <UiTextField
          v-model="journey"
          :label="t().journey"
          multiline
          :rows="5"
          name="parcours"
          :hint="t().journeyHint"
          :disabled="sending"
        />

        <p v-if="error" class="erreur">
          <UiIcon name="error_outline" /> <span>{{ error }}</span>
        </p>

        <p v-if="missing" class="incomplet">{{ t().missing(missing) }}</p>

        <div class="actions">
          <UiButton :to="links.path('cadrages')">{{ t().cancel }}</UiButton>
          <UiButton
            variant="filled"
            type="submit"
            :disabled="sending || !!missing"
          >
            {{ sending ? t().creating : t().create }}
          </UiButton>
        </div>
      </form>

      <p class="note">
        {{ t().noteBefore }}
        <code>cadrage/{{ authoring.nextId() }}</code>
        {{ t().noteAfter }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.nouveau-cadrage-page {
  display: block;
  max-width: 70ch;
}
.retour {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
  margin-bottom: 18px;

  &:hover {
    color: var(--mat-sys-primary);
  }
  .material-symbols-outlined {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
}
.type {
  margin: 0 0 2px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
h1 {
  margin: 0 0 6px;
  font-family: var(--pc-font-mono, monospace);
  font-size: 26px;
  font-weight: 600;
}
.sous-titre {
  margin: 0 0 20px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.formulaire {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.avertissement,
.erreur {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 18px;
  padding: 11px 13px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.5;
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);

  .material-symbols-outlined {
    font-size: 19px;
    width: 19px;
    height: 19px;
    flex: none;
  }
}
.erreur {
  margin: 6px 0 0;
}
.incomplet {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.note {
  margin-top: 22px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mat-sys-on-surface-variant);

  code {
    font-family: var(--pc-font-mono, monospace);
    font-size: 12.5px;
  }
}
</style>
